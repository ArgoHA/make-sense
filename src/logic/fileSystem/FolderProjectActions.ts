import {store} from '../../index';
import {PopupWindowType} from '../../data/enums/PopupWindowType';
import {ProjectType} from '../../data/enums/ProjectType';
import {Notification} from '../../data/enums/Notification';
import {NotificationsDataMap} from '../../data/info/NotificationsData';
import {NotificationUtil} from '../../utils/NotificationUtil';
import {updateActivePopupType, updateProjectData} from '../../store/general/actionCreators';
import {
    updateActiveImageIndex,
    updateActiveLabelId,
    updateActiveLabelNameId,
    updateActiveLabelType,
    updateFirstLabelCreatedFlag,
    updateImageData,
    updateLabelNames
} from '../../store/labels/actionCreators';
import {submitNewNotification} from '../../store/notifications/actionCreators';
import {ImageData} from '../../store/labels/types';
import {GeneralSelector} from '../../store/selectors/GeneralSelector';
import {LabelsSelector} from '../../store/selectors/LabelsSelector';
import {PlatformModel} from '../../staticModels/PlatformModel';
import {EditorModel} from '../../staticModels/EditorModel';
import {PopupActions} from '../actions/PopupActions';
import {ImageRepository} from '../imageRepository/ImageRepository';
import {FileSystemRepository} from '../imageRepository/FileSystemRepository';
import {FileSystemImporter, FolderLoadResult} from './FileSystemImporter';
import {FileSystemHandleStorage} from './FileSystemHandleStorage';
import {FileSystemPermissionUtil} from './FileSystemPermissionUtil';
import {FolderAutoSaveEngine} from './FolderAutoSaveEngine';

// Bridges the File System Access API and the store: opening a folder as a
// project, reconnecting after a reload and deleting images from disk.
export class FolderProjectActions {
    public static pendingReconnectHandle: FileSystemDirectoryHandle | null = null;

    public static async openFolder(): Promise<void> {
        if (!PlatformModel.supportsFileSystemAccessAPI) {
            FolderProjectActions.notifyError(Notification.FILE_SYSTEM_API_UNSUPPORTED);
            return;
        }
        let directoryHandle: FileSystemDirectoryHandle;
        try {
            directoryHandle = await FileSystemImporter.pickDirectory();
        } catch {
            // AbortError - the user closed the picker
            return;
        }
        await FolderProjectActions.openFolderFromHandle(directoryHandle);
    }

    public static async openFolderFromHandle(directoryHandle: FileSystemDirectoryHandle): Promise<void> {
        store.dispatch(updateActivePopupType(PopupWindowType.LOADER));
        let result: FolderLoadResult;
        try {
            FileSystemRepository.connect(directoryHandle);
            result = await FileSystemImporter.loadFolder(directoryHandle);
        } catch {
            FileSystemRepository.reset();
            store.dispatch(updateActivePopupType(null));
            FolderProjectActions.notifyError(Notification.FOLDER_LOAD_ERROR);
            return;
        }
        if (result.imagesData.length === 0) {
            FileSystemRepository.reset();
            store.dispatch(updateActivePopupType(null));
            FolderProjectActions.notifyError(Notification.FOLDER_EMPTY_ERROR);
            return;
        }

        // The editor mounts when projectData.type flips, so it is dispatched
        // last - images and annotations are already in place by then.
        store.dispatch(updateImageData(result.imagesData));
        store.dispatch(updateActiveImageIndex(0));
        store.dispatch(updateActiveLabelType(result.activeLabelType));
        if (result.labelNames !== null) {
            store.dispatch(updateLabelNames(result.labelNames));
        }
        store.dispatch(updateProjectData({
            ...store.getState().general.projectData,
            type: ProjectType.OBJECT_DETECTION
        }));

        FolderAutoSaveEngine.attach();
        FolderProjectActions.pendingReconnectHandle = null;
        FileSystemHandleStorage.save({
            handle: directoryHandle,
            name: directoryHandle.name,
            savedAt: Date.now()
        }).catch(() => {
            // best effort - reconnect just won't be offered after a reload
        });

        if (result.labelNames === null) {
            store.dispatch(updateActivePopupType(PopupWindowType.INSERT_LABEL_NAMES));
        } else {
            store.dispatch(updateActivePopupType(null));
        }

        store.dispatch(submitNewNotification(NotificationUtil.createMessageNotification({
            header: 'Folder connected',
            description: `Loaded ${result.imagesData.length} image(s)`
                + (result.labelNames !== null ? ` and ${result.annotationCount} annotation(s)` : '')
                + ` from "${directoryHandle.name}".`
        })));
        if (result.parseErrorCount > 0) {
            FolderProjectActions.notifyWarning(Notification.ANNOTATION_FILE_PARSE_ERROR);
        }
        if (result.baseNameCollisions.length > 0) {
            FolderProjectActions.notifyWarning(Notification.FOLDER_BASENAME_COLLISION);
        }
    }

    public static async reconnectAccepted(): Promise<void> {
        const handle: FileSystemDirectoryHandle | null = FolderProjectActions.pendingReconnectHandle;
        PopupActions.close();
        if (!handle) return;
        // Still inside the click task - requestPermission needs the gesture.
        const granted: boolean = await FileSystemPermissionUtil.requestInGesture(handle);
        if (!granted) {
            FolderProjectActions.notifyError(Notification.FOLDER_PERMISSION_DENIED);
            return;
        }
        await FolderProjectActions.openFolderFromHandle(handle);
    }

    public static async deleteActiveImage(): Promise<void> {
        if (!FileSystemRepository.isConnected()) return;
        if (EditorModel.viewPortActionsDisabled) return;
        const imageData: ImageData | null = LabelsSelector.getActiveImageData();
        if (!imageData) return;

        EditorModel.viewPortActionsDisabled = true;
        try {
            // Flush (not cancel) so un-persisted edits to other images from
            // the debounce window reach disk before files start moving.
            await FolderAutoSaveEngine.flushPending();
            FolderAutoSaveEngine.detach();

            await FolderProjectActions.moveImageToTrash(imageData);

            const imagesData: ImageData[] = LabelsSelector.getImagesData();
            const activeIndex: number = LabelsSelector.getActiveImageIndex();
            const nextImagesData: ImageData[] = imagesData.filter((item: ImageData) => item.id !== imageData.id);
            if (nextImagesData.length === 0) {
                FolderProjectActions.tearDownProject();
            } else {
                // newIndex is in range for both the old and new arrays, so no
                // intermediate render can see an out-of-range active index.
                const newIndex: number = Math.min(activeIndex, nextImagesData.length - 1);
                store.dispatch(updateActiveImageIndex(newIndex));
                store.dispatch(updateImageData(nextImagesData));
                store.dispatch(updateActiveLabelId(null));
            }
            ImageRepository.removeById(imageData.id);
            FileSystemRepository.removeImageEntry(imageData.id);
        } catch {
            FolderProjectActions.notifyError(Notification.IMAGE_DELETE_ERROR);
        } finally {
            EditorModel.viewPortActionsDisabled = false;
            if (FileSystemRepository.isConnected() && GeneralSelector.getProjectType() != null) {
                FolderAutoSaveEngine.attach();
            }
        }
    }

    private static async moveImageToTrash(imageData: ImageData): Promise<void> {
        const directoryHandle: FileSystemDirectoryHandle | null = FileSystemRepository.getDirectoryHandle();
        const fileHandle: FileSystemFileHandle | null = FileSystemRepository.getFileHandleById(imageData.id);
        const baseName: string | null = FileSystemRepository.getBaseNameById(imageData.id);
        if (!directoryHandle || !fileHandle) {
            throw new Error('Image is not backed by the connected folder');
        }
        const trashDir: FileSystemDirectoryHandle = await directoryHandle
            .getDirectoryHandle(FileSystemRepository.TRASH_DIR_NAME, {create: true});

        const file: File = await fileHandle.getFile();
        const imageCopyHandle: FileSystemFileHandle = await trashDir.getFileHandle(fileHandle.name, {create: true});
        const imageWritable: FileSystemWritableFileStream = await imageCopyHandle.createWritable();
        await imageWritable.write(file);
        await imageWritable.close();

        try {
            const labelsDir: FileSystemDirectoryHandle = await directoryHandle
                .getDirectoryHandle(FileSystemRepository.LABELS_DIR_NAME);
            const labelFileHandle: FileSystemFileHandle = await labelsDir.getFileHandle(`${baseName}.txt`);
            const labelContent: string = await (await labelFileHandle.getFile()).text();
            const labelCopyHandle: FileSystemFileHandle = await trashDir.getFileHandle(`${baseName}.txt`, {create: true});
            const labelWritable: FileSystemWritableFileStream = await labelCopyHandle.createWritable();
            await labelWritable.write(labelContent);
            await labelWritable.close();
            await labelsDir.removeEntry(`${baseName}.txt`);
        } catch {
            // no labels dir / no label file for this image
        }

        await directoryHandle.removeEntry(fileHandle.name);
    }

    private static tearDownProject(): void {
        // Mirrors ExitProjectPopup.onAccept - an editor without images cannot
        // render. The persisted handle is kept so reconnect can still be
        // offered on the next visit.
        FolderAutoSaveEngine.detach();
        FileSystemRepository.reset();
        store.dispatch(updateActiveLabelNameId(null));
        store.dispatch(updateLabelNames([]));
        store.dispatch(updateProjectData({
            ...store.getState().general.projectData,
            type: null
        }));
        store.dispatch(updateActiveImageIndex(null));
        store.dispatch(updateImageData([]));
        store.dispatch(updateFirstLabelCreatedFlag(false));
    }

    private static notifyError(notification: Notification): void {
        store.dispatch(submitNewNotification(NotificationUtil.createErrorNotification(
            NotificationsDataMap[notification]
        )));
    }

    private static notifyWarning(notification: Notification): void {
        store.dispatch(submitNewNotification(NotificationUtil.createWarningNotification(
            NotificationsDataMap[notification]
        )));
    }
}

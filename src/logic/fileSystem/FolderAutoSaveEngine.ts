import {debounce} from 'lodash';
import {store} from '../../index';
import {ImageData, LabelName, LabelsState} from '../../store/labels/types';
import {GeneralSelector} from '../../store/selectors/GeneralSelector';
import {submitNewNotification} from '../../store/notifications/actionCreators';
import {NotificationUtil} from '../../utils/NotificationUtil';
import {NotificationsDataMap} from '../../data/info/NotificationsData';
import {Notification} from '../../data/enums/Notification';
import {FileSystemRepository} from '../imageRepository/FileSystemRepository';
import {FileSystemPermissionUtil} from './FileSystemPermissionUtil';
import {FileSystemLabelWriter} from './FileSystemLabelWriter';

// Silently writes YOLO label files straight into the connected folder as the
// user annotates - the dataset folder itself is the persistent store, so an
// accidental back-swipe or refresh loses nothing.
export class FolderAutoSaveEngine {
    private static readonly ENABLED_KEY: string = 'make-sense.folder-autosave.enabled';
    private static readonly DEBOUNCE_MS: number = 1500;

    private static unsubscribeStore: (() => void) | null = null;
    private static lastLabelsRef: LabelsState | null = null;
    private static baselineLabelNames: LabelName[] | null = null;
    private static baselineImagesData: Record<string, ImageData> = {};
    private static paused: boolean = false;
    // Persist runs are chained so a new pass never starts before the previous
    // one's writes finish - per-image files cannot interleave.
    private static persistQueue: Promise<void> = Promise.resolve();

    public static isEnabled(): boolean {
        // Default to enabled - only an explicit 'false' turns it off.
        try {
            return window.localStorage.getItem(FolderAutoSaveEngine.ENABLED_KEY) !== 'false';
        } catch {
            return true;
        }
    }

    public static setEnabled(enabled: boolean): void {
        try {
            window.localStorage.setItem(FolderAutoSaveEngine.ENABLED_KEY, enabled ? 'true' : 'false');
        } catch {
            // ignore storage errors (e.g. private mode)
        }
        if (enabled) {
            FolderAutoSaveEngine.paused = false;
            if (FileSystemRepository.isConnected()) {
                // Edits made while the toggle was off are unknown - flush everything.
                FolderAutoSaveEngine.rewriteAll();
            }
        } else {
            FolderAutoSaveEngine.scheduleSave.cancel();
        }
    }

    public static attach(): void {
        if (FolderAutoSaveEngine.unsubscribeStore) return;
        FolderAutoSaveEngine.paused = false;
        FolderAutoSaveEngine.resetBaseline();
        FolderAutoSaveEngine.unsubscribeStore = store.subscribe(FolderAutoSaveEngine.handleStoreChange);
        document.addEventListener('visibilitychange', FolderAutoSaveEngine.handleVisibilityChange);
    }

    public static detach(): void {
        FolderAutoSaveEngine.scheduleSave.cancel();
        if (FolderAutoSaveEngine.unsubscribeStore) {
            FolderAutoSaveEngine.unsubscribeStore();
            FolderAutoSaveEngine.unsubscribeStore = null;
        }
        document.removeEventListener('visibilitychange', FolderAutoSaveEngine.handleVisibilityChange);
    }

    // Runs any pending debounced save now and returns the write chain, so
    // callers (image delete) can await outstanding work instead of racing it.
    public static flushPending(): Promise<void> {
        FolderAutoSaveEngine.scheduleSave.flush();
        return FolderAutoSaveEngine.persistQueue;
    }

    public static rewriteAll(): void {
        FolderAutoSaveEngine.enqueuePersist(true);
    }

    private static resetBaseline(): void {
        const labelsState: LabelsState = store.getState().labels;
        FolderAutoSaveEngine.lastLabelsRef = labelsState;
        FolderAutoSaveEngine.baselineLabelNames = labelsState.labels;
        FolderAutoSaveEngine.baselineImagesData = {};
        labelsState.imagesData.forEach((imageData: ImageData) => {
            FolderAutoSaveEngine.baselineImagesData[imageData.id] = imageData;
        });
    }

    private static handleStoreChange = (): void => {
        const labelsState: LabelsState = store.getState().labels;
        // The labels slice keeps reference identity unless an annotation/label
        // action fires, so non-annotation dispatches (zoom, resize, popups)
        // are skipped without any work.
        if (labelsState === FolderAutoSaveEngine.lastLabelsRef) return;
        FolderAutoSaveEngine.lastLabelsRef = labelsState;
        FolderAutoSaveEngine.scheduleSave();
    };

    private static handleVisibilityChange = (): void => {
        // Cheap insurance against closing the tab inside the debounce window.
        if (document.visibilityState === 'hidden') {
            FolderAutoSaveEngine.scheduleSave.flush();
        }
    };

    private static scheduleSave = debounce((): void => {
        FolderAutoSaveEngine.enqueuePersist(false);
    }, FolderAutoSaveEngine.DEBOUNCE_MS);

    private static enqueuePersist(rewriteAll: boolean): void {
        FolderAutoSaveEngine.persistQueue = FolderAutoSaveEngine.persistQueue
            .then(() => FolderAutoSaveEngine.persist(rewriteAll))
            .catch(() => {
                // A failed write must never crash the store subscriber.
                FolderAutoSaveEngine.pause();
            });
    }

    private static async persist(rewriteAll: boolean): Promise<void> {
        if (!FolderAutoSaveEngine.isEnabled() || FolderAutoSaveEngine.paused) return;
        if (!FileSystemRepository.isConnected()) return;
        if (GeneralSelector.getProjectType() == null) return;

        const directoryHandle: FileSystemDirectoryHandle = FileSystemRepository.getDirectoryHandle();
        if (!(await FileSystemPermissionUtil.verify(directoryHandle))) {
            FolderAutoSaveEngine.pause();
            return;
        }

        const labelsState: LabelsState = store.getState().labels;
        const labelNames: LabelName[] = labelsState.labels;
        // YOLO class ids are positions in labels.txt - any change to the names
        // list invalidates every per-image file on disk, not only edited ones.
        const fullRewrite: boolean = rewriteAll || labelNames !== FolderAutoSaveEngine.baselineLabelNames;

        if (labelNames.length > 0) {
            await FileSystemLabelWriter.writeLabelsNamesFile(directoryHandle, labelNames);
        }
        for (const imageData of labelsState.imagesData) {
            if (fullRewrite || FolderAutoSaveEngine.imageChanged(imageData)) {
                await FileSystemLabelWriter.writeImageLabelFile(imageData, labelNames);
            }
        }

        FolderAutoSaveEngine.baselineLabelNames = labelNames;
        FolderAutoSaveEngine.baselineImagesData = {};
        labelsState.imagesData.forEach((imageData: ImageData) => {
            FolderAutoSaveEngine.baselineImagesData[imageData.id] = imageData;
        });
    }

    private static imageChanged(imageData: ImageData): boolean {
        const baseline: ImageData = FolderAutoSaveEngine.baselineImagesData[imageData.id];
        if (!baseline) return true;
        return baseline.labelRects !== imageData.labelRects
            || baseline.labelPolygons !== imageData.labelPolygons
            || baseline.labelNameIds !== imageData.labelNameIds;
    }

    private static pause(): void {
        if (FolderAutoSaveEngine.paused) return;
        FolderAutoSaveEngine.paused = true;
        store.dispatch(submitNewNotification(NotificationUtil.createWarningNotification(
            NotificationsDataMap[Notification.FOLDER_AUTOSAVE_PAUSED]
        )));
    }
}

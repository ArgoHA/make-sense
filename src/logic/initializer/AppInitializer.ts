import {updateWindowSize} from '../../store/general/actionCreators';
import {ContextManager} from '../context/ContextManager';
import {store} from '../../index';
import {PlatformUtil} from '../../utils/PlatformUtil';
import {PlatformModel} from '../../staticModels/PlatformModel';
import {EventType} from '../../data/enums/EventType';
import {GeneralSelector} from '../../store/selectors/GeneralSelector';
import {EnvironmentUtil} from '../../utils/EnvironmentUtil';
import {updateActivePopupType} from '../../store/general/actionCreators';
import {PopupWindowType} from '../../data/enums/PopupWindowType';
import {FileSystemHandleStorage, FolderConnectionRecord} from '../fileSystem/FileSystemHandleStorage';
import {FileSystemRepository} from '../imageRepository/FileSystemRepository';
import {FolderAutoSaveEngine} from '../fileSystem/FolderAutoSaveEngine';
import {FolderProjectActions} from '../fileSystem/FolderProjectActions';

export class AppInitializer {
    public static inti():void {
        AppInitializer.handleResize();
        AppInitializer.detectDeviceParams();
        AppInitializer.handleAccidentalPageExit();
        window.addEventListener(EventType.RESIZE, AppInitializer.handleResize);
        window.addEventListener(EventType.MOUSE_WHEEL, AppInitializer.disableGenericScrollZoom,{passive:false});
        window.addEventListener(EventType.KEY_DOWN, AppInitializer.disableUnwantedKeyBoardBehaviour);
        window.addEventListener(EventType.KEY_PRESS, AppInitializer.disableUnwantedKeyBoardBehaviour);
        ContextManager.init();
        AppInitializer.offerFolderReconnect();
    }

    private static offerFolderReconnect = () => {
        if (!PlatformModel.supportsFileSystemAccessAPI) return;
        FileSystemHandleStorage.load()
            .then(async (record: FolderConnectionRecord | null) => {
                // Only prompt when a folder was connected before and the user
                // has not already loaded a project in this session.
                if (!record || !record.handle) return;
                if (GeneralSelector.getProjectType() != null) return;
                try {
                    const permission: PermissionState = await record.handle.queryPermission({mode: 'readwrite'});
                    if (permission === 'denied') {
                        FileSystemHandleStorage.clear().catch(() => undefined);
                        return;
                    }
                    FolderProjectActions.pendingReconnectHandle = record.handle;
                    store.dispatch(updateActivePopupType(PopupWindowType.RECONNECT_FOLDER));
                } catch {
                    FileSystemHandleStorage.clear().catch(() => undefined);
                }
            })
            .catch(() => {
                // ignore - reconnect is a best-effort convenience
            });
    };

    private static handleAccidentalPageExit = () => {
        window.onbeforeunload = (event) => {
            const projectType = GeneralSelector.getProjectType();
            // With folder autosave on, the work is already on disk - no need to nag.
            const folderAutoSaveActive = FileSystemRepository.isConnected() && FolderAutoSaveEngine.isEnabled();
            if (projectType != null && !folderAutoSaveActive && EnvironmentUtil.isProd()) {
                event.preventDefault();
                event.returnValue = '';
            }
        }
    };

    private static handleResize = () => {
        store.dispatch(updateWindowSize({
            width: window.innerWidth,
            height: window.innerHeight
        }));
    };

    private static disableUnwantedKeyBoardBehaviour = (event: KeyboardEvent) => {
        if (['=', '+', '-'].includes(event.key)) {
            if (event.ctrlKey || (PlatformModel.isMac && event.metaKey)) {
                event.preventDefault();
            }
        }
    };

    private static disableGenericScrollZoom = (event: MouseEvent) => {
        if (event.ctrlKey || (PlatformModel.isMac && event.metaKey)) {
            event.preventDefault();
        }
    };

    private static detectDeviceParams = () => {
        const userAgent: string = window.navigator.userAgent;
        PlatformModel.mobileDeviceData = PlatformUtil.getMobileDeviceData(userAgent);
        PlatformModel.isMac = PlatformUtil.isMac(userAgent);
        PlatformModel.isSafari = PlatformUtil.isSafari(userAgent);
        PlatformModel.isFirefox = PlatformUtil.isFirefox(userAgent);
        PlatformModel.supportsFileSystemAccessAPI = PlatformUtil.supportsFileSystemAccessAPI();
    };
}
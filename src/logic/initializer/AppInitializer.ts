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
import {AutoSaveEngine} from '../autosave/AutoSaveEngine';
import {AutoSaveStorage} from '../autosave/AutoSaveStorage';
import {autoSaveSnapshotHasAnnotations, AutoSaveSnapshot} from '../autosave/AutoSaveTypes';

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
        AutoSaveEngine.init();
        AppInitializer.offerSessionRestore();
    }

    private static offerSessionRestore = () => {
        if (!AutoSaveEngine.isEnabled()) return;
        AutoSaveStorage.load()
            .then((snapshot: AutoSaveSnapshot | null) => {
                // Only prompt when there is real annotation work to recover and the
                // user has not already loaded a project in this session.
                if (snapshot
                    && autoSaveSnapshotHasAnnotations(snapshot)
                    && GeneralSelector.getProjectType() == null) {
                    AutoSaveEngine.setPendingRestore(snapshot);
                    store.dispatch(updateActivePopupType(PopupWindowType.RESTORE_SESSION));
                }
            })
            .catch(() => {
                // ignore - autosave is a best-effort safety net
            });
    };

    private static handleAccidentalPageExit = () => {
        window.onbeforeunload = (event) => {
            const projectType = GeneralSelector.getProjectType();
            if (projectType != null && EnvironmentUtil.isProd()) {
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
    };
}
import {debounce} from 'lodash';
import {store} from '../../index';
import {ImageData, LabelsState} from '../../store/labels/types';
import {GeneralSelector} from '../../store/selectors/GeneralSelector';
import {AutoSaveStorage} from './AutoSaveStorage';
import {AUTO_SAVE_SNAPSHOT_VERSION, AutoSaveSnapshot} from './AutoSaveTypes';

// Silently persists the current annotation session (annotations only, no image
// binaries) to IndexedDB so accidental navigation/refresh does not lose work.
// Enabled by default; the snapshot is offered for restore on the next app load.
export class AutoSaveEngine {
    private static readonly ENABLED_KEY: string = 'make-sense.autosave.enabled';
    private static readonly DEBOUNCE_MS: number = 1500;

    private static lastLabelsRef: LabelsState | null = null;
    private static unsubscribe: (() => void) | null = null;
    private static lastSavedAt: number | null = null;
    private static pendingRestore: AutoSaveSnapshot | null = null;

    public static isEnabled(): boolean {
        // Default to enabled - only an explicit 'false' turns it off.
        try {
            return window.localStorage.getItem(AutoSaveEngine.ENABLED_KEY) !== 'false';
        } catch {
            return true;
        }
    }

    public static setEnabled(enabled: boolean): void {
        try {
            window.localStorage.setItem(AutoSaveEngine.ENABLED_KEY, enabled ? 'true' : 'false');
        } catch {
            // ignore storage errors (e.g. private mode)
        }
        if (enabled) {
            AutoSaveEngine.persist();
        } else {
            AutoSaveEngine.clear();
        }
    }

    public static getLastSavedAt(): number | null {
        return AutoSaveEngine.lastSavedAt;
    }

    public static getPendingRestore(): AutoSaveSnapshot | null {
        return AutoSaveEngine.pendingRestore;
    }

    public static setPendingRestore(snapshot: AutoSaveSnapshot | null): void {
        AutoSaveEngine.pendingRestore = snapshot;
    }

    public static init(): void {
        if (AutoSaveEngine.unsubscribe) return;
        AutoSaveEngine.lastLabelsRef = store.getState().labels;
        AutoSaveEngine.unsubscribe = store.subscribe(AutoSaveEngine.handleStoreChange);
    }

    private static handleStoreChange = (): void => {
        const labels: LabelsState = store.getState().labels;
        // The labels slice keeps reference identity unless an annotation/label
        // action fires, so non-annotation dispatches (zoom, resize, popups) are
        // skipped without any serialization work.
        if (labels === AutoSaveEngine.lastLabelsRef) return;
        AutoSaveEngine.lastLabelsRef = labels;
        AutoSaveEngine.scheduleSave();
    };

    private static scheduleSave = debounce((): void => {
        AutoSaveEngine.persist();
    }, AutoSaveEngine.DEBOUNCE_MS);

    private static persist(): void {
        if (!AutoSaveEngine.isEnabled()) return;
        if (GeneralSelector.getProjectType() == null) return;
        const snapshot: AutoSaveSnapshot = AutoSaveEngine.buildSnapshot();
        if (snapshot.images.length === 0) return;
        AutoSaveStorage.save(snapshot)
            .then(() => {
                AutoSaveEngine.lastSavedAt = snapshot.timestamp;
            })
            .catch(() => {
                // ignore storage errors (e.g. quota exceeded / private mode)
            });
    }

    private static buildSnapshot(): AutoSaveSnapshot {
        const labelsState: LabelsState = store.getState().labels;
        const projectData = store.getState().general.projectData;
        return {
            version: AUTO_SAVE_SNAPSHOT_VERSION,
            timestamp: Date.now(),
            projectData,
            activeLabelType: labelsState.activeLabelType,
            activeImageIndex: labelsState.activeImageIndex,
            labelNames: labelsState.labels,
            images: labelsState.imagesData.map((imageData: ImageData) => ({
                fileName: imageData.fileData.name,
                fileSize: imageData.fileData.size,
                labelRects: imageData.labelRects,
                labelPoints: imageData.labelPoints,
                labelLines: imageData.labelLines,
                labelPolygons: imageData.labelPolygons,
                labelNameIds: imageData.labelNameIds
            }))
        };
    }

    public static clear(): void {
        AutoSaveEngine.lastSavedAt = null;
        AutoSaveEngine.pendingRestore = null;
        AutoSaveStorage.clear().catch(() => {
            // ignore storage errors
        });
    }
}

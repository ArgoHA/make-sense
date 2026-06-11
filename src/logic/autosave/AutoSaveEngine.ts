import {debounce} from 'lodash';
import JSZip from 'jszip';
import {saveAs} from 'file-saver';
import {store} from '../../index';
import {ImageData, LabelName, LabelPolygon, LabelRect, LabelsState} from '../../store/labels/types';
import {ISize} from '../../interfaces/ISize';
import {GeneralSelector} from '../../store/selectors/GeneralSelector';
import {LabelsSelector} from '../../store/selectors/LabelsSelector';
import {ImageRepository} from '../imageRepository/ImageRepository';
import {RectLabelsExporter} from '../export/RectLabelsExporter';
import {YOLOPolygonExporter} from '../export/polygon/YOLOPolygonExporter';

// Periodically re-exports the whole project as a YOLO zip and downloads it
// under a single fixed name (labels_autosave.zip), so accidental navigation
// or refresh never loses annotation work. The per-image label format and the
// coordinate math are reused verbatim from the manual YOLO exporters; a
// labels.txt with the class names is added so the zip is self-contained and
// can be re-imported.
export class AutoSaveEngine {
    private static readonly ENABLED_KEY: string = 'make-sense.autosave.enabled';
    private static readonly DEBOUNCE_MS: number = 2000;
    private static readonly FILE_NAME: string = 'labels_autosave.zip';

    private static unsubscribe: (() => void) | null = null;
    private static lastImagesDataRef: ImageData[] | null = null;
    private static lastLabelNamesRef: LabelName[] | null = null;

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
            // Save once immediately so the file reflects the current state.
            AutoSaveEngine.save();
        } else {
            AutoSaveEngine.scheduleSave.cancel();
        }
    }

    public static init(): void {
        if (AutoSaveEngine.unsubscribe) return;
        const labelsState: LabelsState = store.getState().labels;
        AutoSaveEngine.lastImagesDataRef = labelsState.imagesData;
        AutoSaveEngine.lastLabelNamesRef = labelsState.labels;
        AutoSaveEngine.unsubscribe = store.subscribe(AutoSaveEngine.handleStoreChange);
    }

    private static handleStoreChange = (): void => {
        const labelsState: LabelsState = store.getState().labels;
        // Only annotation edits (imagesData) or class-name edits (labels)
        // matter. Navigation and selection keep both references intact, so
        // they are skipped and do not trigger a download.
        if (labelsState.imagesData === AutoSaveEngine.lastImagesDataRef
            && labelsState.labels === AutoSaveEngine.lastLabelNamesRef) {
            return;
        }
        AutoSaveEngine.lastImagesDataRef = labelsState.imagesData;
        AutoSaveEngine.lastLabelNamesRef = labelsState.labels;
        AutoSaveEngine.scheduleSave();
    };

    private static scheduleSave = debounce((): void => {
        AutoSaveEngine.save();
    }, AutoSaveEngine.DEBOUNCE_MS);

    private static save(): void {
        if (!AutoSaveEngine.isEnabled()) return;
        if (GeneralSelector.getProjectType() == null) return;

        const labelNames: LabelName[] = LabelsSelector.getLabelNames();
        const imagesData: ImageData[] = LabelsSelector.getImagesData();

        const zip = new JSZip();
        let fileCount = 0;
        imagesData.forEach((imageData: ImageData) => {
            const content: string | null = AutoSaveEngine.buildImageLabelContent(imageData, labelNames);
            if (content) {
                const fileName: string = imageData.fileData.name.replace(/\.[^/.]+$/, '.txt');
                zip.file(fileName, content);
                fileCount += 1;
            }
        });

        // Nothing annotated yet - skip the download instead of dropping an
        // empty zip into the user's Downloads folder.
        if (fileCount === 0) return;

        if (labelNames.length > 0) {
            zip.file('labels.txt', labelNames.map((labelName: LabelName) => labelName.name).join('\n'));
        }

        zip.generateAsync({type: 'blob'})
            .then((content: Blob) => saveAs(content, AutoSaveEngine.FILE_NAME))
            .catch(() => {
                // ignore - autosave is a best-effort safety net
            });
    }

    // Auto-per-image: polygons when the image has any, otherwise boxes.
    private static buildImageLabelContent(imageData: ImageData, labelNames: LabelName[]): string | null {
        if (!imageData.loadStatus) return null;
        const image: HTMLImageElement = ImageRepository.getById(imageData.id);
        if (!image) return null;
        const imageSize: ISize = {width: image.width, height: image.height};

        const polygons: LabelPolygon[] = imageData.labelPolygons
            .filter((labelPolygon: LabelPolygon) => labelPolygon.labelId !== null);
        if (polygons.length > 0) {
            return polygons
                .map((labelPolygon: LabelPolygon) =>
                    YOLOPolygonExporter.wrapPolygonLabelIntoYOLO(labelPolygon, labelNames, imageSize))
                .join('\n');
        }

        const rects: LabelRect[] = imageData.labelRects
            .filter((labelRect: LabelRect) => labelRect.labelId !== null);
        if (rects.length > 0) {
            return rects
                .map((labelRect: LabelRect) =>
                    RectLabelsExporter.wrapRectLabelIntoYOLO(labelRect, labelNames, imageSize))
                .join('\n');
        }

        return null;
    }
}

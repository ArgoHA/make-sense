import {store} from '../../index';
import {ImageData, LabelMask, LabelName} from '../../store/labels/types';
import {updateActiveLabelNameId, updateImageDataById} from '../../store/labels/actionCreators';
import {LabelsSelector} from '../../store/selectors/LabelsSelector';
import {EditorData} from '../../data/EditorData';
import {BaseRenderEngine} from './BaseRenderEngine';
import {RenderEngineUtil} from '../../utils/RenderEngineUtil';
import {LabelType} from '../../data/enums/LabelType';
import {EditorActions} from '../actions/EditorActions';
import {RenderEngineSettings} from '../../settings/RenderEngineSettings';
import {MaskData, MaskRepository} from '../imageRepository/MaskRepository';
import {MaskUtil} from '../../utils/MaskUtil';
import {MaskEditorModel} from '../../staticModels/MaskEditorModel';
import {LabelUtil} from '../../utils/LabelUtil';
import {DrawUtil} from '../../utils/DrawUtil';
import {IPoint} from '../../interfaces/IPoint';
import {IRect} from '../../interfaces/IRect';
import {findIndex} from 'lodash';

export class SemanticSegmentationRenderEngine extends BaseRenderEngine {

    // =================================================================================================================
    // STATE
    // =================================================================================================================

    private isPainting = false;
    private strokeClassIndex: number = null;
    private strokeImageId: string = null;
    private lastPointOnImage: IPoint = null;

    public constructor(canvas: HTMLCanvasElement) {
        super(canvas);
        this.labelType = LabelType.SEMANTIC_SEGMENTATION;
    }

    // =================================================================================================================
    // EVENT HANDLERS
    // =================================================================================================================

    public mouseDownHandler(data: EditorData): void {
        if (!RenderEngineUtil.isMouseOverImage(data)) return;

        const imageData: ImageData = LabelsSelector.getActiveImageData();
        if (!imageData || !imageData.loadStatus) return;

        const classIndex: number = this.resolveStrokeClassIndex(data);
        if (classIndex === null) return;

        let labelMask: LabelMask = imageData.labelMask;
        if (!labelMask) {
            labelMask = LabelUtil.createLabelMask();
            imageData.labelMask = labelMask;
            store.dispatch(updateImageDataById(imageData.id, imageData));
        }

        let maskData: MaskData = MaskRepository.getById(labelMask.id);
        if (!maskData) {
            maskData = MaskUtil.createEmptyMaskData(data.realImageSize, LabelsSelector.getLabelNames());
            MaskRepository.store(labelMask.id, maskData);
        }

        this.isPainting = true;
        this.strokeClassIndex = classIndex;
        this.strokeImageId = imageData.id;
        EditorActions.setViewPortActionsDisabledStatus(true);

        const pointOnImage: IPoint = RenderEngineUtil
            .transferPointFromViewPortContentToImage(data.mousePositionOnViewPortContent, data);
        this.paintStroke(maskData, pointOnImage, pointOnImage, data);
        this.lastPointOnImage = pointOnImage;
    }

    public mouseMoveHandler(data: EditorData): void {
        if (!this.isPainting) return;

        const maskData: MaskData = this.getStrokeMaskData();
        if (!maskData) return;

        const pointOnImage: IPoint = RenderEngineUtil
            .transferPointFromViewPortContentToImage(data.mousePositionOnViewPortContent, data);
        this.paintStroke(maskData, this.lastPointOnImage, pointOnImage, data);
        this.lastPointOnImage = pointOnImage;
    }

    public mouseUpHandler(data: EditorData): void {
        if (this.isPainting) {
            const maskData: MaskData = this.getStrokeMaskData();
            const imageData: ImageData = LabelsSelector.getImageDataById(this.strokeImageId);
            if (!!maskData && !!imageData && !!imageData.labelMask) {
                const newImageData: ImageData = {
                    ...imageData,
                    labelMask: {
                        ...imageData.labelMask,
                        classIndices: MaskUtil.extractClassIndices(maskData.buffer)
                    }
                };
                store.dispatch(updateImageDataById(newImageData.id, newImageData));
            }
        }
        this.isPainting = false;
        this.strokeClassIndex = null;
        this.strokeImageId = null;
        this.lastPointOnImage = null;
        EditorActions.setViewPortActionsDisabledStatus(false);
    }

    // =================================================================================================================
    // RENDERING
    // =================================================================================================================

    public render(data: EditorData): void {
        const imageData: ImageData = LabelsSelector.getActiveImageData();
        if (!!imageData && !!imageData.labelMask && imageData.labelMask.isVisible) {
            const maskData: MaskData = MaskRepository.getById(imageData.labelMask.id);
            if (maskData) {
                MaskUtil.refreshOverlayIfNeeded(maskData, LabelsSelector.getLabelNames());
                const ctx: CanvasRenderingContext2D = this.canvas.getContext('2d');
                const imageRect: IRect = data.viewPortContentImageRect;
                ctx.save();
                ctx.imageSmoothingEnabled = false;
                ctx.globalAlpha = RenderEngineSettings.MASK_OVERLAY_ALPHA;
                ctx.drawImage(maskData.overlay, imageRect.x, imageRect.y, imageRect.width, imageRect.height);
                ctx.restore();
            }
        }
        this.renderBrushCursor(data);
    }

    private renderBrushCursor(data: EditorData): void {
        if (!data.mousePositionOnViewPortContent || !RenderEngineUtil.isMouseOverImage(data)) return;

        const isErasing: boolean = this.isPainting ?
            this.strokeClassIndex === MaskUtil.IGNORE_CLASS_INDEX : this.isAltKeyDown(data);
        const color: string = isErasing ?
            '#ffffff' : this.resolveActiveClassColor();
        DrawUtil.drawCircle(
            this.canvas,
            data.mousePositionOnViewPortContent,
            MaskEditorModel.brushRadius,
            0,
            360,
            RenderEngineSettings.LINE_THICKNESS,
            color
        );
        RenderEngineUtil.wrapDefaultCursorStyleInCancel(data);
        this.canvas.style.cursor = 'none';
    }

    // =================================================================================================================
    // HELPERS
    // =================================================================================================================

    public isInProgress(): boolean {
        return this.isPainting;
    }

    private paintStroke(maskData: MaskData, from: IPoint, to: IPoint, data: EditorData): void {
        const scale: number = RenderEngineUtil.calculateImageScale(data);
        const radiusOnImage: number = Math.max(1, MaskEditorModel.brushRadius * scale);
        const dirtyRect: IRect = MaskUtil.stampStroke(
            maskData.buffer,
            {width: maskData.width, height: maskData.height},
            from,
            to,
            radiusOnImage,
            this.strokeClassIndex
        );
        MaskUtil.renderOverlayRegion(maskData, dirtyRect, LabelsSelector.getLabelNames());
    }

    private getStrokeMaskData(): MaskData | null {
        const imageData: ImageData = LabelsSelector.getImageDataById(this.strokeImageId);
        if (!imageData || !imageData.labelMask) return null;
        return MaskRepository.getById(imageData.labelMask.id) || null;
    }

    private resolveStrokeClassIndex(data: EditorData): number | null {
        if (this.isAltKeyDown(data)) {
            return MaskUtil.IGNORE_CLASS_INDEX;
        }
        const labelNames: LabelName[] = LabelsSelector.getLabelNames();
        if (labelNames.length === 0) return null;

        const activeLabelNameId: string = LabelsSelector.getActiveLabelNameId();
        const classIndex: number = findIndex(labelNames, {id: activeLabelNameId});
        if (classIndex === -1) {
            store.dispatch(updateActiveLabelNameId(labelNames[0].id));
            return 0;
        }
        return classIndex;
    }

    private resolveActiveClassColor(): string {
        const labelNames: LabelName[] = LabelsSelector.getLabelNames();
        const classIndex: number = findIndex(labelNames, {id: LabelsSelector.getActiveLabelNameId()});
        return MaskUtil.resolveClassColor(classIndex === -1 ? 0 : classIndex, labelNames);
    }

    private isAltKeyDown(data: EditorData): boolean {
        return !!data.event && (data.event as MouseEvent).altKey;
    }
}

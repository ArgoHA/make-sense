import {RenderEngineSettings} from '../settings/RenderEngineSettings';

export class MaskEditorModel {
    // brush radius in view port pixels; kept outside redux like the other mutable editor state
    public static brushRadius: number = RenderEngineSettings.MASK_BRUSH_DEFAULT_RADIUS_PX;
}

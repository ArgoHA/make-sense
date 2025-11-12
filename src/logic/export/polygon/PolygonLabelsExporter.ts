import {AnnotationFormatType} from "../../../data/enums/AnnotationFormatType";
import {VGGExporter} from "./VGGExporter";
import {COCOExporter} from "./COCOExporter";
import {YOLOPolygonExporter} from "./YOLOPolygonExporter";

export class PolygonLabelsExporter {
    public static export(exportFormatType: AnnotationFormatType): void {
        switch (exportFormatType) {
            case AnnotationFormatType.VGG:
                VGGExporter.export();
                break;
            case AnnotationFormatType.COCO:
                COCOExporter.export();
                break;
            case AnnotationFormatType.YOLO_POLYGON:
                YOLOPolygonExporter.export();
                break;
            default:
                return;
        }
    }
}

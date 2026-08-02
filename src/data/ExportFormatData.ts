import {ILabelFormatData} from '../interfaces/ILabelFormatData';
import {LabelType} from './enums/LabelType';
import {AnnotationFormatType} from './enums/AnnotationFormatType';

export type ExportFormatDataMap = Record<LabelType, ILabelFormatData[]>;

export const ExportFormatData: ExportFormatDataMap = {
    [LabelType.RECT]: [
        {
            type: AnnotationFormatType.YOLO,
            label: 'A .zip package containing files in YOLO format.'
        },
        {
            type: AnnotationFormatType.VOC,
            label: 'A .zip package containing files in VOC XML format.'
        },
        {
            type: AnnotationFormatType.CSV,
            label: 'Single CSV file.'
        }
    ],
    [LabelType.POINT]: [
        {
            type: AnnotationFormatType.CSV,
            label: 'Single CSV file.'
        }
    ],
    [LabelType.LINE]: [
        {
            type: AnnotationFormatType.CSV,
            label: 'Single CSV file.'
        }
    ],
    [LabelType.POLYGON]: [
        {
            type: AnnotationFormatType.VGG,
            label: 'Single file in VGG JSON format.'
        },
        {
            type: AnnotationFormatType.COCO,
            label: 'Single file in COCO JSON format.'
        },
        {
            type: AnnotationFormatType.YOLO_POLYGON,
            label: 'A .zip package containing files in YOLO polygon format.'
        }
    ],
    [LabelType.IMAGE_RECOGNITION]: [
        {
            type: AnnotationFormatType.CSV,
            label: 'Single CSV file.'
        },
        {
            type: AnnotationFormatType.JSON,
            label: 'Single JSON file.'
        }
    ],
    [LabelType.SEMANTIC_SEGMENTATION]: [
        {
            type: AnnotationFormatType.PNG_MASK,
            label: 'A .zip package containing single-channel PNG masks (D-FINE-seg format).'
        }
    ]
}

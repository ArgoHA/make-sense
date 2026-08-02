import {LabelType} from './enums/LabelType';
import {ILabelFormatData} from '../interfaces/ILabelFormatData';
import {AnnotationFormatType} from './enums/AnnotationFormatType';

export type ImportFormatDataMap = Record<LabelType, ILabelFormatData[]>

export const ImportFormatData: ImportFormatDataMap = {
    [LabelType.RECT]: [
        {
            type: AnnotationFormatType.COCO,
            label: 'Single file in COCO JSON format.'
        },
        {
            type: AnnotationFormatType.YOLO,
            label: 'Multiple files in YOLO format along with labels names definition - labels.txt file.'
        },
        {
            type: AnnotationFormatType.VOC,
            label: 'Multiple files in VOC XML format.'
        }
    ],
    [LabelType.POINT]: [],
    [LabelType.LINE]: [],
    [LabelType.POLYGON]: [
        {
            type: AnnotationFormatType.COCO,
            label: 'Single file in COCO JSON format.'
        },
        {
            type: AnnotationFormatType.YOLO_POLYGON,
            label: 'Multiple files in YOLO polygon format along with labels names definition - labels.txt file.'
        }
    ],
    [LabelType.IMAGE_RECOGNITION]: [],
    [LabelType.SEMANTIC_SEGMENTATION]: [
        {
            type: AnnotationFormatType.PNG_MASK,
            label: 'Multiple single-channel PNG masks (D-FINE-seg format) - pixel value is class index, 255 is ' +
                'ignore. Optionally include labels.txt with class names.'
        }
    ]
}

import JSZip from 'jszip';
import {saveAs} from 'file-saver';
import {ImageData, LabelName} from '../../../store/labels/types';
import {LabelsSelector} from '../../../store/selectors/LabelsSelector';
import {ExporterUtil} from '../../../utils/ExporterUtil';
import {PngUtil} from '../../../utils/PngUtil';
import {AnnotationFormatType} from '../../../data/enums/AnnotationFormatType';
import {MaskData, MaskRepository} from '../../imageRepository/MaskRepository';

export class SemanticSegmentationExporter {
    public static export(exportFormatType: AnnotationFormatType): void {
        if (exportFormatType === AnnotationFormatType.PNG_MASK) {
            SemanticSegmentationExporter.exportAsPNGMasks();
        }
    }

    private static exportAsPNGMasks(): void {
        const zip = new JSZip();
        LabelsSelector.getImagesData().forEach((imageData: ImageData) => {
            if (!imageData.labelMask) return;
            const maskData: MaskData = MaskRepository.getById(imageData.labelMask.id);
            if (!maskData) return;
            const fileName: string = imageData.fileData.name.replace(/\.[^/.]+$/, '.png');
            try {
                zip.file(fileName, PngUtil.encodeGrayscalePNG(maskData.buffer, maskData.width, maskData.height));
            } catch (error) {
                throw new Error(error as string);
            }
        });

        // class index -> name mapping, matching the pixel values in the masks
        const labelNames: LabelName[] = LabelsSelector.getLabelNames();
        if (labelNames.length !== 0) {
            zip.file('labels.txt', labelNames.map((labelName: LabelName) => labelName.name).join('\n'));
        }

        try {
            zip.generateAsync({type: 'blob'})
                .then((content: Blob) => {
                    saveAs(content, `${ExporterUtil.getExportFileName()}.zip`);
                });
        } catch (error) {
            throw new Error(error as string);
        }
    }
}

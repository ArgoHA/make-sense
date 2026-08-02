import { v4 as uuidv4 } from 'uuid';
import {LabelsSelector} from '../../../store/selectors/LabelsSelector';
import {ImageData, LabelMask, LabelName} from '../../../store/labels/types';
import {ImageDataUtil} from '../../../utils/ImageDataUtil';
import {FileUtil} from '../../../utils/FileUtil';
import {LabelUtil} from '../../../utils/LabelUtil';
import {MaskUtil} from '../../../utils/MaskUtil';
import {ArrayUtil} from '../../../utils/ArrayUtil';
import {Settings} from '../../../settings/Settings';
import {AnnotationImporter} from '../AnnotationImporter';
import {ImageRepository} from '../../imageRepository/ImageRepository';
import {MaskRepository} from '../../imageRepository/MaskRepository';
import {YOLOUtils} from '../yolo/YOLOUtils';
import {ISize} from '../../../interfaces/ISize';
import {
    MaskFileLoadError,
    MaskSizeMismatchError,
    NoMaskFilesProvidedError,
    NoMasksMatchedError
} from './PNGMaskErrors';

type FileByName = { [name: string]: File; };

type DecodedMask = {
    imageData: ImageData;
    buffer: Uint8Array;
    size: ISize;
    classIndices: number[];
}

// D-FINE-seg semantic segmentation format: one single-channel uint8 png per image (same file name
// stem), pixel value = class index, 255 = ignore. Class names may be provided via labels.txt.
export class PNGMaskImporter extends AnnotationImporter {
    public import(
        filesData: File[],
        onSuccess: (imagesData: ImageData[], labelNames: LabelName[]) => any,
        onFailure: (error?: Error) => any
    ): void {
        (async () => {
            try {
                const labelsFile: File = filesData.find((f: File) => f.name.toLowerCase() === 'labels.txt');
                const maskFiles: File[] = filesData.filter((f: File) =>
                    f !== labelsFile && f.name.toLowerCase().endsWith('.png')
                );
                if (maskFiles.length === 0) throw new NoMaskFilesProvidedError();

                const inputImagesData: ImageData[] = LabelsSelector.getImagesData();
                const cleanImageData: ImageData[] = inputImagesData.map((item: ImageData) =>
                    ImageDataUtil.cleanAnnotations(item)
                );

                const masksByName: FileByName = maskFiles.reduce((acc: FileByName, f: File) => {
                    acc[f.name] = f;
                    return acc;
                }, {});

                await ImageDataUtil.loadMissingImages(cleanImageData);

                const decodedMasks: DecodedMask[] = [];
                for (const imageData of cleanImageData) {
                    const stem: string = FileUtil.extractFileName(imageData.fileData.name);
                    const maskFile: File = masksByName[`${stem}.png`];
                    if (!maskFile) continue;

                    const maskImage: HTMLImageElement = await FileUtil.loadImage(maskFile)
                        .catch(() => { throw new MaskFileLoadError(maskFile.name); });
                    const image: HTMLImageElement = ImageRepository.getById(imageData.id);
                    if (maskImage.width !== image.width || maskImage.height !== image.height) {
                        throw new MaskSizeMismatchError(maskFile.name);
                    }

                    const buffer: Uint8Array = MaskUtil.decodeImageToMaskBuffer(maskImage);
                    decodedMasks.push({
                        imageData,
                        buffer,
                        size: {width: maskImage.width, height: maskImage.height},
                        classIndices: MaskUtil.extractClassIndices(buffer)
                    });
                }
                if (decodedMasks.length === 0) throw new NoMasksMatchedError();

                const maxClassIndex: number = decodedMasks.reduce((max: number, decoded: DecodedMask) => {
                    return decoded.classIndices.length === 0 ?
                        max : Math.max(max, decoded.classIndices[decoded.classIndices.length - 1]);
                }, -1);
                const labelNames: LabelName[] = await PNGMaskImporter.resolveLabelNames(labelsFile, maxClassIndex);

                decodedMasks.forEach((decoded: DecodedMask) => {
                    const labelMask: LabelMask = LabelUtil.createLabelMask(decoded.classIndices);
                    decoded.imageData.labelMask = labelMask;
                    MaskRepository.store(labelMask.id, MaskUtil.createMaskData(decoded.buffer, decoded.size, labelNames));
                });

                onSuccess(
                    ImageDataUtil.arrange(cleanImageData, inputImagesData.map((i: ImageData) => i.id)),
                    labelNames
                );
            } catch (error) {
                onFailure(error as Error);
            }
        })();
    }

    private static async resolveLabelNames(labelsFile: File | undefined, maxClassIndex: number): Promise<LabelName[]> {
        let labelNames: LabelName[];
        if (labelsFile) {
            const content: string = await FileUtil.readFile(labelsFile);
            labelNames = YOLOUtils.parseLabelsNamesFromString(content);
        } else {
            // fall back to the project labels so class index <-> label mapping stays stable
            labelNames = [...LabelsSelector.getLabelNames()];
        }
        const targetLength: number = Math.max(maxClassIndex + 1, labelNames.length, 1);
        for (let classIndex = labelNames.length; classIndex < targetLength; classIndex++) {
            labelNames.push({id: uuidv4(), name: `class_${classIndex}`, color: null});
        }
        return labelNames.map((labelName: LabelName, classIndex: number) => ({
            ...labelName,
            color: labelName.color ?? ArrayUtil.getByInfiniteIndex(Settings.LABEL_COLORS_PALETTE, classIndex)
        }));
    }
}

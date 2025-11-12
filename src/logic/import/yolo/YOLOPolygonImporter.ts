// YOLOPolygonImporter.ts
import { v4 as uuidv4 } from 'uuid';
import {LabelsSelector} from '../../../store/selectors/LabelsSelector';
import {ImageData, LabelName} from '../../../store/labels/types';
import {ArrayUtil, PartitionResult} from '../../../utils/ArrayUtil';
import {ImageDataUtil} from '../../../utils/ImageDataUtil';
import {LabelUtil} from '../../../utils/LabelUtil';
import {LabelType} from '../../../data/enums/LabelType';
import {AnnotationImporter, ImportResult} from '../AnnotationImporter';
import {
    NoLabelNamesFileProvidedError,
    YOLOLabelsReadingError,
    YOLOAnnotationsLoadingError
} from './YOLOErrors';
import {YOLOUtils} from './YOLOUtils';
import {ISize} from '../../../interfaces/ISize';
import {Settings} from '../../../settings/Settings';
import {ImageRepository} from '../../imageRepository/ImageRepository';

type LabelNameMap = { [classIdx: number]: LabelName; };
type FileByName = { [name: string]: File; };

export class YOLOPolygonImporter extends AnnotationImporter {
    public import(
        filesData: File[],
        onSuccess: (imagesData: ImageData[], labelNames: LabelName[]) => any,
        onFailure: (error?: Error) => any
    ): void {
        (async () => {
            try {
                // 1) Separate labels.txt and annotation .txt files
                const labelsFile = filesData.find(f => f.name.toLowerCase() === 'labels.txt');
                if (!labelsFile) throw new NoLabelNamesFileProvidedError();

                const annotationFiles = filesData.filter(f =>
                    f !== labelsFile && f.name.toLowerCase().endsWith('.txt')
                );
                // Allow case when user imported only labels first; still useful to resolve label palette.
                // But we’ll continue if there are annotation files.

                // 2) Read label names
                const labelNames = await this.readLabels(labelsFile);

                // Map class index -> LabelName with deterministic colors
                const labelNameMap: LabelNameMap = this.toLabelNameMap(labelNames);

                // 3) Prepare image data maps
                const inputImagesData: ImageData[] = LabelsSelector.getImagesData();
                const cleanImageData: ImageData[] = inputImagesData.map((item: ImageData) =>
                    ImageDataUtil.cleanAnnotations(item)
                );

                // Build a quick lookup: annotationFileName -> File
                const annByName: FileByName = annotationFiles.reduce((acc: FileByName, f: File) => {
                    acc[f.name] = f;
                    return acc;
                }, {});

                // 4) Load images into ImageRepository before accessing them
                await ImageDataUtil.loadMissingImages(cleanImageData);

                // 5) Apply polygons to images where we find a matching .txt
                // A matching file is "<image-stem>.txt"
                const updatedImages: ImageData[] = await this.applyYOLOPolygons(cleanImageData, annByName, labelNames);

                // 6) Done
                onSuccess(
                    ImageDataUtil.arrange(updatedImages, inputImagesData.map(i => i.id)),
                    Object.values(labelNameMap)
                );
            } catch (err) {
                onFailure(err as Error);
            }
        })();
    }

    private async readLabels(labelsFile: File): Promise<LabelName[]> {
        try {
            const content = await this.readFileText(labelsFile);
            return YOLOUtils.parseLabelsNamesFromString(content);
        } catch {
            throw new YOLOLabelsReadingError();
        }
    }

    private toLabelNameMap(labelNames: LabelName[]): LabelNameMap {
        // Preserve incoming ids/colors; if you want fresh palette per class index, regenerate here.
        // Also ensure they have stable colors across sessions.
        const map: LabelNameMap = {};
        labelNames.forEach((ln, idx) => {
            map[idx] = {
                id: ln.id ?? uuidv4(),
                name: ln.name,
                color: ln.color ?? ArrayUtil.getByInfiniteIndex(Settings.LABEL_COLORS_PALETTE, idx)
            };
        });
        return map;
    }

    private async applyYOLOPolygons(
        images: ImageData[],
        annByName: FileByName,
        labelNames: LabelName[]
    ): Promise<ImageData[]> {
        const promises = images.map(async (img) => {
            const stem = this.stemOf(img.fileData.name);
            const annFile = annByName[`${stem}.txt`];
            if (!annFile) return img; // no annotations for this image

            const text = await this.readFileText(annFile);

            // Get the actual loaded image from the repository
            const image: HTMLImageElement = ImageRepository.getById(img.id);
            const imageSize: ISize = {
                width: image.width,
                height: image.height
            };

            // Parse as polygons; each line is one instance polygon
            const polygons = YOLOUtils.parseYOLOPolygonAnnotationsFromString(
                text, labelNames, imageSize, img.fileData.name
            );

            // Push to image
            polygons.forEach(poly => {
                img.labelPolygons.push(poly);
            });

            return img;
        });

        return Promise.all(promises);
    }

    private stemOf(filename: string): string {
        const idx = filename.lastIndexOf('.');
        return idx === -1 ? filename : filename.slice(0, idx);
    }

    private readFileText(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new YOLOAnnotationsLoadingError(`Unable to read ${file.name}`));
            reader.onloadend = (evt: any) => resolve(evt.target.result as string);
            reader.readAsText(file);
        });
    }
}

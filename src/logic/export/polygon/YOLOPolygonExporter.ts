import {ImageData, LabelName, LabelPolygon} from '../../../store/labels/types';
import {ImageRepository} from '../../imageRepository/ImageRepository';
import JSZip from 'jszip';
import {saveAs} from 'file-saver';
import {LabelsSelector} from '../../../store/selectors/LabelsSelector';
import {ExporterUtil} from '../../../utils/ExporterUtil';
import {findIndex} from 'lodash';
import {ISize} from '../../../interfaces/ISize';
import {NumberUtil} from '../../../utils/NumberUtil';
import {IPoint} from '../../../interfaces/IPoint';

export class YOLOPolygonExporter {
    public static export(): void {
        const zip = new JSZip();
        LabelsSelector.getImagesData()
            .forEach((imageData: ImageData) => {
                const fileContent: string = YOLOPolygonExporter.wrapPolygonLabelsIntoYOLO(imageData);
                if (fileContent) {
                    const fileName: string = imageData.fileData.name.replace(/\.[^/.]+$/, '.txt');
                    try {
                        zip.file(fileName, fileContent);
                    } catch (error) {
                        throw new Error(error as string);
                    }
                }
            });

        try {
            zip.generateAsync({type: 'blob'})
                .then((content: Blob) => {
                    saveAs(content, `${ExporterUtil.getExportFileName()}.zip`);
                });
        } catch (error) {
            throw new Error(error as string);
        }
    }

    public static wrapPolygonLabelIntoYOLO(
        labelPolygon: LabelPolygon,
        labelNames: LabelName[],
        imageSize: ISize
    ): string {
        const snapAndFix = (value: number) => NumberUtil.snapValueToRange(value, 0, 1).toFixed(6);
        const classIdx: string = findIndex(labelNames, {id: labelPolygon.labelId}).toString();

        // Convert vertices to normalized coordinates
        const normalizedCoords: string[] = [];

        // Process vertices, excluding the last one if it's a duplicate of the first (closing point)
        const vertices = labelPolygon.vertices;
        const vertexCount = vertices.length;
        const lastIndex = vertexCount - 1;

        // Check if last vertex is duplicate of first (polygon closed)
        const isDuplicate = vertexCount > 1 &&
            vertices[0].x === vertices[lastIndex].x &&
            vertices[0].y === vertices[lastIndex].y;

        const endIndex = isDuplicate ? lastIndex : vertexCount;

        for (let i = 0; i < endIndex; i++) {
            const vertex = vertices[i];
            const normalizedX = vertex.x / imageSize.width;
            const normalizedY = vertex.y / imageSize.height;

            normalizedCoords.push(snapAndFix(normalizedX));
            normalizedCoords.push(snapAndFix(normalizedY));
        }

        return [classIdx, ...normalizedCoords].join(' ');
    }

    private static wrapPolygonLabelsIntoYOLO(imageData: ImageData): string {
        if (imageData.labelPolygons.length === 0 || !imageData.loadStatus)
            return null;

        const labelNames: LabelName[] = LabelsSelector.getLabelNames();
        const image: HTMLImageElement = ImageRepository.getById(imageData.id);
        const imageSize: ISize = {width: image.width, height: image.height};

        const labelPolygonsString: string[] = imageData.labelPolygons
            .filter((labelPolygon: LabelPolygon) => labelPolygon.labelId !== null)
            .map((labelPolygon: LabelPolygon) => {
                return YOLOPolygonExporter.wrapPolygonLabelIntoYOLO(labelPolygon, labelNames, imageSize);
            });

        return labelPolygonsString.join('\n');
    }
}

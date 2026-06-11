import {ImageData, LabelName, LabelPolygon, LabelRect} from '../../store/labels/types';
import {ISize} from '../../interfaces/ISize';
import {ImageRepository} from '../imageRepository/ImageRepository';
import {FileSystemRepository} from '../imageRepository/FileSystemRepository';
import {RectLabelsExporter} from '../export/RectLabelsExporter';
import {YOLOPolygonExporter} from '../export/polygon/YOLOPolygonExporter';

export class FileSystemLabelWriter {
    public static async writeLabelsNamesFile(
        directoryHandle: FileSystemDirectoryHandle,
        labelNames: LabelName[]
    ): Promise<void> {
        const content: string = labelNames.map((labelName: LabelName) => labelName.name).join('\n');
        const fileHandle: FileSystemFileHandle = await directoryHandle
            .getFileHandle(FileSystemRepository.LABELS_FILE_NAME, {create: true});
        const writable: FileSystemWritableFileStream = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
    }

    // Writes labels/<base>.txt for the image - polygons when the image has
    // any, boxes otherwise. Empty content removes a stale file instead.
    public static async writeImageLabelFile(imageData: ImageData, labelNames: LabelName[]): Promise<void> {
        const baseName: string | null = FileSystemRepository.getBaseNameById(imageData.id);
        if (!baseName) return;
        const image: HTMLImageElement = ImageRepository.getById(imageData.id);
        // A never-loaded image cannot carry edits (annotated images were
        // loaded at folder open), and YOLO output needs the image size.
        if (!image) return;
        const imageSize: ISize = {width: image.width, height: image.height};
        const content: string = FileSystemLabelWriter.buildImageLabelFileContent(imageData, labelNames, imageSize);

        if (content.length === 0) {
            if (FileSystemRepository.hasLabelFile(imageData.id)) {
                const labelsDir: FileSystemDirectoryHandle = await FileSystemRepository.getOrCreateLabelsDir();
                try {
                    await labelsDir.removeEntry(`${baseName}.txt`);
                } catch {
                    // NotFound - already gone
                }
                FileSystemRepository.setHasLabelFile(imageData.id, false);
            }
            return;
        }

        const labelsDir: FileSystemDirectoryHandle = await FileSystemRepository.getOrCreateLabelsDir();
        const fileHandle: FileSystemFileHandle = await labelsDir.getFileHandle(`${baseName}.txt`, {create: true});
        const writable: FileSystemWritableFileStream = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        FileSystemRepository.setHasLabelFile(imageData.id, true);
    }

    private static buildImageLabelFileContent(
        imageData: ImageData,
        labelNames: LabelName[],
        imageSize: ISize
    ): string {
        const polygons: LabelPolygon[] = imageData.labelPolygons
            .filter((labelPolygon: LabelPolygon) => labelPolygon.labelId !== null);
        if (polygons.length > 0) {
            return polygons
                .map((labelPolygon: LabelPolygon) =>
                    YOLOPolygonExporter.wrapPolygonLabelIntoYOLO(labelPolygon, labelNames, imageSize))
                .join('\n');
        }
        return imageData.labelRects
            .filter((labelRect: LabelRect) => labelRect.labelId !== null)
            .map((labelRect: LabelRect) =>
                RectLabelsExporter.wrapRectLabelIntoYOLO(labelRect, labelNames, imageSize))
            .join('\n');
    }
}

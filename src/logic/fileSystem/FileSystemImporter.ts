import {ImageData, LabelName} from '../../store/labels/types';
import {LabelType} from '../../data/enums/LabelType';
import {ISize} from '../../interfaces/ISize';
import {ImageDataUtil} from '../../utils/ImageDataUtil';
import {FileUtil} from '../../utils/FileUtil';
import {ImageRepository} from '../imageRepository/ImageRepository';
import {FileSystemRepository} from '../imageRepository/FileSystemRepository';
import {YOLOUtils} from '../import/yolo/YOLOUtils';

export type FolderLoadResult = {
    imagesData: ImageData[];
    labelNames: LabelName[] | null; // null when the folder has no labels.txt
    activeLabelType: LabelType;
    annotationCount: number;
    parseErrorCount: number;
    baseNameCollisions: string[];
};

type AnnotatedImageEntry = {
    imageData: ImageData;
    content: string;
};

export class FileSystemImporter {
    private static readonly IMAGE_EXTENSIONS: string[] = ['jpg', 'jpeg', 'png'];

    public static pickDirectory(): Promise<FileSystemDirectoryHandle> {
        // mode: 'readwrite' makes the pick itself grant read+write - a single
        // permission prompt, no separate requestPermission round.
        return window.showDirectoryPicker({mode: 'readwrite'});
    }

    public static async enumerateImageFiles(directoryHandle: FileSystemDirectoryHandle): Promise<FileSystemFileHandle[]> {
        const fileHandles: FileSystemFileHandle[] = [];
        // values() is shallow, so the labels/ and .trash/ subdirectories are
        // naturally skipped by the kind check.
        for await (const handle of directoryHandle.values()) {
            if (handle.kind !== 'file') continue;
            const extension: string | null = FileUtil.extractFileExtension(handle.name);
            if (extension && FileSystemImporter.IMAGE_EXTENSIONS.includes(extension.toLowerCase())) {
                fileHandles.push(handle);
            }
        }
        return fileHandles.sort((a, b) => a.name.localeCompare(b.name));
    }

    public static async loadFolder(directoryHandle: FileSystemDirectoryHandle): Promise<FolderLoadResult> {
        const fileHandles: FileSystemFileHandle[] = await FileSystemImporter.enumerateImageFiles(directoryHandle);
        const files: File[] = await Promise.all(fileHandles.map((handle: FileSystemFileHandle) => handle.getFile()));
        const imagesData: ImageData[] = files.map((file: File) => ImageDataUtil.createImageDataFromFileData(file));

        const baseNameCollisions: string[] = [];
        const seenBaseNames: Record<string, boolean> = {};
        imagesData.forEach((imageData: ImageData, index: number) => {
            const baseName: string = FileSystemImporter.stemOf(fileHandles[index].name);
            if (seenBaseNames[baseName]) {
                baseNameCollisions.push(baseName);
            }
            seenBaseNames[baseName] = true;
            FileSystemRepository.storeImageEntry(imageData.id, fileHandles[index], baseName);
        });

        const labelNames: LabelName[] | null = await FileSystemImporter.readLabelNames(directoryHandle);
        let activeLabelType: LabelType = LabelType.RECT;
        let annotationCount = 0;
        let parseErrorCount = 0;

        if (labelNames !== null && imagesData.length > 0) {
            const labelsDir: FileSystemDirectoryHandle | null = await FileSystemImporter.getExistingLabelsDir(directoryHandle);
            if (labelsDir !== null) {
                const annotated: AnnotatedImageEntry[] = await FileSystemImporter.readAnnotationFiles(labelsDir, imagesData);

                // Annotations must not enter the store before their image is in
                // ImageRepository (label rendering reads the image size), and
                // YOLO coordinates are normalized so parsing needs the size
                // anyway. Only these images are decoded eagerly - the rest
                // lazy-load in the editor exactly like the drag-drop flow.
                await ImageDataUtil.loadMissingImages(annotated.map((entry: AnnotatedImageEntry) => entry.imageData));

                let hasRects = false;
                let hasPolygons = false;
                for (const {imageData, content} of annotated) {
                    imageData.loadStatus = true;
                    const image: HTMLImageElement = ImageRepository.getById(imageData.id);
                    const imageSize: ISize = {width: image.width, height: image.height};
                    const firstLine: string = content
                        .split(/[\r\n]/)
                        .map((line: string) => line.trim())
                        .filter((line: string) => line.length > 0)[0];
                    if (!firstLine) continue;
                    try {
                        // 5 tokens = YOLO box; 7+ = YOLO polygon
                        if (firstLine.split(/\s+/).length === 5) {
                            imageData.labelRects = YOLOUtils.parseYOLOAnnotationsFromString(
                                content, labelNames, imageSize, imageData.fileData.name);
                            annotationCount += imageData.labelRects.length;
                            hasRects = true;
                        } else {
                            imageData.labelPolygons = YOLOUtils.parseYOLOPolygonAnnotationsFromString(
                                content, labelNames, imageSize, imageData.fileData.name);
                            annotationCount += imageData.labelPolygons.length;
                            hasPolygons = true;
                        }
                    } catch {
                        // skip the malformed file, keep the rest of the folder usable
                        parseErrorCount += 1;
                    }
                }
                if (hasPolygons && !hasRects) {
                    activeLabelType = LabelType.POLYGON;
                }
            }
        }

        return {imagesData, labelNames, activeLabelType, annotationCount, parseErrorCount, baseNameCollisions};
    }

    private static async readAnnotationFiles(
        labelsDir: FileSystemDirectoryHandle,
        imagesData: ImageData[]
    ): Promise<AnnotatedImageEntry[]> {
        const annotated: AnnotatedImageEntry[] = [];
        for (const imageData of imagesData) {
            const baseName: string | null = FileSystemRepository.getBaseNameById(imageData.id);
            try {
                const labelFileHandle: FileSystemFileHandle = await labelsDir.getFileHandle(`${baseName}.txt`);
                const content: string = await (await labelFileHandle.getFile()).text();
                FileSystemRepository.setHasLabelFile(imageData.id, true);
                if (content.trim().length > 0) {
                    annotated.push({imageData, content});
                }
            } catch {
                // no label file for this image
            }
        }
        return annotated;
    }

    private static async readLabelNames(directoryHandle: FileSystemDirectoryHandle): Promise<LabelName[] | null> {
        try {
            const handle: FileSystemFileHandle = await directoryHandle.getFileHandle(FileSystemRepository.LABELS_FILE_NAME);
            const content: string = await (await handle.getFile()).text();
            const labelNames: LabelName[] = YOLOUtils.parseLabelsNamesFromString(content);
            return labelNames.length > 0 ? labelNames : null;
        } catch {
            return null;
        }
    }

    private static async getExistingLabelsDir(directoryHandle: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle | null> {
        try {
            return await directoryHandle.getDirectoryHandle(FileSystemRepository.LABELS_DIR_NAME);
        } catch {
            return null;
        }
    }

    private static stemOf(fileName: string): string {
        const index: number = fileName.lastIndexOf('.');
        return index === -1 ? fileName : fileName.slice(0, index);
    }
}

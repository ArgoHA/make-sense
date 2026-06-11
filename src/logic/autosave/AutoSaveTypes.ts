import {ProjectData} from '../../store/general/types';
import {LabelLine, LabelName, LabelPoint, LabelPolygon, LabelRect} from '../../store/labels/types';
import {LabelType} from '../../data/enums/LabelType';

// A single image's annotations, persisted without the heavy binary image data.
// Annotations are stored in image-pixel coordinates, so they remain valid as long
// as the same image file is re-loaded on restore.
export type AutoSaveImageEntry = {
    fileName: string;
    fileSize: number;
    labelRects: LabelRect[];
    labelPoints: LabelPoint[];
    labelLines: LabelLine[];
    labelPolygons: LabelPolygon[];
    labelNameIds: string[];
}

export type AutoSaveSnapshot = {
    version: number;
    timestamp: number;
    projectData: ProjectData;
    activeLabelType: LabelType;
    activeImageIndex: number;
    labelNames: LabelName[];
    images: AutoSaveImageEntry[];
}

export const AUTO_SAVE_SNAPSHOT_VERSION = 1;

export function countSnapshotAnnotations(snapshot: AutoSaveSnapshot): number {
    return snapshot.images.reduce((total: number, image: AutoSaveImageEntry) => {
        return total
            + image.labelRects.length
            + image.labelPoints.length
            + image.labelLines.length
            + image.labelPolygons.length
            + image.labelNameIds.length;
    }, 0);
}

export function autoSaveSnapshotHasAnnotations(snapshot: AutoSaveSnapshot): boolean {
    return countSnapshotAnnotations(snapshot) > 0;
}

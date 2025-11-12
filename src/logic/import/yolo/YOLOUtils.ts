// YOLOUtils.ts
import {LabelName, LabelRect, LabelPolygon} from '../../../store/labels/types';
import {LabelUtil} from '../../../utils/LabelUtil';
import {AnnotationsParsingError, LabelNamesNotUniqueError} from './YOLOErrors';
import {ISize} from '../../../interfaces/ISize';
import {IPoint} from '../../../interfaces/IPoint';
import {uniq} from 'lodash';

export class YOLOUtils {
    public static parseLabelsNamesFromString(content: string): LabelName[] {
        const labelNames: string[] = content
            .split(/[\r\n]/)
            .filter(Boolean)
            .map((name: string) => name.replace(/\s/g, ''));

        if (uniq(labelNames).length !== labelNames.length) {
            throw new LabelNamesNotUniqueError();
        }

        return labelNames.map((name: string) => LabelUtil.createLabelName(name));
    }

    public static loadLabelsList(
        fileData: File,
        onSuccess: (labels: LabelName[]) => void,
        onFailure: (error: Error) => void
    ) {
        const reader = new FileReader();
        reader.onloadend = (evt: ProgressEvent<FileReader>) => {
            try {
                const content: string = evt.target!.result as string;
                const labelNames = YOLOUtils.parseLabelsNamesFromString(content);
                onSuccess(labelNames);
            } catch (error) {
                onFailure(error as Error);
            }
        };
        reader.readAsText(fileData);
    }

    public static parseYOLOAnnotationsFromString(
        rawAnnotations: string,
        labelNames: LabelName[],
        imageSize: ISize,
        imageName: string
    ): LabelRect[] {
        return rawAnnotations
            .split(/[\r\n]/)
            .filter(Boolean)
            .map((rawAnnotation: string) =>
                YOLOUtils.parseYOLOAnnotationFromString(
                    rawAnnotation, labelNames, imageSize, imageName
                )
            );
    }

    public static parseYOLOAnnotationFromString(
        rawAnnotation: string,
        labelNames: LabelName[],
        imageSize: ISize,
        imageName: string
    ): LabelRect {
        const components = rawAnnotation.trim().split(/\s+/);
        if (!YOLOUtils.validateYOLOBboxComponents(components, labelNames.length)) {
            throw new AnnotationsParsingError(imageName);
        }
        const labelIndex: number = parseInt(components[0], 10);
        const labelId: string = labelNames[labelIndex].id;
        const rectX: number = parseFloat(components[1]);
        const rectY: number = parseFloat(components[2]);
        const rectWidth: number = parseFloat(components[3]);
        const rectHeight: number = parseFloat(components[4]);

        const rect = {
            x: (rectX - rectWidth / 2) * imageSize.width,
            y: (rectY - rectHeight / 2) * imageSize.height,
            width: rectWidth * imageSize.width,
            height: rectHeight * imageSize.height
        };
        return LabelUtil.createLabelRect(labelId, rect);
    }

    public static validateYOLOBboxComponents(components: string[], labelNamesCount: number): boolean {
        const validateCoordinateValue = (rawValue: string): boolean => {
            const floatValue: number = Number(rawValue);
            return !isNaN(floatValue) && 0.0 <= floatValue && floatValue <= 1.0;
        };
        const validateLabelIdx = (rawValue: string): boolean => {
            const intValue: number = parseInt(rawValue, 10);
            return !isNaN(intValue) && 0 <= intValue && intValue < labelNamesCount;
        };

        return [
            components.length === 5,
            validateLabelIdx(components[0]),
            validateCoordinateValue(components[1]),
            validateCoordinateValue(components[2]),
            validateCoordinateValue(components[3]),
            validateCoordinateValue(components[4])
        ].every(Boolean);
    }

    // --------------------------
    // polygon annotations
    // format: "<class> x1 y1 x2 y2 ... xn yn", normalized [0,1]
    // n >= 3, and (components.length - 1) is even
    // --------------------------
    public static parseYOLOPolygonAnnotationsFromString(
        rawAnnotations: string,
        labelNames: LabelName[],
        imageSize: ISize,
        imageName: string
    ): LabelPolygon[] {
        return rawAnnotations
            .split(/[\r\n]/)
            .filter(Boolean)
            .map((rawAnnotation: string) =>
                YOLOUtils.parseYOLOPolygonAnnotationFromString(
                    rawAnnotation, labelNames, imageSize, imageName
                )
            );
    }

    public static parseYOLOPolygonAnnotationFromString(
        rawAnnotation: string,
        labelNames: LabelName[],
        imageSize: ISize,
        imageName: string
    ): LabelPolygon {
        const components = rawAnnotation.trim().split(/\s+/);

        if (!YOLOUtils.validateYOLOPolygonComponents(components, labelNames.length)) {
            throw new AnnotationsParsingError(imageName);
        }

        const labelIndex: number = parseInt(components[0], 10);
        const labelId: string = labelNames[labelIndex].id;

        const vertices: IPoint[] = YOLOUtils.componentsToVertices(components, imageSize);
        if (vertices.length >= 3) {
            const first = vertices[0];
            const last = vertices[vertices.length - 1];
            if (first.x !== last.x || first.y !== last.y) {
                vertices.push({ x: first.x, y: first.y });
            }
        }
        return LabelUtil.createLabelPolygon(labelId, vertices);
    }

    public static validateYOLOPolygonComponents(components: string[], labelNamesCount: number): boolean {
        if (components.length < 1 + 6) return false; // class + at least 3 points
        if ((components.length - 1) % 2 !== 0) return false; // pairs after class id

        const validateLabelIdx = (rawValue: string): boolean => {
            const intValue: number = parseInt(rawValue, 10);
            return !isNaN(intValue) && 0 <= intValue && intValue < labelNamesCount;
        };
        const validateNorm = (rawValue: string): boolean => {
            const v = Number(rawValue);
            return !isNaN(v) && 0.0 <= v && v <= 1.0;
        };

        if (!validateLabelIdx(components[0])) return false;

        for (let i = 1; i < components.length; i++) {
            if (!validateNorm(components[i])) return false;
        }
        return true;
    }

    private static componentsToVertices(components: string[], imageSize: ISize): IPoint[] {
        const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
        const verts: IPoint[] = [];
        for (let i = 1; i < components.length; i += 2) {
            const nx = parseFloat(components[i]);
            const ny = parseFloat(components[i + 1]);
            verts.push({
                x: clamp(nx * imageSize.width, 0, imageSize.width),
                y: clamp(ny * imageSize.height, 0, imageSize.height)
            });
        }
        return verts;
    }
}

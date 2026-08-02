import {IPoint} from '../interfaces/IPoint';
import {IRect} from '../interfaces/IRect';
import {ISize} from '../interfaces/ISize';
import {LabelName} from '../store/labels/types';
import {MaskData} from '../logic/imageRepository/MaskRepository';
import {Settings} from '../settings/Settings';
import {ArrayUtil} from './ArrayUtil';

export class MaskUtil {
    public static readonly IGNORE_CLASS_INDEX = 255;

    public static extractClassIndices(data: Uint8Array): number[] {
        const present: boolean[] = new Array(256).fill(false);
        for (let i = 0; i < data.length; i++) {
            present[data[i]] = true;
        }
        const classIndices: number[] = [];
        for (let classIndex = 0; classIndex < 255; classIndex++) {
            if (present[classIndex]) {
                classIndices.push(classIndex);
            }
        }
        return classIndices;
    }

    public static resolveClassColor(classIndex: number, labelNames: LabelName[]): string {
        const labelName: LabelName = labelNames[classIndex];
        if (!!labelName && !!labelName.color) {
            return labelName.color;
        }
        return ArrayUtil.getByInfiniteIndex(Settings.LABEL_COLORS_PALETTE, classIndex);
    }

    public static paletteKey(labelNames: LabelName[]): string {
        return labelNames.map((labelName: LabelName) => labelName.color).join('|');
    }

    public static stampCircle(
        data: Uint8Array,
        size: ISize,
        center: IPoint,
        radius: number,
        classIndex: number
    ): IRect {
        const cx: number = Math.round(center.x);
        const cy: number = Math.round(center.y);
        const r: number = Math.max(1, Math.round(radius));
        const xMin: number = Math.max(0, cx - r);
        const xMax: number = Math.min(size.width - 1, cx + r);
        const yMin: number = Math.max(0, cy - r);
        const yMax: number = Math.min(size.height - 1, cy + r);
        for (let y = yMin; y <= yMax; y++) {
            for (let x = xMin; x <= xMax; x++) {
                const dx: number = x - cx;
                const dy: number = y - cy;
                if (dx * dx + dy * dy <= r * r) {
                    data[y * size.width + x] = classIndex;
                }
            }
        }
        return {x: xMin, y: yMin, width: Math.max(0, xMax - xMin + 1), height: Math.max(0, yMax - yMin + 1)};
    }

    public static stampStroke(
        data: Uint8Array,
        size: ISize,
        from: IPoint,
        to: IPoint,
        radius: number,
        classIndex: number
    ): IRect {
        const distance: number = Math.hypot(to.x - from.x, to.y - from.y);
        const step: number = Math.max(1, radius / 2);
        const stampCount: number = Math.max(1, Math.ceil(distance / step));
        let dirtyRect: IRect = null;
        for (let i = 0; i <= stampCount; i++) {
            const t: number = i / stampCount;
            const stampRect: IRect = MaskUtil.stampCircle(data, size, {
                x: from.x + (to.x - from.x) * t,
                y: from.y + (to.y - from.y) * t
            }, radius, classIndex);
            dirtyRect = dirtyRect === null ? stampRect : MaskUtil.unionRects(dirtyRect, stampRect);
        }
        return dirtyRect;
    }

    public static unionRects(a: IRect, b: IRect): IRect {
        const xMin: number = Math.min(a.x, b.x);
        const yMin: number = Math.min(a.y, b.y);
        const xMax: number = Math.max(a.x + a.width, b.x + b.width);
        const yMax: number = Math.max(a.y + a.height, b.y + b.height);
        return {x: xMin, y: yMin, width: xMax - xMin, height: yMax - yMin};
    }

    // =================================================================================================================
    // CANVAS BOUND HELPERS (not covered by unit tests - jsdom has no 2d context)
    // =================================================================================================================

    public static createMaskData(
        buffer: Uint8Array,
        size: ISize,
        labelNames: LabelName[]
    ): MaskData {
        const overlay: HTMLCanvasElement = document.createElement('canvas');
        overlay.width = size.width;
        overlay.height = size.height;
        const maskData: MaskData = {
            buffer,
            width: size.width,
            height: size.height,
            overlay,
            overlayPaletteKey: MaskUtil.paletteKey(labelNames)
        };
        MaskUtil.renderOverlayRegion(maskData, {x: 0, y: 0, width: size.width, height: size.height}, labelNames);
        return maskData;
    }

    public static createEmptyMaskData(size: ISize, labelNames: LabelName[]): MaskData {
        const buffer: Uint8Array = new Uint8Array(size.width * size.height)
            .fill(MaskUtil.IGNORE_CLASS_INDEX);
        return MaskUtil.createMaskData(buffer, size, labelNames);
    }

    public static renderOverlayRegion(maskData: MaskData, region: IRect, labelNames: LabelName[]): void {
        const x: number = Math.max(0, Math.floor(region.x));
        const y: number = Math.max(0, Math.floor(region.y));
        const width: number = Math.min(maskData.width - x, Math.ceil(region.width));
        const height: number = Math.min(maskData.height - y, Math.ceil(region.height));
        if (width <= 0 || height <= 0) return;

        const palette: Uint8Array = MaskUtil.buildPaletteLUT(labelNames);
        const ctx: CanvasRenderingContext2D = maskData.overlay.getContext('2d');
        const imageData: ImageData = ctx.createImageData(width, height);
        for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
                const classIndex: number = maskData.buffer[(y + row) * maskData.width + (x + col)];
                const targetOffset: number = (row * width + col) * 4;
                if (classIndex === MaskUtil.IGNORE_CLASS_INDEX) {
                    imageData.data[targetOffset + 3] = 0;
                } else {
                    const paletteOffset: number = classIndex * 3;
                    imageData.data[targetOffset] = palette[paletteOffset];
                    imageData.data[targetOffset + 1] = palette[paletteOffset + 1];
                    imageData.data[targetOffset + 2] = palette[paletteOffset + 2];
                    imageData.data[targetOffset + 3] = 255;
                }
            }
        }
        ctx.putImageData(imageData, x, y);
    }

    public static refreshOverlayIfNeeded(maskData: MaskData, labelNames: LabelName[]): void {
        const currentKey: string = MaskUtil.paletteKey(labelNames);
        if (maskData.overlayPaletteKey !== currentKey) {
            maskData.overlayPaletteKey = currentKey;
            MaskUtil.renderOverlayRegion(
                maskData,
                {x: 0, y: 0, width: maskData.width, height: maskData.height},
                labelNames
            );
        }
    }

    public static decodeImageToMaskBuffer(image: HTMLImageElement): Uint8Array {
        const canvas: HTMLCanvasElement = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx: CanvasRenderingContext2D = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const rgba: Uint8ClampedArray = ctx.getImageData(0, 0, image.width, image.height).data;
        const buffer: Uint8Array = new Uint8Array(image.width * image.height);
        for (let i = 0; i < buffer.length; i++) {
            // grayscale png decodes to r === g === b === class index
            buffer[i] = rgba[i * 4];
        }
        return buffer;
    }

    private static buildPaletteLUT(labelNames: LabelName[]): Uint8Array {
        const palette: Uint8Array = new Uint8Array(256 * 3);
        for (let classIndex = 0; classIndex < 255; classIndex++) {
            const hex: string = MaskUtil.resolveClassColor(classIndex, labelNames);
            palette[classIndex * 3] = parseInt(hex.slice(1, 3), 16);
            palette[classIndex * 3 + 1] = parseInt(hex.slice(3, 5), 16);
            palette[classIndex * 3 + 2] = parseInt(hex.slice(5, 7), 16);
        }
        return palette;
    }
}

export type MaskData = {
    // class index per pixel (row-major), 255 = ignore
    buffer: Uint8Array;
    width: number;
    height: number;
    // colorized visualization of buffer, kept in sync with it
    overlay: HTMLCanvasElement;
    // palette signature the overlay was rendered with; used to detect stale colors
    overlayPaletteKey: string;
}

export type MaskMap = { [s: string]: MaskData; };

export class MaskRepository {
    private static repository: MaskMap = {};

    public static store(maskId: string, maskData: MaskData) {
        MaskRepository.repository[maskId] = maskData;
    }

    public static getById(maskId: string): MaskData {
        return MaskRepository.repository[maskId];
    }

    public static deleteById(maskId: string) {
        delete MaskRepository.repository[maskId];
    }
}

import { MaskUtil } from '../MaskUtil';

describe('MaskUtil extractClassIndices method', () => {
    it('should return sorted class indices without the ignore class', () => {
        const buffer = new Uint8Array([3, 0, 255, 3, 7, 255, 0]);
        expect(MaskUtil.extractClassIndices(buffer)).toEqual([0, 3, 7]);
    });

    it('should return empty array for fully ignored mask', () => {
        const buffer = new Uint8Array(10).fill(MaskUtil.IGNORE_CLASS_INDEX);
        expect(MaskUtil.extractClassIndices(buffer)).toEqual([]);
    });
});

describe('MaskUtil stampCircle method', () => {
    const size = { width: 10, height: 10 };

    it('should paint pixels within the radius and leave the rest untouched', () => {
        const buffer = new Uint8Array(size.width * size.height).fill(MaskUtil.IGNORE_CLASS_INDEX);
        MaskUtil.stampCircle(buffer, size, { x: 5, y: 5 }, 2, 1);
        expect(buffer[5 * size.width + 5]).toEqual(1); // center
        expect(buffer[5 * size.width + 3]).toEqual(1); // on the radius
        expect(buffer[5 * size.width + 2]).toEqual(MaskUtil.IGNORE_CLASS_INDEX); // outside
        expect(buffer[3 * size.width + 3]).toEqual(MaskUtil.IGNORE_CLASS_INDEX); // corner of bbox, outside circle
    });

    it('should return the dirty rect clamped to the buffer bounds', () => {
        const buffer = new Uint8Array(size.width * size.height).fill(MaskUtil.IGNORE_CLASS_INDEX);
        const dirtyRect = MaskUtil.stampCircle(buffer, size, { x: 0, y: 0 }, 3, 2);
        expect(dirtyRect).toEqual({ x: 0, y: 0, width: 4, height: 4 });
        expect(buffer[0]).toEqual(2);
    });
});

describe('MaskUtil stampStroke method', () => {
    const size = { width: 20, height: 10 };

    it('should paint a continuous line between the two points', () => {
        const buffer = new Uint8Array(size.width * size.height).fill(MaskUtil.IGNORE_CLASS_INDEX);
        MaskUtil.stampStroke(buffer, size, { x: 2, y: 5 }, { x: 17, y: 5 }, 1, 4);
        for (let x = 2; x <= 17; x++) {
            expect(buffer[5 * size.width + x]).toEqual(4);
        }
        expect(buffer[2 * size.width + 10]).toEqual(MaskUtil.IGNORE_CLASS_INDEX);
    });

    it('should return a dirty rect covering the whole stroke', () => {
        const buffer = new Uint8Array(size.width * size.height).fill(MaskUtil.IGNORE_CLASS_INDEX);
        const dirtyRect = MaskUtil.stampStroke(buffer, size, { x: 2, y: 5 }, { x: 17, y: 5 }, 1, 4);
        expect(dirtyRect.x).toEqual(1);
        expect(dirtyRect.x + dirtyRect.width).toEqual(19);
    });
});

describe('MaskUtil unionRects method', () => {
    it('should return the bounding rect of both inputs', () => {
        const union = MaskUtil.unionRects(
            { x: 0, y: 0, width: 2, height: 2 },
            { x: 5, y: 4, width: 3, height: 1 }
        );
        expect(union).toEqual({ x: 0, y: 0, width: 8, height: 5 });
    });
});

describe('MaskUtil resolveClassColor method', () => {
    it('should use the label color when available', () => {
        const labelNames = [{ id: '1', name: 'road', color: '#123456' }];
        expect(MaskUtil.resolveClassColor(0, labelNames)).toEqual('#123456');
    });

    it('should fall back to the palette for unknown classes', () => {
        expect(typeof MaskUtil.resolveClassColor(7, [])).toEqual('string');
        expect(MaskUtil.resolveClassColor(7, [])).toMatch(/^#/);
    });
});

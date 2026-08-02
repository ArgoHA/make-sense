import { inflate } from 'pako';
import { PngUtil } from '../PngUtil';

// independent, table-free crc32 used to validate chunk checksums
const referenceCrc32 = (data: Uint8Array): number => {
    let crc = ~0;
    for (const byte of data) {
        crc ^= byte;
        for (let k = 0; k < 8; k++) {
            crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
        }
    }
    return ~crc >>> 0;
};

type Chunk = { type: string, data: Uint8Array, crc: number };

const parseChunks = (png: Uint8Array): Chunk[] => {
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const chunks: Chunk[] = [];
    let offset = 8;
    while (offset < png.length) {
        const length = view.getUint32(offset);
        const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
        chunks.push({
            type,
            data: png.subarray(offset + 8, offset + 8 + length),
            crc: view.getUint32(offset + 8 + length)
        });
        offset += 12 + length;
    }
    return chunks;
};

describe('PngUtil encodeGrayscalePNG method', () => {
    const width = 3;
    const height = 2;
    const buffer = new Uint8Array([0, 1, 2, 254, 255, 7]);

    it('should start with the png signature', () => {
        const png = PngUtil.encodeGrayscalePNG(buffer, width, height);
        expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    });

    it('should contain IHDR, IDAT and IEND chunks with valid crc', () => {
        const png = PngUtil.encodeGrayscalePNG(buffer, width, height);
        const chunks = parseChunks(png);
        expect(chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
        chunks.forEach((chunk) => {
            const typeAndData = new Uint8Array(4 + chunk.data.length);
            typeAndData.set(chunk.type.split('').map((c) => c.charCodeAt(0)));
            typeAndData.set(chunk.data, 4);
            expect(chunk.crc).toEqual(referenceCrc32(typeAndData));
        });
    });

    it('should describe a 8-bit grayscale image in IHDR', () => {
        const png = PngUtil.encodeGrayscalePNG(buffer, width, height);
        const ihdr = parseChunks(png)[0].data;
        const view = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);
        expect(view.getUint32(0)).toEqual(width);
        expect(view.getUint32(4)).toEqual(height);
        expect(ihdr[8]).toEqual(8);  // bit depth
        expect(ihdr[9]).toEqual(0);  // color type: grayscale
        expect(ihdr[10]).toEqual(0); // compression
        expect(ihdr[11]).toEqual(0); // filter
        expect(ihdr[12]).toEqual(0); // interlace
    });

    it('should roundtrip pixel values through the IDAT chunk', () => {
        const png = PngUtil.encodeGrayscalePNG(buffer, width, height);
        const idat = parseChunks(png)[1].data;
        const scanlines = inflate(idat);
        expect(scanlines.length).toEqual((width + 1) * height);
        for (let y = 0; y < height; y++) {
            expect(scanlines[y * (width + 1)]).toEqual(0); // filter byte: None
            expect(Array.from(scanlines.subarray(y * (width + 1) + 1, (y + 1) * (width + 1))))
                .toEqual(Array.from(buffer.subarray(y * width, (y + 1) * width)));
        }
    });

    it('should throw when buffer size does not match dimensions', () => {
        expect(() => PngUtil.encodeGrayscalePNG(buffer, 4, 2)).toThrow();
    });
});

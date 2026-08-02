import {deflate} from 'pako';

export class PngUtil {
    private static readonly SIGNATURE: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    private static crcTable: Uint32Array = null;

    // encodes a single-channel uint8 buffer as a grayscale png (bit depth 8, color type 0)
    public static encodeGrayscalePNG(data: Uint8Array, width: number, height: number): Uint8Array {
        if (data.length !== width * height) {
            throw new Error('PngUtil: buffer size does not match given dimensions');
        }
        const scanlines: Uint8Array = new Uint8Array((width + 1) * height);
        for (let y = 0; y < height; y++) {
            // filter byte 0 (None) followed by the raw scanline
            scanlines[y * (width + 1)] = 0;
            scanlines.set(data.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
        }

        const ihdr: Uint8Array = new Uint8Array(13);
        const ihdrView: DataView = new DataView(ihdr.buffer);
        ihdrView.setUint32(0, width);
        ihdrView.setUint32(4, height);
        ihdr[8] = 8;   // bit depth
        ihdr[9] = 0;   // color type: grayscale
        ihdr[10] = 0;  // compression
        ihdr[11] = 0;  // filter
        ihdr[12] = 0;  // interlace

        const chunks: Uint8Array[] = [
            new Uint8Array(PngUtil.SIGNATURE),
            PngUtil.buildChunk('IHDR', ihdr),
            PngUtil.buildChunk('IDAT', deflate(scanlines)),
            PngUtil.buildChunk('IEND', new Uint8Array(0))
        ];
        const totalLength: number = chunks.reduce((length: number, chunk: Uint8Array) => length + chunk.length, 0);
        const png: Uint8Array = new Uint8Array(totalLength);
        let offset = 0;
        chunks.forEach((chunk: Uint8Array) => {
            png.set(chunk, offset);
            offset += chunk.length;
        });
        return png;
    }

    private static buildChunk(type: string, data: Uint8Array): Uint8Array {
        const chunk: Uint8Array = new Uint8Array(12 + data.length);
        const view: DataView = new DataView(chunk.buffer);
        view.setUint32(0, data.length);
        for (let i = 0; i < 4; i++) {
            chunk[4 + i] = type.charCodeAt(i);
        }
        chunk.set(data, 8);
        view.setUint32(8 + data.length, PngUtil.crc32(chunk.subarray(4, 8 + data.length)));
        return chunk;
    }

    private static crc32(data: Uint8Array): number {
        if (PngUtil.crcTable === null) {
            PngUtil.crcTable = new Uint32Array(256);
            for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 0; k < 8; k++) {
                    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
                }
                PngUtil.crcTable[n] = c >>> 0;
            }
        }
        let crc = 0xffffffff;
        for (let i = 0; i < data.length; i++) {
            crc = PngUtil.crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
        }
        return (crc ^ 0xffffffff) >>> 0;
    }
}

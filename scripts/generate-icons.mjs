// Generates Perflex extension icons (indigo square + white lightning bolt).
// No external deps — hand-rolls a PNG using Node's zlib.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'src', 'assets', 'icons');
mkdirSync(OUT, { recursive: true });

// 16x16 lightning-bolt mask (1 = white glyph pixel).
const BOLT = [
  '.........XX.....',
  '........XX......',
  '.......XX.......',
  '......XXXX......',
  '.....XXXXXX.....',
  '....XXXXXX......',
  '.......XX.......',
  '......XX........',
  '.....XX.........',
  '....XXXXXX......',
  '.....XXXXX......',
  '......XX........',
  '.....XX.........',
  '....XX..........',
  '...XX...........',
  '................',
].map((r) => r.padEnd(16, '.'));

const BG = [0x63, 0x66, 0xf1]; // indigo-500
const FG = [0xff, 0xff, 0xff];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size) {
  const scale = size / 16;
  // RGBA raw, with filter byte 0 per scanline.
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const gx = Math.floor(x / scale);
      const gy = Math.floor(y / scale);
      const on = BOLT[gy]?.[gx] === 'X';
      const [r, g, b] = on ? FG : BG;
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 48, 128]) {
  writeFileSync(join(OUT, `icon-${size}.png`), makePng(size));
  console.log(`wrote icon-${size}.png`);
}

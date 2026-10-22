// アプリアイコン（PNG）生成スクリプト。依存ライブラリなし（node:zlib のみ）。
// npm run dev / build の前に自動実行され、public/ に出力する（生成物はコミットしない）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const BG = [10, 20, 48];

// 図形は 0〜1 の座標で定義（後に描いたものが上）
const SHAPES = [
  { color: [37, 99, 235], points: [[0.05, 0.82], [0.95, 0.82], [0.95, 0.86], [0.05, 0.86]] }, // 水面
  { color: [96, 165, 250], points: [[0.08, 0.62], [0.92, 0.62], [0.78, 0.78], [0.22, 0.78]] }, // 船体
  { color: [230, 235, 245], points: [[0.5, 0.1], [0.5, 0.56], [0.18, 0.56]] }, // 帆
  { color: [52, 211, 153], points: [[0.55, 0.24], [0.55, 0.56], [0.8, 0.56]] }, // 小帆
];

function inside(x, y, pts) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** size×size の RGB 画素。padding は図形の外側の余白率。4×4 のスーパーサンプリングで滑らかにする */
function render(size, padding) {
  const px = Buffer.alloc(size * size * 3);
  const w = 1 - 2 * padding;
  const SS = 4;
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((pxi + (sx + 0.5) / SS) / size - padding) / w;
          const v = ((py + (sy + 0.5) / SS) / size - padding) / w;
          let c = BG;
          for (const s of SHAPES) if (inside(u, v, s.points)) c = s.color;
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
        }
      }
      const o = (py * size + pxi) * 3;
      for (let k = 0; k < 3; k++) px[o + k] = Math.round(acc[k] / (SS * SS));
    }
  }
  return px;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const [name, size, padding] of [
  ['icon-192.png', 192, 0.1],
  ['icon-512.png', 512, 0.1],
  ['icon-maskable-512.png', 512, 0.2], // マスク可能アイコンは安全領域のため余白を広く
  ['apple-touch-icon.png', 180, 0.1],
]) {
  writeFileSync(join(OUT, name), encodePng(size, render(size, padding)));
}
console.log('icons generated ->', OUT);

// Menghasilkan ikon PNG PWA tanpa dependensi (zlib + SDF rounded-rect). Jalankan: npm run icons
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../public/icons/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// jarak bertanda ke rounded-rect (negatif = di dalam)
const sdf = (x, y, cx, cy, hw, hh, r) => {
  const dx = Math.abs(x - cx) - hw + r;
  const dy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};
const cover = (d) => Math.min(1, Math.max(0, 0.5 - d)); // antialias 1px
const mix = (a, b, t) => a + (b - a) * t;

function draw(size, { maskable }) {
  const buf = Buffer.alloc(size * size * 4);
  const s = size;
  // area aman maskable ~ 60% tengah; ikon biasa memakai sudut membulat penuh
  const k = maskable ? 0.82 : 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size);
      let r = mix(99, 139, t), g = mix(102, 92, t), b = mix(241, 246, t); // #6366f1 → #8b5cf6
      let a = maskable ? 1 : cover(sdf(x, y, s / 2, s / 2, s / 2, s / 2, s * 0.22));
      const over = (cr, cg, cb, ca) => {
        r = mix(r, cr, ca);
        g = mix(g, cg, ca);
        b = mix(b, cb, ca);
      };
      const cx = s / 2, cy = s / 2;
      const cw = s * 0.25 * k, ch = s * 0.19 * k, cr = s * 0.045 * k;
      // kartu belakang (semi transparan)
      over(255, 255, 255, 0.45 * cover(sdf(x, y, cx - s * 0.05 * k, cy - s * 0.06 * k, cw, ch, cr)));
      // kartu depan
      const front = cover(sdf(x, y, cx + s * 0.04 * k, cy + s * 0.04 * k, cw, ch, cr));
      over(255, 255, 255, front);
      // dua garis teks di kartu depan
      const bar1 = cover(sdf(x, y, cx - s * 0.02 * k, cy + s * 0.0 * k, s * 0.11 * k, s * 0.014 * k, s * 0.014 * k));
      const bar2 = cover(sdf(x, y, cx + s * 0.01 * k, cy + s * 0.075 * k, s * 0.15 * k, s * 0.014 * k, s * 0.014 * k));
      over(99, 102, 241, bar1 * front);
      over(165, 180, 252, bar2 * front);
      const i = (y * size + x) * 4;
      buf[i] = Math.round(r);
      buf[i + 1] = Math.round(g);
      buf[i + 2] = Math.round(b);
      buf[i + 3] = Math.round(a * 255);
    }
  }
  return png(size, size, buf);
}

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true], // iOS membulatkan sendiri → full-bleed
];
for (const [name, size, maskable] of targets) {
  writeFileSync(new URL(name, OUT), draw(size, { maskable }));
  console.log('ikon', name);
}

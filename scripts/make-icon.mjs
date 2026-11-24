import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = resolve(root, 'assets', 'icon.ico');

function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function mix(c1, c2, t) { return [lerp(c1[0],c2[0],t), lerp(c1[1],c2[1],t), lerp(c1[2],c2[2],t), lerp(c1[3],c2[3],t)]; }

function drawIcon(size) {
  const buf = Buffer.alloc(size * size * 4, 0);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const a = c[3] / 255;
    const oa = buf[i + 3] / 255;
    const outA = a + oa * (1 - a);
    if (outA <= 0) return;
    buf[i] = clamp((c[0] * a + buf[i] * oa * (1 - a)) / outA);
    buf[i + 1] = clamp((c[1] * a + buf[i + 1] * oa * (1 - a)) / outA);
    buf[i + 2] = clamp((c[2] * a + buf[i + 2] * oa * (1 - a)) / outA);
    buf[i + 3] = clamp(outA * 255);
  };

  const s = size;
  const pad = Math.max(1, Math.round(s * 0.06));
  const r = Math.round(s * 0.22);
  const inRound = (x, y) => {
    const x0 = pad, y0 = pad, x1 = s - pad - 1, y1 = s - pad - 1;
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
    const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
    return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
  };

  const bg1 = [22, 24, 27, 255]; // #16181b
  const bg2 = [28, 31, 35, 255]; // #1c1f23
  const gold = [217, 164, 65, 255]; // #d9a441
  const goldSoft = [217, 164, 65, 90];
  const line = [232, 234, 237, 255];

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      if (!inRound(x, y)) continue;
      const t = y / (s - 1);
      const c = mix(bg1, bg2, t);
      set(x, y, c);
    }
  }

  // subtle gold border
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      if (!inRound(x, y)) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) {
        for (let dx = -1; dx <= 1 && !edge; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (!inRound(x + dx, y + dy)) edge = true;
        }
      }
      if (edge) set(x, y, [217, 164, 65, 170]);
    }
  }

  // draw a simple dashboard mark: three ascending bars + gold pulse line
  const chartLeft = Math.round(s * 0.22);
  const chartRight = Math.round(s * 0.78);
  const chartBottom = Math.round(s * 0.72);
  const chartTop = Math.round(s * 0.32);
  const bw = Math.max(2, Math.round((chartRight - chartLeft) * 0.16));
  const gap = Math.max(1, Math.round((chartRight - chartLeft - bw * 3) / 2));
  const heights = [0.38, 0.62, 0.9];
  for (let i = 0; i < 3; i++) {
    const bx0 = chartLeft + i * (bw + gap);
    const bx1 = bx0 + bw;
    const bh = Math.round((chartBottom - chartTop) * heights[i]);
    const by0 = chartBottom - bh;
    for (let y = by0; y <= chartBottom; y++) {
      for (let x = bx0; x < bx1; x++) {
        const tt = (y - by0) / Math.max(1, bh);
        const c = mix([217, 164, 65, 220], [140, 100, 35, 220], tt * 0.4);
        set(x, y, c);
      }
    }
  }

  // pulse line
  const pts = [
    [chartLeft, Math.round(s * 0.46)],
    [Math.round(s * 0.40), Math.round(s * 0.46)],
    [Math.round(s * 0.48), Math.round(s * 0.36)],
    [Math.round(s * 0.56), Math.round(s * 0.52)],
    [Math.round(s * 0.66), Math.round(s * 0.30)],
    [chartRight - 1, Math.round(s * 0.30)],
  ];
  const thick = Math.max(1, Math.round(s * 0.028));
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const x = Math.round(lerp(x0, x1, t));
      const y = Math.round(lerp(y0, y1, t));
      for (let dy = -thick; dy <= thick; dy++) {
        for (let dx = -thick; dx <= thick; dx++) {
          if (dx * dx + dy * dy <= thick * thick) set(x + dx, y + dy, [245, 211, 122, 255]);
        }
      }
    }
  }

  // small "dot" at pulse end
  const dotR = Math.max(1, Math.round(s * 0.03));
  const [dx0, dy0] = pts[pts.length - 1];
  for (let dy = -dotR - 1; dy <= dotR + 1; dy++) {
    for (let dx = -dotR - 1; dx <= dotR + 1; dx++) {
      if (dx * dx + dy * dy <= dotR * dotR) set(dx0 + dx, dy0 + dy, gold);
    }
  }

  return buf;
}

function pngEncode(rgba, size) {
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const chunks = [];
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.concat([t, data]);
    let crc = 0xffffffff;
    for (let i = 0; i < crcBuf.length; i++) {
      crc ^= crcBuf[i];
      for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const c = Buffer.alloc(4); c.writeUInt32BE(crc, 0);
    chunks.push(len, t, data, c);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunk('IHDR', ihdr);

  // raw scanlines with filter 0
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0;
    rgba.copy(raw, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  chunk('IDAT', idat);
  chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ...chunks]);
}

function buildIco(sizes) {
  const images = sizes.map((s) => ({ size: s, png: pngEncode(drawIcon(s), s) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // icon
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach((img, i) => {
    const e = 16 * i;
    const dim = img.size >= 256 ? 0 : img.size;
    dir[e] = dim; dir[e + 1] = dim;
    dir[e + 2] = 0; // palette
    dir[e + 3] = 0;
    dir.writeUInt16LE(1, e + 4); // planes
    dir.writeUInt16LE(32, e + 6); // bit count
    dir.writeUInt32LE(img.png.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += img.png.length;
  });
  return Buffer.concat([header, dir, ...images.map((i) => i.png)]);
}

mkdirSync(dirname(outPath), { recursive: true });
const ico = buildIco([16, 24, 32, 48, 64, 128, 256]);
writeFileSync(outPath, ico);
console.log(`icon written: ${outPath} (${ico.length} bytes)`);

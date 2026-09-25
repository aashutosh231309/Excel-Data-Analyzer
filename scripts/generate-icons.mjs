/**
 * Generates the application icon in every format the packaging targets need.
 *
 *   npm run icons
 *
 * Outputs:
 *   build/icon.png            512×512 master used for Linux/macOS builds
 *   build/icons/<size>.png    individual PNG sizes
 *   build/icon.ico            multi-resolution Windows icon (16 → 256)
 *
 * The artwork is drawn programmatically so the repository stays free of binary
 * design files: a blue-violet gradient tile with a spreadsheet glyph.
 */
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const buildDir = path.join(root, 'build');
const iconsDir = path.join(buildDir, 'icons');

const MASTER_SIZE = 1024;
const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
/** Windows .ico entries: PNG for 256, uncompressed BMP for the smaller sizes. */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/* -------------------------------------------------------------------------- */
/* Canvas                                                                      */
/* -------------------------------------------------------------------------- */

/** Straight-alpha RGBA canvas with floating point channels in the 0..1 range. */
function createCanvas(size) {
  return { size, data: new Float32Array(size * size * 4) };
}

function blendPixel(canvas, x, y, red, green, blue, alpha) {
  if (alpha <= 0) {
    return;
  }
  const index = (y * canvas.size + x) * 4;
  const data = canvas.data;
  const dstAlpha = data[index + 3];
  const outAlpha = alpha + dstAlpha * (1 - alpha);
  if (outAlpha <= 0) {
    return;
  }
  data[index] = (red * alpha + data[index] * dstAlpha * (1 - alpha)) / outAlpha;
  data[index + 1] = (green * alpha + data[index + 1] * dstAlpha * (1 - alpha)) / outAlpha;
  data[index + 2] = (blue * alpha + data[index + 2] * dstAlpha * (1 - alpha)) / outAlpha;
  data[index + 3] = outAlpha;
}

/** Signed distance to a rounded rectangle; negative inside, positive outside. */
function roundedRectDistance(px, py, x, y, width, height, radius) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const centerX = x + halfWidth;
  const centerY = y + halfHeight;
  const dx = Math.abs(px - centerX) - (halfWidth - radius);
  const dy = Math.abs(py - centerY) - (halfHeight - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  const inside = Math.min(Math.max(dx, dy), 0);
  return outside + inside - radius;
}

/**
 * Fills a rounded rectangle with supersampled anti-aliasing.
 * `colorAt(x, y)` returns `[r, g, b]` in the 0..1 range.
 */
function fillRoundedRect(canvas, { x, y, width, height, radius, alpha = 1, colorAt }) {
  const samplesPerAxis = 3;
  const totalSamples = samplesPerAxis * samplesPerAxis;
  const minX = Math.max(0, Math.floor(x) - 1);
  const maxX = Math.min(canvas.size - 1, Math.ceil(x + width) + 1);
  const minY = Math.max(0, Math.floor(y) - 1);
  const maxY = Math.min(canvas.size - 1, Math.ceil(y + height) + 1);

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      let hits = 0;
      for (let sy = 0; sy < samplesPerAxis; sy += 1) {
        for (let sx = 0; sx < samplesPerAxis; sx += 1) {
          const sampleX = px + (sx + 0.5) / samplesPerAxis;
          const sampleY = py + (sy + 0.5) / samplesPerAxis;
          if (roundedRectDistance(sampleX, sampleY, x, y, width, height, radius) <= 0) {
            hits += 1;
          }
        }
      }
      if (hits === 0) {
        continue;
      }
      const coverage = hits / totalSamples;
      const [red, green, blue] = colorAt(px + 0.5, py + 0.5);
      blendPixel(canvas, px, py, red, green, blue, coverage * alpha);
    }
  }
}

function mixColor(from, to, t) {
  const clamped = Math.min(1, Math.max(0, t));
  return [
    from[0] + (to[0] - from[0]) * clamped,
    from[1] + (to[1] - from[1]) * clamped,
    from[2] + (to[2] - from[2]) * clamped,
  ];
}

const toUnit = (hex) => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

const INDIGO = toUnit('#6366F1');
const VIOLET = toUnit('#8B5CF6');
const CYAN = toUnit('#22D3EE');
const WHITE = [1, 1, 1];

/* -------------------------------------------------------------------------- */
/* Artwork                                                                     */
/* -------------------------------------------------------------------------- */

function drawIcon(size) {
  const canvas = createCanvas(size);
  const scale = size / MASTER_SIZE;
  const px = (value) => value * scale;

  // Rounded tile with the primary blue-violet gradient (135°).
  const padding = px(MASTER_SIZE * 0.04);
  const tileSize = size - padding * 2;
  fillRoundedRect(canvas, {
    x: padding,
    y: padding,
    width: tileSize,
    height: tileSize,
    radius: tileSize * 0.22,
    colorAt: (x, y) => mixColor(INDIGO, VIOLET, (x + y) / (2 * size)),
  });

  // Soft highlight in the upper-left corner for a subtle premium depth.
  drawHighlight(canvas, { x: size * 0.3, y: size * 0.24 }, size * 0.75);

  // Spreadsheet glyph: a full-width header bar plus two rows of two cells.
  const content = { left: px(0.24 * MASTER_SIZE), right: px(0.76 * MASTER_SIZE) };
  const contentWidth = content.right - content.left;
  const columnGap = contentWidth * 0.1;
  const columnWidth = (contentWidth - columnGap) / 2;
  const rowRadius = px(0.018 * MASTER_SIZE);

  const rows = [
    { top: px(0.285 * MASTER_SIZE), height: px(0.11 * MASTER_SIZE), split: false, accentLast: false },
    { top: px(0.455 * MASTER_SIZE), height: px(0.1 * MASTER_SIZE), split: true, accentLast: false },
    { top: px(0.615 * MASTER_SIZE), height: px(0.1 * MASTER_SIZE), split: true, accentLast: true },
  ];

  for (const row of rows) {
    const solid = () => WHITE;
    if (!row.split) {
      fillRoundedRect(canvas, {
        x: content.left,
        y: row.top,
        width: contentWidth,
        height: row.height,
        radius: rowRadius,
        alpha: 0.96,
        colorAt: solid,
      });
      continue;
    }

    fillRoundedRect(canvas, {
      x: content.left,
      y: row.top,
      width: columnWidth,
      height: row.height,
      radius: rowRadius,
      alpha: 0.88,
      colorAt: solid,
    });
    fillRoundedRect(canvas, {
      x: content.left + columnWidth + columnGap,
      y: row.top,
      width: columnWidth,
      height: row.height,
      radius: rowRadius,
      alpha: 1,
      colorAt: row.accentLast ? () => CYAN : solid,
    });
  }

  return canvas;
}

/** Adds a soft radial white highlight using additive-ish alpha blending. */
function drawHighlight(canvas, center, radius) {
  for (let y = 0; y < canvas.size; y += 1) {
    for (let x = 0; x < canvas.size; x += 1) {
      const index = (y * canvas.size + x) * 4;
      if (canvas.data[index + 3] <= 0.01) {
        continue;
      }
      const distance = Math.hypot(x + 0.5 - center.x, y + 0.5 - center.y);
      const falloff = Math.max(0, 1 - distance / radius);
      const alpha = falloff * falloff * 0.14;
      if (alpha > 0.002) {
        blendPixel(canvas, x, y, 1, 1, 1, alpha);
      }
    }
  }
}

/** Box-filtered downscale for crisp results at small sizes. */
function resizeCanvas(source, targetSize) {
  const target = createCanvas(targetSize);
  const ratio = source.size / targetSize;
  for (let y = 0; y < targetSize; y += 1) {
    for (let x = 0; x < targetSize; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let samples = 0;
      const startX = Math.floor(x * ratio);
      const endX = Math.min(source.size, Math.ceil((x + 1) * ratio));
      const startY = Math.floor(y * ratio);
      const endY = Math.min(source.size, Math.ceil((y + 1) * ratio));
      for (let sy = startY; sy < endY; sy += 1) {
        for (let sx = startX; sx < endX; sx += 1) {
          const index = (sy * source.size + sx) * 4;
          const sampleAlpha = source.data[index + 3];
          red += source.data[index] * sampleAlpha;
          green += source.data[index + 1] * sampleAlpha;
          blue += source.data[index + 2] * sampleAlpha;
          alpha += sampleAlpha;
          samples += 1;
        }
      }
      const targetIndex = (y * targetSize + x) * 4;
      if (samples === 0 || alpha <= 0) {
        continue;
      }
      target.data[targetIndex] = red / alpha;
      target.data[targetIndex + 1] = green / alpha;
      target.data[targetIndex + 2] = blue / alpha;
      target.data[targetIndex + 3] = alpha / samples;
    }
  }
  return target;
}

function canvasToRgbaBuffer(canvas) {
  const buffer = Buffer.alloc(canvas.size * canvas.size * 4);
  for (let i = 0; i < canvas.data.length; i += 1) {
    buffer[i] = Math.round(Math.min(1, Math.max(0, canvas.data[i])) * 255);
  }
  return buffer;
}

/* -------------------------------------------------------------------------- */
/* PNG encoding                                                                */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(canvas) {
  const { size } = canvas;
  const rgba = canvasToRgbaBuffer(canvas);
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------------------- */
/* ICO encoding                                                                */
/* -------------------------------------------------------------------------- */

/** BITMAPINFOHEADER + bottom-up BGRA pixels + 1-bit AND mask, as ICO expects. */
function encodeBmpEntry(canvas) {
  const { size } = canvas;
  const rgba = canvasToRgbaBuffer(canvas);
  const pixelBytes = size * size * 4;
  const maskStride = Math.ceil(size / 32) * 4;
  const maskBytes = maskStride * size;
  const header = Buffer.alloc(40);

  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // height doubles to cover the AND mask
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(pixelBytes, 20);

  const pixels = Buffer.alloc(pixelBytes);
  const mask = Buffer.alloc(maskBytes);
  for (let y = 0; y < size; y += 1) {
    const sourceRow = size - 1 - y; // bottom-up
    for (let x = 0; x < size; x += 1) {
      const source = (sourceRow * size + x) * 4;
      const target = (y * size + x) * 4;
      pixels[target] = rgba[source + 2];
      pixels[target + 1] = rgba[source + 1];
      pixels[target + 2] = rgba[source];
      pixels[target + 3] = rgba[source + 3];
      if (rgba[source + 3] < 128) {
        mask[y * maskStride + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  return Buffer.concat([header, pixels, mask]);
}

function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + entries.length * 16;
  const directory = [];
  for (const entry of entries) {
    const item = Buffer.alloc(16);
    item.writeUInt8(entry.size >= 256 ? 0 : entry.size, 0);
    item.writeUInt8(entry.size >= 256 ? 0 : entry.size, 1);
    item.writeUInt8(0, 2);
    item.writeUInt8(0, 3);
    item.writeUInt16LE(1, 4);
    item.writeUInt16LE(32, 6);
    item.writeUInt32LE(entry.data.length, 8);
    item.writeUInt32LE(offset, 12);
    directory.push(item);
    offset += entry.data.length;
  }

  return Buffer.concat([header, ...directory, ...entries.map((entry) => entry.data)]);
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */

const master = drawIcon(MASTER_SIZE);
await mkdir(iconsDir, { recursive: true });

const pngBySize = new Map();
for (const size of PNG_SIZES) {
  const canvas = size === MASTER_SIZE ? master : resizeCanvas(master, size);
  const png = encodePng(canvas);
  pngBySize.set(size, png);
  await writeFile(path.join(iconsDir, `${size}.png`), png);
}

await writeFile(path.join(buildDir, 'icon.png'), pngBySize.get(512));

const icoEntries = ICO_SIZES.map((size) => {
  if (size === 256) {
    return { size, data: pngBySize.get(256) };
  }
  return { size, data: encodeBmpEntry(resizeCanvas(master, size)) };
});
await writeFile(path.join(buildDir, 'icon.ico'), encodeIco(icoEntries));

console.log(`[icons] wrote build/icon.png, build/icon.ico and ${PNG_SIZES.length} PNG sizes`);

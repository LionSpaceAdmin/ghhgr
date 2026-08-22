import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const referencePath = process.argv[2];
if (!referencePath) {
  console.error("Usage: npm run generate:particles -- /absolute/path/to/reference.png");
  process.exit(1);
}

const WIDTH = 720;
const HEIGHT = 720;
const CELL = 9;
const MAX_LINES = 1800;
const CHUNKS = 6;
const OUT_DIR = path.resolve("src/data");

function hash32(value) {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x ^= x >>> 16;
  return x >>> 0;
}

function unitHash(value) {
  return hash32(value) / 4294967295;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function insideEllipse(nx, ny, cx, cy, rx, ry) {
  const dx = (nx - cx) / rx;
  const dy = (ny - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function subjectMask(nx, ny) {
  return (
    insideEllipse(nx, ny, 0.48, 0.45, 0.36, 0.42) ||
    insideEllipse(nx, ny, 0.49, 0.70, 0.32, 0.25) ||
    insideEllipse(nx, ny, 0.31, 0.60, 0.19, 0.31) ||
    insideEllipse(nx, ny, 0.67, 0.61, 0.22, 0.31) ||
    insideEllipse(nx, ny, 0.58, 0.35, 0.22, 0.17)
  );
}

function inferRegion(nx, ny, energy) {
  const head = insideEllipse(nx, ny, 0.56, 0.36, 0.23, 0.19);
  const muzzle = insideEllipse(nx, ny, 0.67, 0.43, 0.13, 0.10);
  const eyeBand = ny > 0.28 && ny < 0.39 && nx > 0.49 && nx < 0.68;
  const mane = nx < 0.56 && ny > 0.17 && ny < 0.68;
  const paws = ny > 0.73;

  if (eyeBand || muzzle) return 4;
  if (head) return 3;
  if (energy > 0.78) return 5;
  if (mane) return 2;
  if (paws) return 1;
  return 0;
}

function formationOrder(nx, ny, region, energy) {
  const regionBias = [0.18, 0.28, 0.08, 0.0, 0.0, 0.05][region] ?? 0.12;
  const centerDistance = Math.hypot(nx - 0.56, ny - 0.39);
  return clamp(0.05 + regionBias + centerDistance * 0.42 + (1 - energy) * 0.12, 0, 0.92);
}

function pack565(r, g, b) {
  const rr = Math.round(clamp(r / 255) * 31);
  const gg = Math.round(clamp(g / 255) * 63);
  const bb = Math.round(clamp(b / 255) * 31);
  return (rr << 11) | (gg << 5) | bb;
}

const resized = sharp(referencePath).resize(WIDTH, HEIGHT, {
  fit: "fill",
  kernel: sharp.kernel.lanczos3,
});

const [{ data: rgb }, blurred] = await Promise.all([
  resized.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  resized.clone().greyscale().blur(3.2).raw().toBuffer(),
]);

const luminance = new Float32Array(WIDTH * HEIGHT);
for (let i = 0; i < WIDTH * HEIGHT; i += 1) {
  const r = rgb[i * 3];
  const g = rgb[i * 3 + 1];
  const b = rgb[i * 3 + 2];
  luminance[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

const buckets = new Map();
for (let y = 2; y < HEIGHT - 2; y += 1) {
  for (let x = 2; x < WIDTH - 2; x += 1) {
    const nx = x / (WIDTH - 1);
    const ny = y / (HEIGHT - 1);
    if (!subjectMask(nx, ny)) continue;

    const i = y * WIDTH + x;
    const l = luminance[i];
    const gx = Math.abs(luminance[i + 1] - luminance[i - 1]);
    const gy = Math.abs(luminance[i + WIDTH] - luminance[i - WIDTH]);
    const gradient = clamp(Math.hypot(gx, gy) * 8.0);
    const localContrast = clamp((l - blurred[i] / 255) * 7.0);
    const colorMax = Math.max(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) / 255;

    let score = Math.pow(l, 1.35) * 0.66 + gradient * 0.23 + localContrast * 0.08 + colorMax * 0.03;
    score = clamp(score);

    const probability = clamp((score - 0.018) * 6.0, 0, 0.96);
    const noise = unitHash(i * 374761393 + 668265263);
    if (noise > probability) continue;

    const key = `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`;
    const importance = score + gradient * 0.18 + localContrast * 0.07;
    const current = buckets.get(key);
    if (!current || importance > current.importance) {
      buckets.set(key, {
        x,
        y,
        nx,
        ny,
        l,
        gradient,
        localContrast,
        importance,
        r: rgb[i * 3],
        g: rgb[i * 3 + 1],
        b: rgb[i * 3 + 2],
      });
    }
  }
}

const anchors = [...buckets.values()]
  .sort((a, b) => b.importance - a.importance)
  .map((sample, index) => {
    const centeredX = (sample.nx - 0.5) * 4.9;
    const centeredY = (0.5 - sample.ny) * 4.9;
    const centerFalloff = clamp(1 - Math.hypot(sample.nx - 0.54, sample.ny - 0.48) / 0.65);
    const energy = clamp(sample.l * 0.62 + sample.gradient * 0.28 + sample.localContrast * 0.10);
    const region = inferRegion(sample.nx, sample.ny, energy);
    const depthNoise = unitHash(index * 1103515245 + 12345) - 0.5;
    const depth = clamp(sample.l * 0.44 + centerFalloff * 0.26 + depthNoise * 0.10, 0, 0.88) - 0.38;
    const order = formationOrder(sample.nx, sample.ny, region, energy);

    return {
      ...sample,
      px: centeredX,
      py: centeredY,
      pz: depth,
      energy,
      region,
      order,
    };
  });

if (anchors.length > 65535) throw new Error("Too many anchors for uint16 line indices.");

const spatialCell = 0.115;
const grid = new Map();
for (let i = 0; i < anchors.length; i += 1) {
  const a = anchors[i];
  const gx = Math.floor(a.px / spatialCell);
  const gy = Math.floor(a.py / spatialCell);
  const key = `${gx}:${gy}`;
  const list = grid.get(key) ?? [];
  list.push(i);
  grid.set(key, list);
}

const lineCandidates = [];
for (let i = 0; i < anchors.length; i += 1) {
  const a = anchors[i];
  const gx = Math.floor(a.px / spatialCell);
  const gy = Math.floor(a.py / spatialCell);
  let best = null;

  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const nearby = grid.get(`${gx + ox}:${gy + oy}`) ?? [];
      for (const j of nearby) {
        if (j <= i) continue;
        const b = anchors[j];
        if (Math.abs(a.region - b.region) > 2) continue;
        const d = Math.hypot(a.px - b.px, a.py - b.py);
        if (d > 0.17) continue;
        const value = d - (a.energy + b.energy) * 0.012 + unitHash(i * 92821 + j * 68917) * 0.008;
        if (!best || value < best.value) best = { i, j, value };
      }
    }
  }

  if (best && unitHash(i * 747796405 + 2891336453) < 0.72) lineCandidates.push(best);
}

lineCandidates.sort((a, b) => a.value - b.value);
const lines = lineCandidates.slice(0, MAX_LINES);

const headerBytes = 20;
const recordBytes = 10;
const buffer = Buffer.allocUnsafe(headerBytes + anchors.length * recordBytes + lines.length * 4);
buffer.fill(0, 0, headerBytes);
buffer.write("LIONA03", 0, "ascii");
buffer.writeUInt16LE(3, 8);
buffer.writeUInt16LE(recordBytes, 10);
buffer.writeUInt32LE(anchors.length, 12);
buffer.writeUInt32LE(lines.length, 16);

let offset = headerBytes;
for (const a of anchors) {
  const x = Math.round(clamp(a.px, -3.99, 3.99) * 8192);
  const y = Math.round(clamp(a.py, -3.99, 3.99) * 8192);
  const z = Math.round(clamp(a.pz, -0.99, 0.99) * 32767);
  const rgb565 = pack565(a.r, a.g, a.b);
  const energyBits = Math.round(clamp(a.energy) * 63) & 63;
  const regionBits = (a.region & 7) << 6;
  const orderBits = (Math.round(clamp(a.order) * 127) & 127) << 9;
  const meta = energyBits | regionBits | orderBits;

  buffer.writeInt16LE(x, offset);
  buffer.writeInt16LE(y, offset + 2);
  buffer.writeInt16LE(z, offset + 4);
  buffer.writeUInt16LE(rgb565, offset + 6);
  buffer.writeUInt16LE(meta, offset + 8);
  offset += recordBytes;
}

for (const line of lines) {
  buffer.writeUInt16LE(line.i, offset);
  buffer.writeUInt16LE(line.j, offset + 2);
  offset += 4;
}

const base64 = buffer.toString("base64");
const chunkSize = Math.ceil(base64.length / CHUNKS);
await fs.mkdir(OUT_DIR, { recursive: true });

const imports = [];
const names = [];
for (let i = 0; i < CHUNKS; i += 1) {
  const chunk = base64.slice(i * chunkSize, (i + 1) * chunkSize);
  const name = `lionPayload${i}`;
  imports.push(`import { ${name} } from "./${name}";`);
  names.push(name);
  await fs.writeFile(
    path.join(OUT_DIR, `${name}.ts`),
    `export const ${name} = ${JSON.stringify(chunk)};\n`,
    "utf8",
  );
}

await fs.writeFile(
  path.join(OUT_DIR, "lionPayload.ts"),
  `${imports.join("\n")}\n\nexport const LION_PARTICLE_BASE64 =\n  ${names.join(" +\n  ")};\n\nexport const LION_CHILDREN_PER_ANCHOR = 7;\n`,
  "utf8",
);

console.log(
  `Generated ${anchors.length.toLocaleString()} structural anchors, ${lines.length.toLocaleString()} fiber links, ${buffer.length.toLocaleString()} bytes.`,
);
console.log(`Runtime point count: ${(anchors.length * 7).toLocaleString()}.`);
console.log(`Source reference is not copied into the application or served at runtime.`);

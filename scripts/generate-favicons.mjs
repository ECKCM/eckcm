import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const svgRaw = readFileSync(
  join(root, "public/images/eckcm_official_logo.svg"),
  "utf-8"
);

// ── Extract path data from the original SVG ──

function extractPaths(svg) {
  const pathRegex = /<path\s+fill="([^"]+)"[^>]*\s+d="([^"]+)"/g;
  const paths = [];
  let match;
  while ((match = pathRegex.exec(svg)) !== null) {
    paths.push({ fill: match[1], d: match[2] });
  }
  return paths;
}

const paths = extractPaths(svgRaw);
// paths[0] = main compound path (currentColor) - filled rectangle + inner subpaths
// paths[1] = main background area + text bounding boxes (var(--background...))
// paths[2] = upper-left triangle background
// paths[3] = upper-right shape background
// paths[4-8] = text letters M, K, C, C, E (currentColor)

const bgPaths = paths.filter((p) =>
  p.fill.startsWith("var(--background")
);
const textPaths = paths.slice(4); // 5 letter paths

// ── 1. Generate icon.svg (vector favicon with mask) ──

function generateIconSvg() {
  const maskPaths = bgPaths
    .map((p) => `      <path fill="black" d="${p.d}"/>`)
    .join("\n");

  const letterPaths = textPaths
    .map((p) => `  <path class="fg" d="${p.d}"/>`)
    .join("\n");

  // viewBox crops to inner content area (removes ~65px border frame)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="65 65 1311 1312">
  <style>
    .fg { fill: #2e7d32 }
    @media (prefers-color-scheme: dark) {
      .fg { fill: #66bb6a }
    }
  </style>
  <defs>
    <mask id="m">
      <rect x="65" y="65" width="1311" height="1312" fill="white"/>
${maskPaths}
    </mask>
  </defs>
  <rect x="65" y="65" width="1311" height="1312" class="fg" mask="url(#m)"/>
${letterPaths}
</svg>`;

  writeFileSync(join(root, "src/app/icon.svg"), svg);
  console.log("  icon.svg (vector, dark/light mode)");
}

// ── 2. Generate raster favicons (PNG, ICO) ──

const FG_COLOR = "#2e7d32";

async function getTransparentCross() {
  const svgForRender = svgRaw
    .replace(/fill="currentColor"/g, `fill="${FG_COLOR}"`)
    .replace(/fill="var\(--background, #FFFFFF\)"/g, 'fill="#ffffff"');

  const svgBuffer = Buffer.from(svgForRender);
  const renderSize = 1440;

  // Render at native SVG resolution
  const renderedPng = await sharp(svgBuffer)
    .resize(renderSize, renderSize)
    .png()
    .toBuffer();

  // Crop inner area (remove ~65px border frame on all sides)
  // Inner content: roughly (65,65) to (1376,1377)
  const cropX = 66;
  const cropY = 66;
  const cropW = 1308;
  const cropH = 1310;

  const { data, info } = await sharp(renderedPng)
    .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Make white/near-white pixels transparent, smooth anti-aliased edges
  const threshold = 240;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    if (r > threshold && g > threshold && b > threshold) {
      data[i + 3] = 0; // fully transparent
    } else if (r > 200 && g > 200 && b > 200) {
      // Semi-transparent for anti-aliased edge pixels
      const brightness = (r + g + b) / 3;
      const alpha = Math.round(255 * (1 - (brightness - 200) / 40));
      const factor = alpha / 255;
      data[i] = Math.round(data[i] * factor);
      data[i + 1] = Math.round(data[i + 1] * factor);
      data[i + 2] = Math.round(data[i + 2] * factor);
      data[i + 3] = alpha;
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  });
}

async function generateIco(crossImg, outputPath) {
  const sizes = [16, 32];
  const pngBuffers = [];

  for (const size of sizes) {
    const pngBuf = await crossImg.clone().resize(size, size).png().toBuffer();
    pngBuffers.push({ size, buffer: pngBuf });
  }

  // Build ICO file format
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * numImages;
  let totalDataSize = 0;
  for (const p of pngBuffers) totalDataSize += p.buffer.length;

  const icoBuffer = Buffer.alloc(headerSize + dirSize + totalDataSize);

  // ICO Header
  icoBuffer.writeUInt16LE(0, 0); // reserved
  icoBuffer.writeUInt16LE(1, 2); // type: ICO
  icoBuffer.writeUInt16LE(numImages, 4);

  let dataOffset = headerSize + dirSize;
  for (let i = 0; i < numImages; i++) {
    const { size, buffer } = pngBuffers[i];
    const entryOffset = headerSize + i * dirEntrySize;

    icoBuffer.writeUInt8(size < 256 ? size : 0, entryOffset); // width
    icoBuffer.writeUInt8(size < 256 ? size : 0, entryOffset + 1); // height
    icoBuffer.writeUInt8(0, entryOffset + 2); // color palette
    icoBuffer.writeUInt8(0, entryOffset + 3); // reserved
    icoBuffer.writeUInt16LE(1, entryOffset + 4); // color planes
    icoBuffer.writeUInt16LE(32, entryOffset + 6); // bits per pixel
    icoBuffer.writeUInt32LE(buffer.length, entryOffset + 8); // size
    icoBuffer.writeUInt32LE(dataOffset, entryOffset + 12); // offset

    buffer.copy(icoBuffer, dataOffset);
    dataOffset += buffer.length;
  }

  writeFileSync(outputPath, icoBuffer);
  console.log("  16+32 → favicon.ico");
}

// ── Main ──

async function main() {
  console.log(
    "Generating favicons (cross mark on transparent background)...\n"
  );

  mkdirSync(join(root, "public/icons"), { recursive: true });

  // Vector SVG favicon
  console.log("SVG:");
  generateIconSvg();

  // Raster favicons
  const crossImg = await getTransparentCross();

  console.log("\nPNG icons:");
  const targets = [
    { size: 180, path: join(root, "src/app/apple-icon.png") },
    { size: 192, path: join(root, "public/icons/icon-192.png") },
    { size: 512, path: join(root, "public/icons/icon-512.png") },
  ];

  for (const { size, path } of targets) {
    await crossImg.clone().resize(size, size).png().toFile(path);
    console.log(`  ${size}x${size} → ${path.split("/").pop()}`);
  }

  console.log("\nICO:");
  await generateIco(crossImg, join(root, "src/app/favicon.ico"));

  // Also save a debug 512px PNG to check the result
  await crossImg
    .clone()
    .resize(512, 512)
    .png()
    .toFile(join(root, "scripts/debug-cross-512.png"));
  console.log("\n  (debug: scripts/debug-cross-512.png)");

  console.log("\nAll favicons generated!");
}

main().catch(console.error);

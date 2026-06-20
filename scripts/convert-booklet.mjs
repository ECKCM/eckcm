#!/usr/bin/env node
// Local, offline booklet converter: PDF -> per-page WebP + manifest.json.
// Uses pdf-to-img (pdfjs + @napi-rs/canvas) and sharp. devDependency only —
// never imported by the Next.js runtime. Run on the host that has the PDF.
//
//   node scripts/convert-booklet.mjs "<input.pdf>" [outDir] [--probe]
//
// --probe converts only the first 2 pages and prints a size estimate.
import { pdf } from "pdf-to-img";
import sharp from "sharp";
import { mkdir, writeFile, rm, copyFile } from "node:fs/promises";
import path from "node:path";

const SRC = process.argv[2];
const OUT = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : "booklet-out";
const PROBE = process.argv.includes("--probe");

const WIDTH = 1200; // max rendered width (CSS px); retina-friendly for mobile
const QUALITY = 80; // webp quality
const SCALE = 3; // pdfjs render scale; small-format pages need this to reach WIDTH

if (!SRC) {
  console.error('usage: node scripts/convert-booklet.mjs "<input.pdf>" [outDir] [--probe]');
  process.exit(1);
}

const doc = await pdf(SRC, { scale: SCALE });
const total = doc.length;
console.log(`source: ${SRC}`);
console.log(`pages: ${total}, scale: ${SCALE}, target width: ${WIDTH}px, webp q${QUALITY}`);

await rm(OUT, { recursive: true, force: true });
await mkdir(path.join(OUT, "pages"), { recursive: true });

const n = PROBE ? Math.min(2, total) : total;
const pages = [];
let totalBytes = 0;
let firstBytes = 0;

for (let i = 1; i <= n; i++) {
  const png = await doc.getPage(i);
  const webp = await sharp(png)
    .resize({ width: WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer();
  const rel = `pages/page-${String(i).padStart(3, "0")}.webp`;
  await writeFile(path.join(OUT, rel), webp);
  const m = await sharp(webp).metadata();
  pages.push({ src: rel, w: m.width, h: m.height });
  totalBytes += webp.length;
  if (i === 1) firstBytes = webp.length;
  if (PROBE || i === 1 || i % 10 === 0 || i === n) {
    console.log(`  ${rel}: ${(webp.length / 1024).toFixed(0)}KB ${m.width}x${m.height}`);
  }
}
await doc.destroy();

if (PROBE) {
  const avg = totalBytes / n;
  console.log(
    `PROBE ${n}p: avg ${(avg / 1024).toFixed(0)}KB/page -> est total ${((avg * total) / 1024 / 1024).toFixed(2)}MB for ${total}p`
  );
} else {
  // Copy original PDF alongside for the in-viewer "Download PDF" link.
  await copyFile(SRC, path.join(OUT, "booklet.pdf"));
  const manifest = { version: 1, pageCount: total, pdf: "booklet.pdf", pages };
  await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(
    `done: ${pages.length} pages, images total ${(totalBytes / 1024 / 1024).toFixed(2)}MB, first page ${(
      firstBytes / 1024
    ).toFixed(0)}KB -> ${OUT}/`
  );
}

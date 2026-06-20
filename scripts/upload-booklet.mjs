#!/usr/bin/env node
// Upload the converted booklet (pages/*.webp + manifest.json + booklet.pdf)
// to the public Supabase Storage "booklet" bucket, and point
// app_config.booklet_url at the PDF so the dashboard/e-pass buttons light up.
//
// Run with Node's env-file loader so it picks up the service-role key:
//   node --env-file=.env.local scripts/upload-booklet.mjs [outDir]
//
// Pages + PDF get a 1-year immutable cache; the small manifest gets a short
// cache so a future re-upload shows up quickly.
import { createClient } from "@supabase/supabase-js";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OUT = process.argv[2] || "booklet-out";
const BUCKET = "booklet";
const IMMUTABLE = "31536000"; // 1 year (seconds)
const MANIFEST_CACHE = "300"; // 5 minutes

if (!URL || !KEY) {
  console.error("Missing env. Run: node --env-file=.env.local scripts/upload-booklet.mjs");
  process.exit(1);
}

const supa = createClient(URL, KEY, { auth: { persistSession: false } });

// Ensure the public bucket exists (no-op if already there).
const { error: bucketErr } = await supa.storage.createBucket(BUCKET, { public: true });
if (bucketErr && !/exist/i.test(bucketErr.message)) {
  console.error(`createBucket: ${bucketErr.message}`);
  process.exit(1);
}

async function up(localRel, remotePath, contentType, cacheControl) {
  const body = await readFile(path.join(OUT, localRel));
  const { error } = await supa.storage
    .from(BUCKET)
    .upload(remotePath, body, { contentType, cacheControl, upsert: true });
  if (error) throw new Error(`${remotePath}: ${error.message}`);
  console.log(`  ✓ ${remotePath} (${(body.length / 1024).toFixed(0)}KB)`);
}

console.log(`Uploading ${OUT}/ -> ${URL.replace(/https:\/\/([a-z0-9]{4}).*/, "https://$1***")} bucket "${BUCKET}"`);

const pageFiles = (await readdir(path.join(OUT, "pages")))
  .filter((f) => f.endsWith(".webp"))
  .sort();
for (const f of pageFiles) {
  await up(`pages/${f}`, `pages/${f}`, "image/webp", IMMUTABLE);
}
await up("booklet.pdf", "booklet.pdf", "application/pdf", IMMUTABLE);
await up("manifest.json", "manifest.json", "application/json", MANIFEST_CACHE);

const { data } = supa.storage.from(BUCKET).getPublicUrl("booklet.pdf");
const pdfUrl = data.publicUrl;

const { error: cfgErr } = await supa
  .from("eckcm_app_config")
  .update({ booklet_url: pdfUrl })
  .eq("id", 1);
if (cfgErr) throw new Error(`app_config update: ${cfgErr.message}`);

console.log(`app_config.booklet_url -> ${pdfUrl}`);
console.log(`Done: ${pageFiles.length} pages + manifest + pdf uploaded.`);

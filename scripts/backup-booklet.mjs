#!/usr/bin/env node
// Pre-downgrade backup: download every file from the public "booklet" bucket.
//
// The booklet pages can be regenerated from convert-booklet.mjs + the source
// PDF, but grabbing a literal copy before the Supabase downgrade is cheap
// insurance (50 files, ~29 MB).
//
//   node --env-file=.env.local scripts/backup-booklet.mjs [outDir]
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OUT = process.argv[2] || "backups/booklet";
const BUCKET = "booklet";

if (!URL || !KEY) {
  console.error("Missing env. Run: node --env-file=.env.local scripts/backup-booklet.mjs [outDir]");
  process.exit(1);
}

const supa = createClient(URL, KEY, { auth: { persistSession: false } });

// List recursively: the bucket holds top-level files plus a pages/ folder.
async function listAll(prefix = "") {
  const { data, error } = await supa.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw new Error(`list ${prefix}: ${error.message}`);
  const files = [];
  for (const entry of data) {
    const full = prefix ? `${prefix}/${entry.name}` : entry.name;
    // Folders have a null id in the Storage API.
    if (entry.id === null) files.push(...(await listAll(full)));
    else files.push(full);
  }
  return files;
}

const paths = await listAll();
console.log(`${paths.length} files in "${BUCKET}"`);

for (const p of paths) {
  const { data, error } = await supa.storage.from(BUCKET).download(p);
  if (error) {
    console.error(`  ${p}  ERROR: ${error.message}`);
    continue;
  }
  const buf = Buffer.from(await data.arrayBuffer());
  const dest = path.join(OUT, p);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  console.log(`  ${p}  ${(buf.length / 1024).toFixed(0)} kB`);
}

console.log(`\nDone -> ${OUT}/`);

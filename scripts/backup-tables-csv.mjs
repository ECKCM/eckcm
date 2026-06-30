#!/usr/bin/env node
// Pre-downgrade backup: export ECKCM tables to CSV files.
//
// Why: before downgrading Supabase Pro -> Free we lose the automatic daily
// backups (PITR). This grabs a portable, human-readable snapshot of every
// public eckcm_* table (accounting tables first) so the event's registration,
// payment and refund records survive independently of the database.
//
// Run with Node's env-file loader so it picks up the service-role key:
//   node --env-file=.env.local scripts/backup-tables-csv.mjs [outDir]
//
// Output: <outDir>/<table>.csv  (default outDir: backups/<no-date suffix>)
// Pass an outDir that encodes the date yourself, e.g.:
//   node --env-file=.env.local scripts/backup-tables-csv.mjs backups/2026-06-29
import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OUT = process.argv[2] || "backups/eckcm";

if (!URL || !KEY) {
  console.error(
    "Missing env. Run: node --env-file=.env.local scripts/backup-tables-csv.mjs [outDir]",
  );
  process.exit(1);
}

const supa = createClient(URL, KEY, { auth: { persistSession: false } });

// Accounting/money tables first — these are the ones with legal retention
// value and must not be lost. Order is informational only; all are exported.
const TABLES = [
  // --- money / accounting (highest value) ---
  "eckcm_registrations",
  "eckcm_payments",
  "eckcm_invoices",
  "eckcm_invoice_line_items",
  "eckcm_refunds",
  "eckcm_manual_payments",
  "eckcm_manual_receipts",
  "eckcm_custom_payments",
  "eckcm_registration_adjustments",
  "eckcm_funding_allocations",
  "eckcm_participant_transfers",
  // --- people / membership ---
  "eckcm_people",
  "eckcm_saved_persons",
  "eckcm_user_people",
  "eckcm_users",
  "eckcm_groups",
  "eckcm_group_memberships",
  "eckcm_churches",
  // --- meals / passes / checkins ---
  "eckcm_meal_selections",
  "eckcm_meal_passes",
  "eckcm_meal_pass_redemptions",
  "eckcm_checkins",
  "eckcm_scan_sessions",
  // --- lodging ---
  "eckcm_rooms",
  "eckcm_room_assignments",
  "eckcm_willow_assignments",
  "eckcm_floors",
  // --- fee config / inventory ---
  "eckcm_registration_group_fee_categories",
  "eckcm_fee_category_inventory",
  "eckcm_registration_rides",
  // --- passes / tokens ---
  "eckcm_epass_tokens",
  // --- ops / config / audit ---
  "eckcm_registration_drafts",
  "eckcm_audit_logs",
  "eckcm_email_logs",
  "eckcm_email_templates",
  "eckcm_legal_content",
  "eckcm_roles",
  "eckcm_app_config",
];

// Minimal RFC-4180 CSV cell escaping.
function csvCell(v) {
  if (v === null || v === undefined) return "";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const head = cols.map(csvCell).join(",");
  const body = rows.map((r) => cols.map((c) => csvCell(r[c])).join(",")).join("\n");
  return `${head}\n${body}\n`;
}

// Page through a table so we never hit PostgREST's default row cap.
async function fetchAll(table) {
  const PAGE = 1000;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supa
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

await mkdir(OUT, { recursive: true });

let totalRows = 0;
const summary = [];
for (const table of TABLES) {
  try {
    const rows = await fetchAll(table);
    await writeFile(path.join(OUT, `${table}.csv`), toCsv(rows), "utf8");
    totalRows += rows.length;
    summary.push({ table, rows: rows.length });
    console.log(`  ${table.padEnd(42)} ${String(rows.length).padStart(6)} rows`);
  } catch (e) {
    summary.push({ table, rows: "ERROR", error: e.message });
    console.error(`  ${table.padEnd(42)}  ERROR: ${e.message}`);
  }
}

// Drop a manifest so the snapshot is self-describing.
await writeFile(
  path.join(OUT, "_manifest.json"),
  JSON.stringify({ source: URL, tables: summary, totalRows }, null, 2),
  "utf8",
);

console.log(`\nDone. ${summary.length} tables, ${totalRows} rows -> ${OUT}/`);

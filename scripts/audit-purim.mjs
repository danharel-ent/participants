import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  parseCsv,
  readText,
  normalizeZygoRow,
  classifyZygoEvent,
  discoverPurimSources,
  shouldSkipPurimFile,
} from "../lib/load-sources.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PURIM = path.join(ROOT, "purim");

function isZygoScanned(row) {
  const s = String(row.Scanned || "").trim().toLowerCase();
  if (["כן", "yes", "true", "1"].includes(s)) return true;
  if (String(row.Scanned_At || "").trim()) return true;
  if (String(row.Scanned_By || "").trim()) return true;
  return false;
}

function isGoOutScanned(row) {
  if (String(row.scan_status || "").toLowerCase() === "true") return true;
  if (String(row.scan_time || "").trim()) return true;
  if (String(row.scanned_by || "").trim()) return true;
  return false;
}

function isGoOutFree(row) {
  if ((row.status || "").toLowerCase() === "rejected") return true;
  if (String(row.payment_type || "").toLowerCase() === "free") return true;
  const sum = Number(String(row.payment_sum ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isNaN(sum) && sum === 0) return true;
  const item = String(row.item_name || "").toLowerCase();
  if (item.includes("invitation")) return true;
  return false;
}

function isZygoFree(row) {
  const r = normalizeZygoRow(row);
  const name = String(r.TicketName || "").toLowerCase();
  if (name.includes("free ticket") || name.includes("חינם")) return true;
  if (String(r.PaymentMode || "").toLowerCase() === "free") return true;
  if (String(r.Gateway || "").toLowerCase() === "free") return true;
  return false;
}

const allFiles = fs.readdirSync(PURIM);
console.log("=== purim/ (v4 discovery) ===\n");
console.log("Skipped (legacy duplicate):");
for (const f of allFiles) {
  if (shouldSkipPurimFile(f, allFiles)) console.log("  -", f);
}
console.log("");

const { goOut, zygo } = discoverPurimSources(PURIM);

for (const { fileName, event, rows } of goOut) {
  const accepted = rows.filter((r) => (r.status || "").toLowerCase() === "accepted");
  const rejected = rows.length - accepted.length;
  const paid = accepted.filter((r) => !isGoOutFree(r));
  const scannedPaid = paid.filter(isGoOutScanned);
  console.log(fileName, "→", event, "[go-out]");
  console.log("  rows:", rows.length, "rejected:", rejected);
  console.log("  paid:", paid.length, "scanned paid:", scannedPaid.length);
  console.log("  eligible after scan:", paid.length - scannedPaid.length);
  console.log("");
}

const byEvent = new Map();
for (const { fileName, rows } of zygo) {
  for (const raw of rows) {
    const row = normalizeZygoRow(raw);
    const ev = classifyZygoEvent(row);
    if (!byEvent.has(ev)) byEvent.set(ev, { rows: [], files: new Set() });
    byEvent.get(ev).rows.push(row);
    byEvent.get(ev).files.add(fileName);
  }
}

for (const { fileName, rows } of zygo) {
  console.log(fileName, "[zygo — split by ticket name]");
  const counts = {};
  for (const raw of rows) {
    const ev = classifyZygoEvent(normalizeZygoRow(raw));
    counts[ev] = (counts[ev] || 0) + 1;
  }
  for (const [ev, n] of Object.entries(counts)) {
    console.log("  →", ev + ":", n, "rows");
  }
  console.log("");
}

for (const [ev, { rows, files }] of byEvent) {
  const paid = rows.filter((r) => !isZygoFree(r));
  const scannedPaid = paid.filter(isZygoScanned);
  console.log(ev, "[zygo combined from:", [...files].join(", ") + "]");
  console.log("  paid:", paid.length, "scanned:", scannedPaid.length);
  console.log("  eligible after scan:", paid.length - scannedPaid.length);
  console.log("");
}

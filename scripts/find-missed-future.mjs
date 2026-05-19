import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseCsv, readText, normalizeZygoRow } from "../lib/load-sources.mjs";
import { buildAllData, normPhone, normEmail } from "./build-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function isZygoScanned(row) {
  const s = String(row.Scanned || "").trim().toLowerCase();
  if (["כן", "yes", "true", "1"].includes(s)) return true;
  if (String(row.Scanned_At || "").trim()) return true;
  if (String(row.Scanned_By || "").trim()) return true;
  return false;
}

function idsZygo(row) {
  const qr = row.Qr_Code_Link || "";
  return {
    phone: normPhone(row.Phone),
    email: normEmail(row.Email),
    qrId: qr.includes("/ticket/") ? qr.split("/ticket/")[1] : "",
    orderId: (row.OrderId || "").trim(),
    name: `${row.FirstName || ""} ${row.LastName || ""}`.trim(),
  };
}

function idsP(p) {
  const qr = p.qr || "";
  return {
    phone: normPhone(p.טלפון),
    email: normEmail(p.אימייל),
    qrId: qr.includes("/ticket/") ? qr.split("/ticket/")[1] : "",
    orderId: (p.order_id || "").trim(),
    name: p.שם,
  };
}

function matchAny(a, b) {
  if (a.phone && b.phone && a.phone === b.phone) return "phone";
  if (a.email && b.email && a.email === b.email) return "email";
  if (a.qrId && b.qrId && a.qrId === b.qrId) return "qr";
  if (a.orderId && b.orderId && a.orderId === b.orderId) return "order";
  return null;
}

const { participants } = buildAllData();
const eligible = participants;

const futureScanned = [];
for (const file of ["future projects/שבועות.csv", "future projects/זיגו תל אביב רוקח.csv"]) {
  const rows = parseCsv(readText(path.join(ROOT, file))).map(normalizeZygoRow);
  for (const row of rows.filter(isZygoScanned)) {
    futureScanned.push({ file, ...idsZygo(row), row });
  }
}

const missed = [];
for (const p of eligible) {
  const pid = idsP(p);
  for (const f of futureScanned) {
    const m = matchAny(pid, f);
    if (m) {
      missed.push({ purim: p, future: f, via: m });
      break;
    }
  }
}

console.log("Future scanned rows:", futureScanned.length);
console.log("Eligible count:", eligible.length);
console.log("MISSED (eligible but future scanned):", missed.length);
for (const x of missed.slice(0, 15)) {
  console.log("-", x.purim.שם, "| purim:", x.purim.אירוע, "| future:", x.future.file, "| via:", x.via);
}

// Also: all future rows (not just scanned) vs eligible
const futureAll = [];
for (const file of ["future projects/שבועות.csv", "future projects/זיגו תל אביב רוקח.csv"]) {
  const rows = parseCsv(readText(path.join(ROOT, file))).map(normalizeZygoRow);
  for (const row of rows) futureAll.push({ file, ...idsZygo(row) });
}
let missedAll = 0;
for (const p of eligible) {
  const pid = idsP(p);
  if (futureAll.some((f) => matchAny(pid, f))) missedAll++;
}
console.log("\nEligible matching ANY future row:", missedAll);

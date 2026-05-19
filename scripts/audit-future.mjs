import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseCsv, readText, normalizeZygoRow } from "../lib/load-sources.mjs";
import { normPhone, normEmail } from "../scripts/build-data.mjs";

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
  const qrId = qr.includes("/ticket/") ? qr.split("/ticket/")[1] : "";
  return {
    phone: normPhone(row.Phone),
    email: normEmail(row.Email),
    qrId,
    orderId: (row.OrderId || "").trim(),
  };
}

function idsParticipant(p) {
  const qr = p.qr || "";
  const qrId = qr.includes("/ticket/") ? qr.split("/ticket/")[1] : qr.includes("id=") ? (qr.match(/id=([^&]+)/) || [])[1] : "";
  return {
    phone: normPhone(p.טלפון),
    email: normEmail(p.אימייל),
    qrId,
    orderId: (p.order_id || "").trim(),
  };
}

function matches(reg, ids) {
  if (ids.phone && reg.phones.has(ids.phone)) return true;
  if (ids.email && reg.emails.has(ids.email)) return true;
  if (ids.qrId && reg.qrIds.has(ids.qrId)) return true;
  if (ids.orderId && reg.orderIds.has(ids.orderId)) return true;
  return false;
}

const participants = JSON.parse(fs.readFileSync(path.join(ROOT, "data/participants.json"), "utf8"));

// simulate step2 pool - load all purim after scan would need full build - use participants + preScanned inverse
// Better: run build and check who should be removed

const files = [
  { file: "future projects/שבועות.csv", label: "שבועות" },
  { file: "future projects/זיגו תל אביב רוקח.csv", label: "רוקח" },
];

let allScanned = 0;
let allRows = 0;
let matchedEligible = 0;
let matchedButStillEligible = [];

for (const { file, label } of files) {
  const rows = parseCsv(readText(path.join(ROOT, file))).map(normalizeZygoRow);
  const scanned = rows.filter(isZygoScanned);
  allScanned += scanned.length;
  allRows += rows.length;

  const regAll = { phones: new Set(), emails: new Set(), qrIds: new Set(), orderIds: new Set() };
  const regScanned = { phones: new Set(), emails: new Set(), qrIds: new Set(), orderIds: new Set() };

  for (const row of rows) {
    const ids = idsZygo(row);
    if (ids.phone) regAll.phones.add(ids.phone);
    if (ids.email) regAll.emails.add(ids.email);
    if (ids.qrId) regAll.qrIds.add(ids.qrId);
    if (ids.orderId) regAll.orderIds.add(ids.orderId);
    if (isZygoScanned(row)) {
      if (ids.phone) regScanned.phones.add(ids.phone);
      if (ids.email) regScanned.emails.add(ids.email);
      if (ids.qrId) regScanned.qrIds.add(ids.qrId);
      if (ids.orderId) regScanned.orderIds.add(ids.orderId);
    }
  }

  for (const p of participants) {
    const ids = idsParticipant(p);
    if (matches(regScanned, ids)) {
      matchedButStillEligible.push({ label, name: p.שם, event: p.אירוע, ids });
    }
    if (matches(regAll, ids)) matchedEligible++;
  }

  console.log(label, "rows", rows.length, "scanned", scanned.length);
  console.log("  reg scanned phones", regScanned.phones.size, "emails", regScanned.emails.size);
}

console.log("\nStill eligible but match FUTURE SCANNED:", matchedButStillEligible.length);
console.log("Sample:", matchedButStillEligible.slice(0, 5));

// scanned future not matching any eligible
const regScannedOnly = { phones: new Set(), emails: new Set(), qrIds: new Set(), orderIds: new Set() };
for (const { file } of files) {
  const rows = parseCsv(readText(path.join(ROOT, file))).map(normalizeZygoRow);
  for (const row of rows.filter(isZygoScanned)) {
    const ids = idsZygo(row);
    if (ids.phone) regScannedOnly.phones.add(ids.phone);
    if (ids.email) regScannedOnly.emails.add(ids.email);
    if (ids.qrId) regScannedOnly.qrIds.add(ids.qrId);
    if (ids.orderId) regScannedOnly.orderIds.add(ids.orderId);
  }
}

let shouldRemove = 0;
for (const p of participants) {
  if (matches(regScannedOnly, idsParticipant(p))) shouldRemove++;
}
console.log("\nEligible that SHOULD be removed by scanned-only future:", shouldRemove);

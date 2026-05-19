import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseCsv, readText, normalizeZygoRow } from "../lib/load-sources.mjs";
import { buildAllData, normPhone, normEmail, isZygoFree, isZygoScanned } from "./build-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function idsZygo(row) {
  const qr = row.Qr_Code_Link || "";
  return {
    phone: normPhone(row.Phone),
    email: normEmail(row.Email),
    qrId: qr.includes("/ticket/") ? qr.split("/ticket/")[1] : "",
    orderId: (row.OrderId || "").trim(),
  };
}

function addReg(reg, ids) {
  if (ids.phone) reg.phones.add(ids.phone);
  if (ids.email) reg.emails.add(ids.email);
  if (ids.qrId) reg.qrIds.add(ids.qrId);
  if (ids.orderId) reg.orderIds.add(ids.orderId);
}

function buildReg(rows, filterFn) {
  const reg = { phones: new Set(), emails: new Set(), qrIds: new Set(), orderIds: new Set() };
  const byOrder = new Map();
  for (const row of rows) {
    if (!filterFn(row)) continue;
    const oid = row.OrderId;
    if (!byOrder.has(oid)) byOrder.set(oid, []);
    byOrder.get(oid).push(row);
  }
  for (const [, group] of byOrder) {
    for (const row of group) {
      for (const r of group) addReg(reg, idsZygo(r));
      addReg(reg, idsZygo(row));
    }
  }
  return reg;
}

function matches(reg, ids) {
  if (ids.phone && reg.phones.has(ids.phone)) return true;
  if (ids.email && reg.emails.has(ids.email)) return true;
  if (ids.qrId && reg.qrIds.has(ids.qrId)) return true;
  if (ids.orderId && reg.orderIds.has(ids.orderId)) return true;
  return false;
}

// step2 pool = simulate by building and adding back future-removed... easier: read from build internals
const payload = buildAllData();
const eligible = payload.participants;

// Re-get step2: eligible + future removed from preScanned keys in step3
// Approximation: use all purim paid minus purim scanned only
const pre = JSON.parse(fs.readFileSync(path.join(ROOT, "data/preScanned.json"), "utf8"));
const futureKeys = Object.keys(pre).filter((k) => {
  // future removed are keys still in pre but not purim scanned - hard to split
  return true;
});

const files = ["future projects/שבועות.csv", "future projects/זיגו תל אביב רוקח.csv"];
const allRows = [];
for (const f of files) {
  allRows.push(...parseCsv(readText(path.join(ROOT, f))).map(normalizeZygoRow));
}

const rules = {
  allRows: (r) => true,
  scannedOnly: (r) => isZygoScanned(r),
  scannedOrPaid: (r) => isZygoScanned(r) || !isZygoFree(r),
  paidOnly: (r) => !isZygoFree(r),
};

for (const [name, filterFn] of Object.entries(rules)) {
  const reg = buildReg(allRows, filterFn);
  let hit = 0;
  for (const p of eligible) {
    const ids = {
      phone: normPhone(p.טלפון),
      email: normEmail(p.אימייל),
      qrId: (p.qr || "").includes("/ticket/") ? p.qr.split("/ticket/")[1] : "",
      orderId: (p.order_id || "").trim(),
    };
    if (matches(reg, ids)) hit++;
  }
  console.log(name, "would still be eligible but match future:", hit);
}

console.log("current step3 removed:", payload.meta.pipeline.step3_afterFutureMatch.totalRemoved);

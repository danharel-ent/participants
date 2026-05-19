import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseCsv, readText, normalizeZygoRow } from "../lib/load-sources.mjs";
import { normPhone, normEmail, isZygoScanned, isZygoFree } from "./build-data.mjs";

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

function buildRegScannedWithOrders(rows) {
  const reg = { phones: new Set(), emails: new Set(), qrIds: new Set(), orderIds: new Set() };
  const byOrder = new Map();
  for (const row of rows) byOrder.set(row.OrderId, [...(byOrder.get(row.OrderId) || []), row]);

  for (const row of rows) {
    if (!isZygoScanned(row)) continue;
    const group = byOrder.get(row.OrderId) || [];
    for (const r of group) {
      const ids = idsZygo(r);
      if (ids.phone) reg.phones.add(ids.phone);
      if (ids.email) reg.emails.add(ids.email);
      if (ids.qrId) reg.qrIds.add(ids.qrId);
      if (ids.orderId) reg.orderIds.add(ids.orderId);
    }
  }
  return reg;
}

function buildRegAll(rows) {
  const reg = { phones: new Set(), emails: new Set(), qrIds: new Set(), orderIds: new Set() };
  for (const row of rows) {
    const ids = idsZygo(row);
    if (ids.phone) reg.phones.add(ids.phone);
    if (ids.email) reg.emails.add(ids.email);
    if (ids.qrId) reg.qrIds.add(ids.qrId);
    if (ids.orderId) reg.orderIds.add(ids.orderId);
  }
  return reg;
}

function buildRegScannedOrPaid(rows) {
  const reg = { phones: new Set(), emails: new Set(), qrIds: new Set(), orderIds: new Set() };
  const byOrder = new Map();
  for (const row of rows) byOrder.set(row.OrderId, [...(byOrder.get(row.OrderId) || []), row]);
  for (const row of rows) {
    if (!isZygoScanned(row) && isZygoFree(row)) continue;
    const group = byOrder.get(row.OrderId) || [];
    for (const r of group) {
      const ids = idsZygo(r);
      if (ids.phone) reg.phones.add(ids.phone);
      if (ids.email) reg.emails.add(ids.email);
      if (ids.qrId) reg.qrIds.add(ids.qrId);
      if (ids.orderId) reg.orderIds.add(ids.orderId);
    }
  }
  return reg;
}

// count matches against step2 pool size 587
import { buildAllData } from "./build-data.mjs";
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "data/meta.json"), "utf8"));
console.log("current removed", meta.pipeline.step3_afterFutureMatch.totalRemoved);

const allRows = [];
for (const f of ["future projects/שבועות.csv", "future projects/זיגו תל אביב רוקח.csv"]) {
  allRows.push(...parseCsv(readText(path.join(ROOT, f))).map(normalizeZygoRow));
}

for (const [name, fn] of [
  ["all", buildRegAll],
  ["scanned+order", buildRegScannedWithOrders],
  ["scannedOrPaid+order", buildRegScannedOrPaid],
]) {
  const reg = fn(allRows);
  console.log(name, "phones", reg.phones.size, "emails", reg.emails.size);
}

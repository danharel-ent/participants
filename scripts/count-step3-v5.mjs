import { parseCsv, readText, normalizeZygoRow } from "../lib/load-sources.mjs";
import {
  buildAllData,
  normPhone,
  normEmail,
  isZygoScanned,
  isZygoFree,
  participantKey,
} from "./build-data.mjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Patch test: manually count with new future rule on step2 output
const payload = buildAllData();
const step2Total = payload.meta.pipeline.step2_afterPurimScans.total;
const step3Current = payload.meta.pipeline.step3_afterFutureMatch.totalRemoved;

function idsZygo(row) {
  const qr = row.Qr_Code_Link || "";
  return {
    phone: normPhone(row.Phone),
    email: normEmail(row.Email),
    qrId: qr.includes("/ticket/") ? qr.split("/ticket/")[1] : "",
    orderId: (row.OrderId || "").trim(),
  };
}

function idsParticipant(p) {
  const qr = p.qr || "";
  return {
    phone: normPhone(p.טלפון),
    email: normEmail(p.אימייל),
    qrId: qr.includes("id=") ? (qr.match(/id=([^&]+)/) || [])[1] : qr.includes("/ticket/") ? qr.split("/ticket/")[1] : "",
    orderId: (p.order_id || "").trim(),
  };
}

function buildFutureReg(rows, rule) {
  const reg = { phones: new Set(), emails: new Set(), qrIds: new Set(), orderIds: new Set() };
  const byOrder = new Map();
  for (const row of rows) byOrder.set(row.OrderId, [...(byOrder.get(row.OrderId) || []), row]);

  for (const row of rows) {
    let include = false;
    if (rule === "all") include = true;
    if (rule === "scanned") include = isZygoScanned(row);
    if (rule === "scannedOrPaid") include = isZygoScanned(row) || !isZygoFree(row);

    if (!include) continue;
    for (const r of byOrder.get(row.OrderId) || []) {
      const ids = idsZygo(r);
      if (ids.phone) reg.phones.add(ids.phone);
      if (ids.email) reg.emails.add(ids.email);
      if (ids.qrId) reg.qrIds.add(ids.qrId);
      if (ids.orderId) reg.orderIds.add(ids.orderId);
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

// Reconstruct step2 list: eligible + those removed in step3 only (approx)
const participants = payload.participants;
const pre = JSON.parse(fs.readFileSync(path.join(ROOT, "data/preScanned.json"), "utf8"));

const allRows = [];
for (const f of ["future projects/שבועות.csv", "future projects/זיגו תל אביב רוקח.csv"]) {
  allRows.push(...parseCsv(readText(path.join(ROOT, f))).map(normalizeZygoRow));
}

for (const rule of ["all", "scanned", "scannedOrPaid"]) {
  const reg = buildFutureReg(allRows, rule);
  let removed = 0;
  for (const p of participants) {
    if (matches(reg, idsParticipant(p))) removed++;
  }
  console.log(rule, "would remove from CURRENT eligible:", removed, "(wrong base)");
}

// Better: count additional removals on step2 pool
// Load by re-running build internals - use report
console.log("step2", step2Total, "step3 current", step3Current, "step4", participants.length);

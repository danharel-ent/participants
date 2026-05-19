import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import { fileURLToPath } from "url";
import { buildAllData, normName, normPhone } from "./build-data.mjs";
import { parseCsv, readText, normalizeZygoRow, discoverPurimSources } from "../lib/load-sources.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function keyFromParticipant(p) {
  return `${p.אירוע}::${p.order_id}::${p.טלפון}::${p.אימייל}::${p.qr}`;
}

function loadRedeemedRegistry() {
  const full = path.join(ROOT, "future projects/כרטיסים שמומשו.xlsx");
  const wb = XLSX.readFile(full);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  const phones = new Set();
  const names = new Set();
  for (const row of rows) {
    const phone = normPhone(row.phone || row.Phone || "");
    const name = normName([row.firstName || row.FirstName || "", row.lastName || row.LastName || ""]);
    if (phone) phones.add(phone);
    if (name) names.add(name);
  }
  return { rows, phones, names };
}

function participantIds(p) {
  return {
    phone: normPhone(p.טלפון),
    name: normName(p.שם),
  };
}

// build current (v8 כולל xlsx)
const current = buildAllData();
const finalKeys = new Set(current.participants.map(keyFromParticipant));
const redeemed = loadRedeemedRegistry();

// simulate previous state by running same pipeline but without xlsx:
// easiest: pull from meta step4_afterRedeemedXlsx removed count and inspect remaining overlaps
const stillOverlapping = current.participants.filter((p) => {
  const ids = participantIds(p);
  return (
    (ids.phone && redeemed.phones.has(ids.phone)) ||
    (ids.name && redeemed.names.has(ids.name))
  );
});

console.log("=== ביקורת פספוסי מימושים ===");
console.log("שורות בקובץ מימושים:", redeemed.rows.length);
console.log("זכאים סופיים כרגע:", current.participants.length);
console.log("נשארו זכאים שחופפים לקובץ מימושים (טלפון/שם):", stillOverlapping.length);

// identify people removed by xlsx step מתוך preScanned שנוספו מעבר להסרות סריקה/future
const removedByXlsx = [];
const preScannedKeys = Object.keys(current.preScannedFlat);
for (const key of preScannedKeys) {
  if (finalKeys.has(key)) continue;
  const parts = key.split("::");
  const namePhoneProbe = {
    phone: normPhone(parts[2] || ""),
    name: "",
  };
  if (
    (namePhoneProbe.phone && redeemed.phones.has(namePhoneProbe.phone))
  ) {
    removedByXlsx.push({ key, via: "phone" });
  }
}

console.log("הוסרו דרך זיהוי טלפון מקובץ המימושים:", removedByXlsx.length);

// האם היו אמורים להיפסל קודם דרך scanned/future? דגימת sanity על מצב נוכחי:
const { goOut, zygo } = discoverPurimSources(path.join(ROOT, "purim"));
let purimScannedPhones = new Set();
for (const src of goOut) {
  for (const row of src.rows) {
    if (String(row.scan_status || "").toLowerCase() === "true" || String(row.scan_time || "").trim()) {
      const ph = normPhone(row.phone_number || "");
      if (ph) purimScannedPhones.add(ph);
    }
  }
}
for (const src of zygo) {
  for (const raw of src.rows) {
    const row = normalizeZygoRow(raw);
    const scanned =
      String(row.Scanned || "").trim().toLowerCase() === "כן" ||
      String(row.Scanned_At || "").trim() ||
      String(row.Scanned_By || "").trim();
    if (!scanned) continue;
    const ph = normPhone(row.Phone || "");
    if (ph) purimScannedPhones.add(ph);
  }
}

let suspiciousRemaining = 0;
for (const p of current.participants) {
  const ids = participantIds(p);
  if (ids.phone && purimScannedPhones.has(ids.phone)) suspiciousRemaining++;
}
console.log("זכאים שנותרו אבל נראים כנסרקו ב-purim לפי טלפון:", suspiciousRemaining);


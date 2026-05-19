/**
 * ביקורת אבטחת זכאות — מוודא שאין זכאי שיכול "לרמות" (התאמה לחסומים)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseCsv, readText, normalizeZygoRow } from "../lib/load-sources.mjs";
import {
  buildAllData,
  normPhone,
  normEmail,
  normName,
  isZygoFree,
  isZygoScanned,
  isGoOutScanned,
  isGoOutIneligible,
} from "./build-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function idsP(p) {
  const qr = p.qr || "";
  return {
    phone: normPhone(p.טלפון),
    email: normEmail(p.אימייל),
    name: normName(p.שם),
    orderId: (p.order_id || "").trim().toLowerCase(),
    qrId: qr.includes("/ticket/")
      ? qr.split("/ticket/")[1]
      : qr.match(/[?&]id=([^&]+)/)?.[1] || "",
  };
}

function idsZygo(row) {
  const qr = row.Qr_Code_Link || "";
  return {
    phone: normPhone(row.Phone),
    email: normEmail(row.Email),
    name: normName([row.FirstName, row.LastName].join(" ")),
    orderId: (row.OrderId || "").trim().toLowerCase(),
    qrId: qr.includes("/ticket/") ? qr.split("/ticket/")[1] : "",
  };
}

function matchReason(a, b) {
  if (a.phone && b.phone && a.phone === b.phone) return "טלפון";
  if (a.email && b.email && a.email === b.email) return "אימייל";
  if (a.name && b.name && a.name === b.name) return "שם";
  if (a.orderId && b.orderId && a.orderId === b.orderId) return "הזמנה";
  if (a.qrId && b.qrId && a.qrId === b.qrId) return "QR";
  return null;
}

const { participants, preScannedFlat, meta } = buildAllData();
const preKeys = Object.keys(preScannedFlat);

// --- 1. eligible vs future FREE ---
const futureFreeRows = [];
for (const file of ["future projects/שבועות.csv", "future projects/זיגו תל אביב רוקח.csv"]) {
  const rows = parseCsv(readText(path.join(ROOT, file))).map(normalizeZygoRow);
  for (const row of rows) {
    if (isZygoFree(row)) futureFreeRows.push({ file, row });
  }
}

const leakFuture = [];
for (const p of participants) {
  const pid = idsP(p);
  for (const { file, row } of futureFreeRows) {
    const r = matchReason(pid, idsZygo(row));
    if (r) leakFuture.push({ p, file, via: r, freeName: `${row.FirstName} ${row.LastName}`.trim() });
  }
}

// --- 2. eligible but key in preScanned (purim scan / future removed keys) ---
const leakPreScanned = [];
for (const p of participants) {
  const key = `${p.אירוע}::${p.order_id}::${p.טלפון}::${p.אימייל}::${p.qr}`;
  if (preScannedFlat[key]) leakPreScanned.push({ p, key });
}

// --- 3. eligible with purim scan in source files ---
const purimScannedRegs = { phones: new Set(), emails: new Set(), names: new Set(), qrIds: new Set() };

for (const file of fs.readdirSync(path.join(ROOT, "purim"))) {
  if (!file.endsWith(".csv") && !file.endsWith(".xlsx")) continue;
  const full = path.join(ROOT, "purim", file);
  let rows = [];
  if (file.endsWith(".csv")) {
    rows = parseCsv(readText(full));
    const isGo = rows[0] && "phone_number" in rows[0];
    if (isGo) {
      for (const row of rows) {
        if (isGoOutIneligible(row)) continue;
        if (!isGoOutScanned(row)) continue;
        const ph = normPhone(row.phone_number);
        const em = normEmail(row.mail);
        if (ph) purimScannedRegs.phones.add(ph);
        if (em) purimScannedRegs.emails.add(em);
      }
    } else {
      for (const raw of rows) {
        const row = normalizeZygoRow(raw);
        if (isZygoFree(row)) continue;
        if (!isZygoScanned(row)) continue;
        const ids = idsZygo(row);
        if (ids.phone) purimScannedRegs.phones.add(ids.phone);
        if (ids.email) purimScannedRegs.emails.add(ids.email);
        if (ids.name) purimScannedRegs.names.add(ids.name);
        if (ids.qrId) purimScannedRegs.qrIds.add(ids.qrId);
      }
    }
  }
}

const leakPurimScan = [];
const nameOnlyCollisions = [];
for (const p of participants) {
  const pid = idsP(p);
  if (pid.phone && purimScannedRegs.phones.has(pid.phone)) leakPurimScan.push({ p, via: "טלפון" });
  else if (pid.email && purimScannedRegs.emails.has(pid.email)) leakPurimScan.push({ p, via: "אימייל" });
  else if (pid.qrId && purimScannedRegs.qrIds.has(pid.qrId)) leakPurimScan.push({ p, via: "QR" });
  else if (pid.name && purimScannedRegs.names.has(pid.name))
    nameOnlyCollisions.push({ p, note: "שם זהה לאדם אחר שנסרק — לא נחשב דליפה" });
}

// --- 4. paid in future (should NOT block) — informational only ---
const futurePaidScanned = [];
for (const file of ["future projects/שבועות.csv", "future projects/זיגו תל אביב רוקח.csv"]) {
  const rows = parseCsv(readText(path.join(ROOT, file))).map(normalizeZygoRow);
  for (const row of rows) {
    if (isZygoFree(row)) continue;
    if (isZygoScanned(row)) futurePaidScanned.push(row);
  }
}
const leakPaidFuture = [];
for (const p of participants) {
  const pid = idsP(p);
  for (const row of futurePaidScanned) {
    if (matchReason(pid, idsZygo(row))) {
      leakPaidFuture.push(p);
      break;
    }
  }
}

console.log("=== ביקורת אבטחת זכאות ===\n");
console.log("זכאים סופיים (באתר):", participants.length);
console.log("מפתחות preScanned:", preKeys.length);
console.log("שורות חינם future:", futureFreeRows.length);
console.log("הוסרו בשלב 3 (meta):", meta.pipeline.step3_afterFutureMatch.totalRemoved);
console.log("");

const issues = leakFuture.length + leakPreScanned.length + leakPurimScan.length;

if (leakFuture.length) {
  console.log("❌ בעיה: זכאים שמתאימים לכרטיס חינם בשבועות/רוקח:", leakFuture.length);
  leakFuture.slice(0, 15).forEach((x) =>
    console.log(`  - ${x.p.שם} | ${x.p.אירוע} | via ${x.via} | ${x.file}`)
  );
} else {
  console.log("✅ אין זכאים שמתאימים לכרטיס חינם future");
}

if (leakPreScanned.length) {
  console.log("❌ בעיה: זכאים שמפתח שלהם ב-preScanned:", leakPreScanned.length);
} else {
  console.log("✅ אין זכאים עם מפתח preScanned ישיר");
}

if (leakPurimScan.length) {
  console.log("❌ בעיה: זכאים שנסרקו ב-purim (טלפון/מייל/QR) אבל עדיין ברשימה:", leakPurimScan.length);
  leakPurimScan.slice(0, 10).forEach((x) => console.log(`  - ${x.p.שם} via ${x.via}`));
} else {
  console.log("✅ אין זכאים שנסרקו ב-purim (מזהה חזק)");
}

if (nameOnlyCollisions.length) {
  console.log(
    `ℹ️ התאמות שם בלבד לנסרק אחר (${nameOnlyCollisions.length}) — בדיקה ידנית, לא חוסם אוטומטית:`
  );
  nameOnlyCollisions.slice(0, 5).forEach((x) =>
    console.log(`  - ${x.p.שם} | ${x.p.אירוע} | ${x.p.טלפון}`)
  );
}

if (leakPaidFuture.length) {
  console.log("ℹ️ זכאים שגם נסרקו ב-future בתשלום (לא אמורים להיחסם):", leakPaidFuture.length);
} else {
  console.log("✅ אין חפיפה מיותרת עם future בתשלום");
}

console.log("\n=== סיכום ===");
if (issues === 0) {
  console.log("✅ הביקורת עברה — אין דליפת זכאות ידועה");
  process.exit(0);
} else {
  console.log(`❌ נמצאו ${issues} בעיות שדורשות תיקון ב-build-data`);
  process.exit(1);
}

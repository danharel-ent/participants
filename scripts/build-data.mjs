/**
 * זכאות = purim/ בלבד (כרטיסים בתשלום שלא נסרקו)
 * הסרה נוספת: כל מי שמופיע ב-future projects עם התאמה ל-purim (טלפון/מייל/QR/הזמנה)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  readText,
  parseCsv,
  normalizeZygoRow,
  classifyZygoEvent,
  discoverPurimSources,
} from "../lib/load-sources.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PURIM_DIR = path.join(ROOT, "purim");

const EVENT_COLORS = {
  "הרצליה זיגו": { a: "#e94560", t: "rgba(233,69,96,.18)", tc: "#f87171" },
  "פרדס חנה גו-אאוט": { a: "#8b5cf6", t: "rgba(139,92,246,.18)", tc: "#a78bfa" },
  "הרצליה גו-אאוט": { a: "#3b82f6", t: "rgba(59,130,246,.18)", tc: "#60a5fa" },
  "WineNot Back2Rea": { a: "#ec4899", t: "rgba(236,72,153,.18)", tc: "#f472b6" },
};

const FUTURE_FILES = [
  { file: "future projects/שבועות.csv", label: "שבועות" },
  { file: "future projects/זיגו תל אביב רוקח.csv", label: "זיגו תל אביב רוקח" },
];

// --- identity helpers ---
export function normPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("972")) d = "0" + d.slice(3);
  if (d.length === 9 && !d.startsWith("0")) d = "0" + d;
  if (d.startsWith("0")) d = d.slice(1);
  return d.slice(-9);
}

export function normEmail(e) {
  const s = String(e || "")
    .trim()
    .toLowerCase();
  if (!s || s === "undefined") return "";
  return s;
}

export function normName(parts) {
  const s = (Array.isArray(parts) ? parts.join(" ") : String(parts || ""))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return s.length >= 2 ? s : "";
}

export function goOutQrId(url) {
  const m = (url || "").match(/[?&]id=([^&]+)/);
  return m ? m[1] : "";
}

export function zygoQrId(url) {
  return (url || "").split("/ticket/")[1] || "";
}

export function participantKey(p) {
  return `${p.אירוע}::${p.order_id}::${p.טלפון}::${p.אימייל}::${p.qr}`;
}

function createRegistry() {
  return {
    phones: new Set(),
    emails: new Set(),
    qrIds: new Set(),
    orderIds: new Set(),
    names: new Set(),
  };
}

function addReg(reg, ids) {
  if (ids.phone) reg.phones.add(ids.phone);
  if (ids.email) reg.emails.add(ids.email);
  if (ids.qrId) reg.qrIds.add(ids.qrId);
  if (ids.orderId) reg.orderIds.add(ids.orderId);
  if (ids.name) reg.names.add(ids.name);
}

function matches(reg, ids) {
  if (ids.phone && reg.phones.has(ids.phone)) return true;
  if (ids.email && reg.emails.has(ids.email)) return true;
  if (ids.qrId && reg.qrIds.has(ids.qrId)) return true;
  if (ids.orderId && reg.orderIds.has(ids.orderId)) return true;
  if (ids.name && reg.names.has(ids.name)) return true;
  return false;
}

// --- scan / free detection ---
export function isZygoScanned(row) {
  const s = String(row.Scanned || "").trim().toLowerCase();
  if (["כן", "yes", "true", "1"].includes(s)) return true;
  if (String(row.Scanned_At || "").trim()) return true;
  if (String(row.Scanned_By || "").trim()) return true;
  return false;
}

export function isGoOutScanned(row) {
  if (String(row.scan_status || "").toLowerCase() === "true") return true;
  if (String(row.scan_time || "").trim()) return true;
  if (String(row.scanned_by || "").trim()) return true;
  return false;
}

/** Go-Out: לא זכאי — דחייה, חינם, הזמנה, הזמנה 0 */
export function isGoOutIneligible(row) {
  if ((row.status || "").toLowerCase() === "rejected") return true;
  const pt = String(row.payment_type || "").trim().toLowerCase();
  if (pt === "free") return true;
  const sum = Number(String(row.payment_sum ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isNaN(sum) && sum === 0) return true;
  const item = String(row.item_name || "").toLowerCase();
  if (item.includes("invitation")) return true;
  if (item.includes("רשימת המתנה")) return true;
  return false;
}

/** Zygo: כרטיס חינם */
export function isZygoFree(row) {
  const name = String(row.TicketName || "").toLowerCase();
  const mode = String(row.PaymentMode || "").toLowerCase();
  const gw = String(row.Gateway || "").toLowerCase();
  const paid = String(row.Paid_Price ?? "").trim();
  const price = String(row.TicketPrice ?? "").trim();
  if (name.includes("free ticket") || name.includes("חינם")) return true;
  if (mode === "free" || gw === "free") return true;
  if (paid === "0" && price === "0") return true;
  return false;
}

// --- participants ---
function goOutToParticipant(row, event) {
  const phone = normPhone(row.phone_number);
  const email = normEmail(row.mail);
  const name = `${row.first_name || ""} ${row.last_name || ""}`
    .replace(/\s+/g, " ")
    .trim();
  return {
    שם: name,
    טלפון: phone,
    אימייל: email,
    כרטיס: row.item_name || "",
    אירוע: event,
    order_id: String(row.order_id || ""),
    qr: row.QR_link || "",
  };
}

function zygoToParticipant(row, event) {
  const phone = normPhone(row.Phone);
  const email = normEmail(row.Email);
  const name = `${row.FirstName || ""} ${row.LastName || ""}`
    .replace(/\s+/g, " ")
    .trim();
  if (!name && !phone && !email) return null;
  return {
    שם: name || email || phone,
    טלפון: phone,
    אימייל: email,
    כרטיס: row.TicketName || "",
    אירוע: event,
    order_id: row.OrderId || "",
    qr: row.Qr_Code_Link || "",
  };
}

function idsGoOut(row) {
  return {
    phone: normPhone(row.phone_number),
    email: normEmail(row.mail),
    qrId: goOutQrId(row.QR_link),
    orderId: String(row.order_id || "").trim(),
  };
}

function idsZygo(row) {
  return {
    phone: normPhone(row.Phone),
    email: normEmail(row.Email),
    qrId: zygoQrId(row.Qr_Code_Link),
    orderId: (row.OrderId || "").trim(),
    name: normName([row.FirstName, row.LastName]),
  };
}

function idsParticipant(p) {
  const go = (p.qr || "").includes("go-out.co");
  return {
    phone: p.טלפון || "",
    email: p.אימייל || "",
    qrId: go ? goOutQrId(p.qr) : zygoQrId(p.qr),
    orderId: (p.order_id || "").trim(),
    name: normName(p.שם),
  };
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const p of list) {
    const k = participantKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function buildGlobalGoOutScanned(goOutSources) {
  const reg = createRegistry();
  for (const { rows } of goOutSources) {
    for (const row of rows) {
      if (!isGoOutScanned(row)) continue;
      addReg(reg, idsGoOut(row));
    }
  }
  return reg;
}

/** שבועות/רוקח: כרטיס חינם בלבד (סריקה לא רלוונטית — האירוע עוד לא התקיים) */
function buildFutureRegistry() {
  const reg = createRegistry();
  const byFile = {};
  const freeTicketList = [];

  for (const { file, label } of FUTURE_FILES) {
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    const rows = parseCsv(readText(full)).map(normalizeZygoRow);
    const byOrder = new Map();
    for (const row of rows) {
      const oid = row.OrderId || "";
      if (!byOrder.has(oid)) byOrder.set(oid, []);
      byOrder.get(oid).push(row);
    }

    let freeRows = 0;
    const freeOrders = new Set();

    for (const row of rows) {
      if (!isZygoFree(row)) continue;
      freeRows++;
      const orderId = row.OrderId || "";
      if (freeOrders.has(orderId)) continue;
      freeOrders.add(orderId);
      const group = byOrder.get(orderId) || [row];
      for (const r of group) {
        addReg(reg, idsZygo(r));
        if (isZygoFree(r)) {
          const name = `${r.FirstName || ""} ${r.LastName || ""}`
            .replace(/\s+/g, " ")
            .trim();
          freeTicketList.push({
            שם: name || normEmail(r.Email) || normPhone(r.Phone) || orderId,
            טלפון: normPhone(r.Phone),
            מקור: label,
            order_id: orderId,
            כרטיס: r.TicketName || "Free Ticket",
          });
        }
      }
    }

    byFile[label] = {
      totalRows: rows.length,
      freeTicketRows: freeRows,
      freeOrders: freeOrders.size,
    };
  }

  return { reg, byFile, freeTicketList };
}

function processGoOut(fileName, event, globalScanned, rowsIn) {
  const rows = rowsIn ?? parseCsv(readText(path.join(PURIM_DIR, fileName)));
  const all = [];
  const excluded = { rejected: 0, free: 0, scanned: 0, identityScanned: 0 };
  const scannedKeys = new Set();
  const localScanned = createRegistry();

  for (const row of rows) {
    if ((row.status || "").toLowerCase() === "rejected") {
      excluded.rejected++;
      continue;
    }
    if (isGoOutIneligible(row)) {
      excluded.free++;
      continue;
    }
    const p = goOutToParticipant(row, event);
    all.push(p);
    if (isGoOutScanned(row)) {
      scannedKeys.add(participantKey(p));
      addReg(localScanned, idsGoOut(row));
    }
  }

  const merged = createRegistry();
  for (const k of ["phones", "emails", "qrIds", "orderIds"]) {
    for (const v of localScanned[k]) merged[k].add(v);
    for (const v of globalScanned[k]) merged[k].add(v);
  }

  const afterScan = [];
  for (const p of all) {
    const key = participantKey(p);
    if (scannedKeys.has(key)) continue;
    if (matches(merged, idsParticipant(p))) {
      scannedKeys.add(key);
      excluded.identityScanned++;
      continue;
    }
    afterScan.push(p);
  }
  excluded.scanned = scannedKeys.size - excluded.identityScanned;

  return {
    event,
    stats: {
      file: fileName,
      rows: rows.length,
      paidEligiblePool: all.length,
      excluded,
      removedScanned: scannedKeys.size,
      afterScan: afterScan.length,
    },
    afterScan,
    scannedKeys: [...scannedKeys],
  };
}

function processZygoRows(rows, event, sourceFile) {
  const all = [];
  const excluded = { free: 0, scanned: 0, identityScanned: 0 };
  const scannedKeys = new Set();
  const localScanned = createRegistry();

  for (const raw of rows) {
    const row = normalizeZygoRow(raw);
    if (isZygoFree(row)) {
      excluded.free++;
      continue;
    }
    const p = zygoToParticipant(row, event);
    if (!p) continue;
    all.push(p);
    if (isZygoScanned(row)) {
      scannedKeys.add(participantKey(p));
      addReg(localScanned, idsZygo(row));
    }
  }

  const afterScan = [];
  for (const p of all) {
    const key = participantKey(p);
    if (scannedKeys.has(key)) continue;
    if (matches(localScanned, idsParticipant(p))) {
      scannedKeys.add(key);
      excluded.identityScanned++;
      continue;
    }
    afterScan.push(p);
  }
  excluded.scanned = scannedKeys.size - excluded.identityScanned;

  return {
    event,
    stats: {
      file: sourceFile,
      rows: rows.length,
      paidEligiblePool: all.length,
      excluded,
      removedScanned: scannedKeys.size,
      afterScan: afterScan.length,
    },
    afterScan,
    scannedKeys: [...scannedKeys],
  };
}

export function buildAllData() {
  const { goOut: goOutSources, zygo: zygoSources } = discoverPurimSources(PURIM_DIR);
  const globalGoOutScanned = buildGlobalGoOutScanned(goOutSources);
  const {
    reg: futureReg,
    byFile: futureByFile,
    freeTicketList: futureFreeTickets,
  } = buildFutureRegistry();

  const processed = [];

  for (const { fileName, event, rows } of goOutSources) {
    processed.push(processGoOut(fileName, event, globalGoOutScanned, rows));
  }

  const zygoByEvent = new Map();
  const zygoSourceFiles = new Map();
  for (const { fileName, rows } of zygoSources) {
    for (const raw of rows) {
      const row = normalizeZygoRow(raw);
      const event = classifyZygoEvent(row);
      if (!zygoByEvent.has(event)) zygoByEvent.set(event, []);
      zygoByEvent.get(event).push(row);
      const files = zygoSourceFiles.get(event) || new Set();
      files.add(fileName);
      zygoSourceFiles.set(event, files);
    }
  }

  for (const event of ["הרצליה זיגו", "WineNot Back2Rea"]) {
    const rows = zygoByEvent.get(event) || [];
    const files = [...(zygoSourceFiles.get(event) || [])].join(", ") || null;
    if (rows.length === 0) {
      processed.push({
        event,
        stats: { file: files, rows: 0, error: "אין שורות Zygo לאירוע זה ב-purim/" },
        afterScan: [],
        scannedKeys: [],
      });
      continue;
    }
    processed.push(processZygoRows(rows, event, files));
  }

  const step1ByEvent = {};
  const step2ByEvent = {};
  let step1Total = 0;
  let step2Total = 0;
  let allAfterScan = [];
  const allRemovedKeys = [];

  for (const r of processed) {
    const paid = r.stats.paidEligiblePool ?? 0;
    step1ByEvent[r.event] = paid;
    step1Total += paid;
    step2ByEvent[r.event] = r.afterScan.length;
    step2Total += r.afterScan.length;
    allAfterScan.push(...r.afterScan);
    allRemovedKeys.push(...r.scannedKeys);
  }

  const step3ByEvent = {};
  const finalEligible = [];
  const futureRemovedKeys = [];
  let step3Total = 0;

  for (const p of dedupe(allAfterScan)) {
    if (matches(futureReg, idsParticipant(p))) {
      futureRemovedKeys.push(participantKey(p));
      step3ByEvent[p.אירוע] = (step3ByEvent[p.אירוע] || 0) + 1;
      step3Total++;
      continue;
    }
    finalEligible.push(p);
  }

  const participants = dedupe(finalEligible);
  const step4ByEvent = {};
  for (const p of participants) {
    step4ByEvent[p.אירוע] = (step4ByEvent[p.אירוע] || 0) + 1;
  }

  const preScannedFlat = {};
  for (const k of [...allRemovedKeys, ...futureRemovedKeys]) {
    preScannedFlat[k] = true;
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    model: "purim-v6",
    sources: {
      goOut: goOutSources.map((s) => s.fileName),
      zygo: zygoSources.map((s) => s.fileName),
      skipped: fs.existsSync(PURIM_DIR)
        ? fs
            .readdirSync(PURIM_DIR)
            .filter((f) => {
              const all = fs.readdirSync(PURIM_DIR);
              return (
                fs.statSync(path.join(PURIM_DIR, f)).isFile() &&
                (f.endsWith(".csv") || f.endsWith(".xlsx")) &&
                !goOutSources.some((g) => g.fileName === f) &&
                !zygoSources.some((z) => z.fileName === f)
              );
            })
        : [],
    },
    byEvent: step4ByEvent,
    totalEligible: participants.length,
    totalPreScanned: Object.keys(preScannedFlat).length,
    pipeline: {
      step1_purimPaid: {
        description: "כרטיסים בתשלום ב-purim (ללא חינם/דחוי/הזמנה)",
        byEvent: step1ByEvent,
        total: step1Total,
      },
      step2_afterPurimScans: {
        description:
          "אחרי הסרת נסרקו ב-purim (Scanned / Scanned_At / Scanned_By / scan_status / scan_time)",
        byEvent: step2ByEvent,
        total: step2Total,
        removed: step1Total - step2Total,
      },
      step3_afterFutureMatch: {
        description:
          "הוסרו: כרטיס חינם בשבועות או זיגו תל אביב רוקח (התאמה לפי שם/טלפון/מייל)",
        removedByEvent: step3ByEvent,
        totalRemoved: step3Total,
        futureFiles: futureByFile,
        futureFreeTicketCount: futureFreeTickets.length,
        uniqueFutureIdentities: {
          phones: futureReg.phones.size,
          emails: futureReg.emails.size,
          names: futureReg.names.size,
        },
      },
      step4_finalEligible: {
        description: "זכאים סופיים באתר",
        byEvent: step4ByEvent,
        total: participants.length,
      },
    },
    report: Object.fromEntries(processed.map((r) => [r.event, r.stats])),
    eventColors: EVENT_COLORS,
  };

  const futureBlocklist = {
    phones: [...futureReg.phones],
    emails: [...futureReg.emails],
    qrIds: [...futureReg.qrIds],
    orderIds: [...futureReg.orderIds],
    names: [...futureReg.names],
  };

  return {
    participants,
    preScannedFlat,
    meta,
    futureFreeTickets,
    futureBlocklist,
  };
}

function writeDataFiles(payload) {
  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, "data", "participants.json"),
    JSON.stringify(payload.participants),
    "utf8"
  );
  fs.writeFileSync(
    path.join(ROOT, "data", "preScanned.json"),
    JSON.stringify(payload.preScannedFlat),
    "utf8"
  );
  fs.writeFileSync(
    path.join(ROOT, "data", "futureFreeTickets.json"),
    JSON.stringify(payload.futureFreeTickets),
    "utf8"
  );
  fs.writeFileSync(
    path.join(ROOT, "data", "futureBlocklist.json"),
    JSON.stringify(payload.futureBlocklist),
    "utf8"
  );
  fs.writeFileSync(
    path.join(ROOT, "data", "meta.json"),
    JSON.stringify(payload.meta, null, 2),
    "utf8"
  );
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const payload = buildAllData();
  writeDataFiles(payload);
  console.log("\n=== PIPELINE ===\n");
  console.log(JSON.stringify(payload.meta.pipeline, null, 2));
  console.log("\n=== REPORT ===\n");
  console.log(JSON.stringify(payload.meta.report, null, 2));
  console.log("\nFinal eligible:", payload.meta.totalEligible);
}

// re-export for tests
export { parseCsv };

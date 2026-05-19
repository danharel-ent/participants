import path from "path";
import { fileURLToPath } from "url";
import { parseCsv, readText, normalizeZygoRow, classifyZygoEvent } from "../lib/load-sources.mjs";
import { isZygoFree, isZygoScanned } from "./build-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function auditFile(rel) {
  const rows = parseCsv(readText(path.join(ROOT, rel))).map(normalizeZygoRow);
  const scanned = rows.filter(isZygoScanned);
  const free = rows.filter(isZygoFree);
  const paid = rows.filter((r) => !isZygoFree(r));
  const paidScanned = paid.filter(isZygoScanned);
  const tickets = {};
  for (const r of rows) {
    const t = r.TicketName || "(ריק)";
    tickets[t] = (tickets[t] || 0) + 1;
  }
  const byClass = {};
  for (const r of rows) {
    const c = classifyZygoEvent(r);
    byClass[c] = (byClass[c] || 0) + 1;
  }
  const scannedVals = {};
  for (const r of rows) {
    const v = String(r.Scanned || "").trim() || "(ריק)";
    scannedVals[v] = (scannedVals[v] || 0) + 1;
  }
  return {
    file: rel,
    total: rows.length,
    free: free.length,
    paid: paid.length,
    scannedTotal: scanned.length,
    paidScanned: paidScanned.length,
    paidNotScanned: paid.length - paidScanned.length,
    byClass,
    scannedVals,
    tickets: Object.entries(tickets).sort((a, b) => b[1] - a[1]),
  };
}

const files = [
  "purim/WineNOT Back2Reality-bought-tickets.csv",
  "purim/¿WineNot_ - Back2Rea-bought-tickets.csv",
];

for (const f of files) {
  const a = auditFile(f);
  console.log("\n==========", a.file, "==========");
  console.log("שורות:", a.total, "| בתשלום:", a.paid, "| חינם:", a.free);
  console.log("נסרקו (כללי):", a.scannedTotal, "| בתשלום שנסרקו:", a.paidScanned, "| בתשלום לא נסרקו:", a.paidNotScanned);
  console.log("ערכי Scanned:", a.scannedVals);
  console.log("סיווג נוכחי classifyZygoEvent:", a.byClass);
  console.log("כרטיסים:");
  a.tickets.slice(0, 20).forEach(([t, n]) => console.log(" ", n, "x", t));
}

// אם כל WineNOT -> הרצליה זיגו
console.log("\n========== תרחיש מתוקן: כל WineNOT Back2Reality -> הרצליה זיגו ==========");
const big = parseCsv(readText(path.join(ROOT, files[0]))).map(normalizeZygoRow);
const paid = big.filter((r) => !isZygoFree(r));
const notScanned = paid.filter((r) => !isZygoScanned(r));
console.log("בתשלום:", paid.length, "לא נסרקו:", notScanned.length);

console.log("\n========== תרחיש: ¿WineNot_ -> פרדס חנה Back2Reality ==========");
const small = parseCsv(readText(path.join(ROOT, files[1]))).map(normalizeZygoRow);
const p2 = small.filter((r) => !isZygoFree(r));
const ns2 = p2.filter((r) => !isZygoScanned(r));
console.log("בתשלום:", p2.length, "לא נסרקו:", ns2.length, "נסרקו:", p2.length - ns2.length);

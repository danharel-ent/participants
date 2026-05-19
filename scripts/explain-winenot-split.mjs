import path from "path";
import { fileURLToPath } from "url";
import { parseCsv, readText, normalizeZygoRow, classifyZygoEvent } from "../lib/load-sources.mjs";
import { isZygoFree, isZygoScanned } from "./build-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(ROOT, "purim/WineNOT Back2Reality-bought-tickets.csv");
const rows = parseCsv(readText(file)).map(normalizeZygoRow);

const byEvent = {};
const paid = {};
const scanned = {};
const free = {};
const ticketNames = { "הרצליה זיגו": {}, "WineNot Back2Rea": {} };

for (const row of rows) {
  const ev = classifyZygoEvent(row);
  byEvent[ev] = (byEvent[ev] || 0) + 1;
  const tn = row.TicketName || "(ריק)";
  ticketNames[ev][tn] = (ticketNames[ev][tn] || 0) + 1;
  if (isZygoFree(row)) {
    free[ev] = (free[ev] || 0) + 1;
    continue;
  }
  paid[ev] = (paid[ev] || 0) + 1;
  if (isZygoScanned(row)) scanned[ev] = (scanned[ev] || 0) + 1;
}

console.log("=== WineNOT Back2Reality-bought-tickets.csv ===\n");
console.log("סה\"כ שורות:", rows.length);
console.log("\nפיצול לפי שם כרטיס (לא לפי שם קובץ):");
for (const [ev, n] of Object.entries(byEvent)) {
  console.log(`  ${ev}: ${n}`);
}
console.log("\nמתוכן — בתשלום:");
for (const [ev, n] of Object.entries(paid)) {
  const sc = scanned[ev] || 0;
  console.log(`  ${ev}: ${n} בתשלום, ${sc} כבר נסרקו, ${n - sc} נשארו לפני future`);
}
console.log("\nחינם (לא נספרים):", free);

console.log("\n--- כרטיסים שמסווגים ל-WineNot Back2Rea ---");
const wineTickets = Object.entries(ticketNames["WineNot Back2Rea"] || {}).sort(
  (a, b) => b[1] - a[1]
);
for (const [name, count] of wineTickets) {
  console.log(`  ${count}x  ${name}`);
}

console.log("\n--- כרטיסים שמסווגים ל-הרצליה זיגו (מהאותו קובץ!) ---");
const herzTickets = Object.entries(ticketNames["הרצליה זיגו"] || {})
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15);
for (const [name, count] of herzTickets) {
  console.log(`  ${count}x  ${name}`);
}

/**
 * דוח אימות מספרים — node scripts/verify-all.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  parseCsv,
  isFreeZygoTicket,
  isZygoScanned,
  isGoOutScanned,
} from "./build-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function auditCsv(rel, type) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  const rows = parseCsv(fs.readFileSync(full, "utf8"));
  const scanned = rows.filter(type === "goout" ? isGoOutScanned : isZygoScanned);
  const free = type === "zygo" ? rows.filter(isFreeZygoTicket) : [];
  const scannedByOnly = rows.filter((r) => {
    if (type === "goout") return !!(r.scanned_by || "").trim() && !isGoOutScanned(r);
    return !!(r.Scanned_By || "").trim() && !isZygoScanned(r);
  });
  return {
    file: rel,
    rows: rows.length,
    scanned: scanned.length,
    free: free.length,
    scannedByOnly: scannedByOnly.length,
  };
}

console.log("=== PURIM ===\n");
for (const f of [
  ["purim/משתמשים גו אאוט הרצליה.csv", "goout"],
  ["purim/גו אאוט פרדס חנה.csv", "goout"],
  ["purim/¿WineNot_ - Back2Rea-bought-tickets.csv", "zygo"],
]) {
  console.log(auditCsv(f[0], f[1]));
}

console.log("\n=== FUTURE (כרטיס חינם = מוריד מ-purim) ===\n");
for (const f of [
  "future projects/שבועות.csv",
  "future projects/זיגו תל אביב רוקח.csv",
]) {
  const a = auditCsv(f, "zygo");
  console.log({ ...a, freeToDisqualify: a?.free });
}

const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "data/meta.json"), "utf8"));
console.log("\n=== PIPELINE (data/meta.json) ===\n");
console.log(JSON.stringify(meta.pipeline, null, 2));

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Compare - we don't have old file. Run dual build not available.
// Print שבועות paid phones that should block
import { parseCsv, readText, normalizeZygoRow } from "../lib/load-sources.mjs";
import { normPhone, normEmail, isZygoFree, isZygoScanned } from "./build-data.mjs";

const eligible = JSON.parse(fs.readFileSync(path.join(ROOT, "data/participants.json"), "utf8"));
const rows = parseCsv(readText(path.join(ROOT, "future projects/שבועות.csv"))).map(normalizeZygoRow);

const paidPhones = new Set();
for (const r of rows) {
  if (!isZygoFree(r)) {
    const p = normPhone(r.Phone);
    if (p) paidPhones.add(p);
  }
}

let hits = 0;
for (const p of eligible) {
  if (paidPhones.has(normPhone(p.טלפון))) {
    hits++;
    if (hits <= 10) console.log("Still eligible but paid שבועות:", p.שם, p.טלפון, p.אירוע);
  }
}
console.log("Total still eligible with paid שבועות phone:", hits);

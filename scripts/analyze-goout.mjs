import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readText(p) {
  return fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
}

function parseCsv(text) {
  const rows = [];
  let i = 0;
  const len = text.length;
  const headers = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  function pushField() {
    row.push(field);
    field = "";
  }
  function pushRow() {
    if (headers.length === 0) headers.push(...row);
    else if (row.length > 1 || row[0] !== "") {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h.trim()] = (row[idx] ?? "").trim();
      });
      rows.push(obj);
    }
    row = [];
  }
  while (i < len) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      pushField();
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      pushField();
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  pushField();
  if (field || row.length) pushRow();
  return rows;
}

function goOutLocation(row) {
  const keys = Object.keys(row).filter((k) => k.includes("מקום") || k.includes("מגורים"));
  for (const k of keys) {
    const v = (row[k] || "").trim();
    if (v) return v;
  }
  return "";
}

function eventFromLoc(loc) {
  const l = loc.toLowerCase();
  if (l.includes("פרדס")) return "pardes";
  if (l.includes("הרצליה")) return "herzliya";
  return "other";
}

const files = [
  "purim/משתמשים גו אאוט הרצליה.csv",
  "purim/גו אאוט פרדס חנה.csv",
];
const all = [];
for (const f of files) {
  all.push(...parseCsv(readText(path.join(ROOT, f))));
}

const isScanned = (r) =>
  String(r.scan_status).toLowerCase() === "true" || !!(r.scan_time || "").trim();

for (const ev of ["pardes", "herzliya", "other"]) {
  const subset = all.filter((r) => eventFromLoc(goOutLocation(r)) === ev);
  const scanned = subset.filter(isScanned);
  const accepted = subset.filter((r) => (r.status || "").toLowerCase() === "accepted");
  console.log(ev, {
    total: subset.length,
    accepted: accepted.length,
    scanned: scanned.length,
    eligible: accepted.filter((r) => !isScanned(r)).length,
  });
}

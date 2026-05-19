import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(ROOT, "ticket_manager.html"), "utf8");
const m = html.match(/const D=(\[.*?\]);/s);
const D = JSON.parse(m[1]);
const hz = D.filter((p) => p.אירוע === "הרצליה זיגו");

function normPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("972")) d = "0" + d.slice(3);
  if (d.length === 9 && !d.startsWith("0")) d = "0" + d;
  if (d.startsWith("0")) d = d.slice(1);
  return d.slice(-9);
}
function normEmail(e) {
  const s = String(e || "")
    .trim()
    .toLowerCase();
  return s && s !== "undefined" ? s : "";
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

const wine = parseCsv(
  fs.readFileSync(path.join(ROOT, "purim/¿WineNot_ - Back2Rea-bought-tickets.csv"), "utf8")
);
const scanned = wine.filter((r) => (r.Scanned || "").trim() === "כן");
const hzPhones = new Set(hz.map((p) => normPhone(p.טלפון)).filter(Boolean));
const hzEmails = new Set(hz.map((p) => normEmail(p.אימייל)).filter(Boolean));

let overlap = 0;
for (const r of scanned) {
  if (hzPhones.has(normPhone(r.Phone)) || hzEmails.has(normEmail(r.Email))) overlap++;
}
console.log("Herzliya zigo count", hz.length);
console.log("WineNot scanned", scanned.length);
console.log("Overlap scanned wineNot with herzliya zigo list", overlap);

// sample qr prefixes
const prefixes = {};
for (const p of hz) {
  const id = (p.qr || "").split("/ticket/")[1]?.slice(0, 6);
  prefixes[id] = (prefixes[id] || 0) + 1;
}
console.log("QR id prefixes", prefixes);

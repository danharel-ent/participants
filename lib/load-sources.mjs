import fs from "fs";
import path from "path";
import XLSX from "xlsx";

export function readText(p) {
  return fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
}

export function parseCsv(text) {
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
    if (headers.length === 0) {
      headers.push(...row.map((h) => String(h).trim()));
    } else if (row.some((c) => c !== "")) {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = (row[idx] ?? "").trim();
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

/** Normalize Zygo / Excel row keys */
export function normalizeZygoRow(row) {
  const get = (...keys) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "")
        return String(row[k]).trim();
    }
    return "";
  };
  return {
    OrderId: get("OrderId", "order_id"),
    FirstName: get("FirstName", "first_name"),
    LastName: get("LastName", "last_name"),
    Email: get("Email", "mail"),
    Phone: get("Phone", "phone_number"),
    TicketName: get("TicketName", "item_name"),
    PaymentMode: get("PaymentMode", "payment_type"),
    Gateway: get("Gateway"),
    TicketPrice: get("TicketPrice", "payment_sum"),
    Paid_Price: get("Paid_Price"),
    Scanned: get("Scanned", "scan_status"),
    Scanned_At: get("Scanned_At", "scan_time"),
    Scanned_By: get("Scanned_By", "scanned_by"),
    Qr_Code_Link: get("Qr_Code_Link", "QR_link", "qr"),
  };
}

export function loadXlsxRows(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return raw.map(normalizeZygoRow);
}

export function findHerzliyaZigoXlsx(purimDir) {
  if (!fs.existsSync(purimDir)) return null;
  const files = fs.readdirSync(purimDir);
  const hit =
    files.find((f) => f.endsWith(".xlsx") && f.includes("זיגו")) ||
    files.find((f) => f.endsWith(".xlsx") && f.toLowerCase().includes("zigo"));
  return hit ? path.join(purimDir, hit) : null;
}

/** Zygo row → event (mixed exports split by ticket name, not filename). */
export function classifyZygoEvent(row) {
  const t = String(row.TicketName || "").toLowerCase();
  if (
    t.includes("back2life") ||
    t.includes("back2rea") ||
    t.includes("winenot") ||
    t.includes("פורים ווינוט")
  ) {
    return "WineNot Back2Rea";
  }
  return "הרצליה זיגו";
}

export function isGoOutCsv(rows) {
  return rows.length > 0 && "phone_number" in rows[0];
}

export function isZygoCsv(rows) {
  return rows.length > 0 && ("OrderId" in rows[0] || "Qr_Code_Link" in rows[0]);
}

export function goOutEventFromFilename(fileName) {
  if (fileName.includes("פרדס")) return "פרדס חנה גו-אאוט";
  return "הרצליה גו-אאוט";
}

/** Files superseded by newer combined Zygo export — do not double-count. */
export function shouldSkipPurimFile(fileName, allFiles) {
  const lower = fileName.toLowerCase();
  const hasCombinedZygo = allFiles.some(
    (f) =>
      f.endsWith(".csv") &&
      (f.toLowerCase().includes("back2reality") ||
        f.toLowerCase().includes("back2rea-bought"))
  );
  if (hasCombinedZygo && fileName.startsWith("¿WineNot")) return true;
  if (hasCombinedZygo && lower.endsWith(".xlsx") && fileName.includes("זיגו"))
    return true;
  return false;
}

export function discoverPurimSources(purimDir) {
  if (!fs.existsSync(purimDir)) return { goOut: [], zygo: [] };
  const allFiles = fs.readdirSync(purimDir);
  const goOut = [];
  const zygo = [];

  for (const fileName of allFiles) {
    if (shouldSkipPurimFile(fileName, allFiles)) continue;
    const full = path.join(purimDir, fileName);
    if (!fs.statSync(full).isFile()) continue;

    if (fileName.endsWith(".xlsx")) {
      zygo.push({ fileName, rows: loadXlsxRows(full) });
      continue;
    }
    if (!fileName.endsWith(".csv")) continue;

    const rows = parseCsv(readText(full));
    if (isGoOutCsv(rows)) {
      goOut.push({
        fileName,
        event: goOutEventFromFilename(fileName),
        rows,
      });
    } else if (isZygoCsv(rows)) {
      zygo.push({
        fileName,
        rows: rows.map(normalizeZygoRow),
      });
    }
  }

  return { goOut, zygo };
}

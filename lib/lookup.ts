import type { FutureBlocklist, FutureFreeTicket, Participant } from "./types";
import { participantKey } from "./keys";

export function normPhone(p: string): string {
  let d = String(p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("972")) d = "0" + d.slice(3);
  if (d.length === 9 && !d.startsWith("0")) d = "0" + d;
  if (d.startsWith("0")) d = d.slice(1);
  return d.slice(-9);
}

export function normEmail(e: string): string {
  const s = String(e || "")
    .trim()
    .toLowerCase();
  if (!s || s === "undefined") return "";
  return s;
}

export function normName(s: string): string {
  const n = String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return n.length >= 2 ? n : "";
}

export function qrIdFromInput(raw: string): string {
  const q = raw.trim();
  const go = q.match(/[?&]id=([^&]+)/i);
  if (go) return go[1];
  const zygo = q.match(/\/ticket\/([^/?#]+)/i);
  if (zygo) return zygo[1];
  if (/^[a-zA-Z0-9_-]{6,}$/.test(q) && !q.includes("@")) return q;
  return "";
}

export type ParsedPreScanned = {
  key: string;
  אירוע: string;
  order_id: string;
  טלפון: string;
  אימייל: string;
};

export function parsePreScannedKey(key: string): ParsedPreScanned {
  const parts = key.split("::");
  return {
    key,
    אירוע: parts[0] || "",
    order_id: parts[1] || "",
    טלפון: parts[2] || "",
    אימייל: parts[3] || "",
  };
}

type LookupIndex = {
  eligibleByPhone: Map<string, Participant[]>;
  eligibleByEmail: Map<string, Participant[]>;
  eligibleByOrder: Map<string, Participant[]>;
  eligibleByQr: Map<string, Participant[]>;
  eligibleByName: Map<string, Participant[]>;
  purimIneligibleByPhone: Map<string, ParsedPreScanned[]>;
  purimIneligibleByEmail: Map<string, ParsedPreScanned[]>;
  purimIneligibleByOrder: Map<string, ParsedPreScanned[]>;
  purimIneligibleByQr: Map<string, ParsedPreScanned[]>;
  futureByPhone: Map<string, FutureFreeTicket[]>;
  futureByName: Map<string, FutureFreeTicket[]>;
};

function pushMap<K, V>(map: Map<K, V[]>, key: K, value: V) {
  if (!key) return;
  const arr = map.get(key) || [];
  arr.push(value);
  map.set(key, arr);
}

function qrIdFromParticipant(p: Participant): string {
  return qrIdFromInput(p.qr || "");
}

function idsFromQuery(q: string) {
  const phone = normPhone(q);
  const email = normEmail(q);
  const qrId = qrIdFromInput(q);
  const orderMatch = q.match(/\b(ZG\d+)\b/i);
  const orderId = (orderMatch?.[1] || (/^\d{5,}$/.test(q) ? q : "")).toLowerCase();
  const name = normName(q);
  return { phone, email, qrId, orderId, name };
}

export function buildLookupIndex(
  participants: Participant[],
  preScanned: Record<string, boolean>,
  futureFreeTickets: FutureFreeTicket[],
  localScanned: Set<string>
): LookupIndex {
  const idx: LookupIndex = {
    eligibleByPhone: new Map(),
    eligibleByEmail: new Map(),
    eligibleByOrder: new Map(),
    eligibleByQr: new Map(),
    eligibleByName: new Map(),
    purimIneligibleByPhone: new Map(),
    purimIneligibleByEmail: new Map(),
    purimIneligibleByOrder: new Map(),
    purimIneligibleByQr: new Map(),
    futureByPhone: new Map(),
    futureByName: new Map(),
  };

  for (const p of participants) {
    if (localScanned.has(participantKey(p))) continue;
    pushMap(idx.eligibleByPhone, normPhone(p.טלפון), p);
    pushMap(idx.eligibleByEmail, normEmail(p.אימייל), p);
    pushMap(idx.eligibleByOrder, (p.order_id || "").trim().toLowerCase(), p);
    pushMap(idx.eligibleByQr, qrIdFromParticipant(p), p);
    pushMap(idx.eligibleByName, normName(p.שם), p);
  }

  for (const key of Object.keys(preScanned)) {
    const parsed = parsePreScannedKey(key);
    pushMap(idx.purimIneligibleByPhone, normPhone(parsed.טלפון), parsed);
    pushMap(idx.purimIneligibleByEmail, normEmail(parsed.אימייל), parsed);
    pushMap(
      idx.purimIneligibleByOrder,
      (parsed.order_id || "").trim().toLowerCase(),
      parsed
    );
    const qrPart = key.split("::")[4] || "";
    pushMap(idx.purimIneligibleByQr, qrIdFromInput(qrPart), parsed);
  }

  for (const r of futureFreeTickets) {
    pushMap(idx.futureByPhone, normPhone(r.טלפון), r);
    pushMap(idx.futureByName, normName(r.שם), r);
  }

  return idx;
}

export function buildFutureBlocklistIndex(blocklist: FutureBlocklist) {
  return {
    phones: new Set(blocklist.phones),
    emails: new Set(blocklist.emails),
    qrIds: new Set(blocklist.qrIds),
    orderIds: new Set(blocklist.orderIds),
    names: new Set(blocklist.names),
  };
}

export type ScanOutcome =
  | { status: "empty" }
  | { status: "eligible"; matches: Participant[] }
  | {
      status: "ineligible";
      reason: "purim" | "future" | "local";
      matches?: ParsedPreScanned[] | FutureFreeTicket[] | Participant[];
    }
  | { status: "unknown" }
  | { status: "pick"; eligible: Participant[] };

function uniqueParticipants(list: Participant[]): Participant[] {
  const seen = new Set<string>();
  const out: Participant[] = [];
  for (const p of list) {
    const k = participantKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function uniqueFuture(list: FutureFreeTicket[]): FutureFreeTicket[] {
  const seen = new Set<string>();
  const out: FutureFreeTicket[] = [];
  for (const r of list) {
    const k = `${r.מקור}::${r.order_id}::${r.שם}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function uniquePurim(list: ParsedPreScanned[]): ParsedPreScanned[] {
  const seen = new Set<string>();
  const out: ParsedPreScanned[] = [];
  for (const p of list) {
    if (seen.has(p.key)) continue;
    seen.add(p.key);
    out.push(p);
  }
  return out;
}

function collectHits<T>(
  ids: ReturnType<typeof idsFromQuery>,
  maps: {
    phone?: Map<string, T[]>;
    email?: Map<string, T[]>;
    order?: Map<string, T[]>;
    qr?: Map<string, T[]>;
    name?: Map<string, T[]>;
  }
): T[] {
  const hits: T[] = [];
  if (ids.phone && maps.phone) hits.push(...(maps.phone.get(ids.phone) || []));
  if (ids.email && maps.email) hits.push(...(maps.email.get(ids.email) || []));
  if (ids.orderId && maps.order)
    hits.push(...(maps.order.get(ids.orderId) || []));
  if (ids.qrId && maps.qr) hits.push(...(maps.qr.get(ids.qrId) || []));
  if (ids.name && maps.name) hits.push(...(maps.name.get(ids.name) || []));
  return hits;
}

function findLocalScanned(
  ids: ReturnType<typeof idsFromQuery>,
  allParticipants: Participant[],
  localScanned: Set<string>
): Participant | null {
  for (const p of allParticipants) {
    if (!localScanned.has(participantKey(p))) continue;
    const pk = normPhone(p.טלפון);
    const pe = normEmail(p.אימייל);
    const pn = normName(p.שם);
    const po = (p.order_id || "").trim().toLowerCase();
    const pq = qrIdFromParticipant(p);
    if (ids.phone && pk === ids.phone) return p;
    if (ids.email && pe === ids.email) return p;
    if (ids.orderId && po === ids.orderId) return p;
    if (ids.qrId && pq === ids.qrId) return p;
    if (ids.name && pn === ids.name) return p;
  }
  return null;
}

export function lookupScan(
  rawQuery: string,
  allParticipants: Participant[],
  index: LookupIndex,
  futureBlocklist: ReturnType<typeof buildFutureBlocklistIndex>,
  localScanned: Set<string>
): ScanOutcome {
  const q = rawQuery.trim();
  if (!q) return { status: "empty" };

  const ids = idsFromQuery(q);

  const alreadyLocal = findLocalScanned(ids, allParticipants, localScanned);
  if (alreadyLocal) {
    return { status: "ineligible", reason: "local", matches: [alreadyLocal] };
  }

  const eligible = uniqueParticipants(
    collectHits(ids, {
      phone: index.eligibleByPhone,
      email: index.eligibleByEmail,
      order: index.eligibleByOrder,
      qr: index.eligibleByQr,
      name: index.eligibleByName,
    })
  );
  if (eligible.length === 1) return { status: "eligible", matches: eligible };
  if (eligible.length > 1) return { status: "pick", eligible };

  const futureHits = uniqueFuture(
    collectHits(ids, {
      phone: index.futureByPhone,
      name: index.futureByName,
    })
  );
  const blockedByFuture =
    (ids.phone && futureBlocklist.phones.has(ids.phone)) ||
    (ids.email && futureBlocklist.emails.has(ids.email)) ||
    (ids.qrId && futureBlocklist.qrIds.has(ids.qrId)) ||
    (ids.orderId && futureBlocklist.orderIds.has(ids.orderId)) ||
    (ids.name && futureBlocklist.names.has(ids.name));

  if (futureHits.length > 0 || blockedByFuture) {
    return {
      status: "ineligible",
      reason: "future",
      matches:
        futureHits.length > 0
          ? futureHits
          : [{ שם: "—", טלפון: ids.phone, מקור: "שבועות / רוקח", order_id: "", כרטיס: "חינם" }],
    };
  }

  const purimHits = uniquePurim(
    collectHits(ids, {
      phone: index.purimIneligibleByPhone,
      email: index.purimIneligibleByEmail,
      order: index.purimIneligibleByOrder,
      qr: index.purimIneligibleByQr,
    })
  );
  if (purimHits.length > 0) {
    return { status: "ineligible", reason: "purim", matches: purimHits };
  }

  const qLower = q.toLowerCase();
  const nameHits = allParticipants.filter(
    (p) =>
      !localScanned.has(participantKey(p)) &&
      (p.שם || "").toLowerCase().includes(qLower)
  );
  if (nameHits.length === 1) return { status: "eligible", matches: nameHits };
  if (nameHits.length > 1)
    return { status: "pick", eligible: uniqueParticipants(nameHits) };

  return { status: "unknown" };
}

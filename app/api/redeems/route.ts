import { cookies } from "next/headers";
import { createHash } from "crypto";
import { getRedeemStore, type RedeemRecord } from "@/lib/redeems-store";
import { errorResponse, okResponse } from "@/lib/api-response";
import { checkRateLimit, clientFingerprint } from "@/lib/rate-limit";

type RedeemInput = {
  key?: unknown;
  שם?: unknown;
  אירוע?: unknown;
  order_id?: unknown;
};

const MAX_KEY_LEN = 400;
const MAX_FIELD_LEN = 200;

function safeString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

async function actorHash(): Promise<string> {
  const jar = await cookies();
  const token = jar.get("participants_auth")?.value || "anon";
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}

async function snapshot() {
  const store = await getRedeemStore();
  const records = await store.listRecords();
  return {
    keys: records.map((r) => r.key),
    records,
    count: records.length,
    store: store.type,
  };
}

function toReadableStoreError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("GitHub API 403")) {
    return "שגיאת הרשאה ב-GitHub storage: בדקו של-GITHUB_TOKEN יש הרשאת Contents: Read and write לריפו הנכון.";
  }
  if (msg.includes("GitHub API 401")) {
    return "GITHUB_TOKEN לא תקין או פג תוקף. עדכנו טוקן חדש ב-Vercel.";
  }
  if (msg.includes("GitHub API 404")) {
    return "GITHUB_REPO או GITHUB_REDEEMS_PATH לא נמצאו. בדקו הגדרות סביבה.";
  }
  return "שגיאה בשכבת האחסון. נסו שוב בעוד רגע.";
}

export async function GET(request: Request) {
  const limit = checkRateLimit(`redeems:get:${clientFingerprint(request)}`, 120, 60 * 1000);
  if (!limit.ok) {
    return errorResponse("RATE_LIMITED", "יותר מדי בקשות. נסו שוב בעוד מספר שניות.");
  }
  try {
    const data = await snapshot();
    return okResponse(data);
  } catch (err) {
    console.error("GET /api/redeems failed", err);
    return errorResponse("SERVER_ERROR", toReadableStoreError(err));
  }
}

export async function POST(request: Request) {
  const limit = checkRateLimit(`redeems:write:${clientFingerprint(request)}`, 60, 60 * 1000);
  if (!limit.ok) {
    return errorResponse("RATE_LIMITED", "יותר מדי מימושים בזמן קצר. נסו שוב.");
  }

  let body: RedeemInput;
  try {
    body = (await request.json()) as RedeemInput;
  } catch {
    return errorResponse("VALIDATION_ERROR", "בקשה לא תקינה");
  }

  const key = safeString(body.key, MAX_KEY_LEN);
  if (!key) {
    return errorResponse("VALIDATION_ERROR", "חסר מזהה משתתף", {
      field: "key",
    });
  }

  try {
    const store = await getRedeemStore();
    const record: RedeemRecord = {
      key,
      createdAt: new Date().toISOString(),
      שם: safeString(body.שם, MAX_FIELD_LEN) || undefined,
      אירוע: safeString(body.אירוע, MAX_FIELD_LEN) || undefined,
      order_id: safeString(body.order_id, MAX_FIELD_LEN) || undefined,
      byHash: await actorHash(),
    };

    const result = await store.addRedeem(record);
    const data = await snapshot();
    return okResponse({
      ...data,
      status: result.created ? "created" : "exists",
      record: result.record,
    });
  } catch (err) {
    console.error("POST /api/redeems failed", err);
    return errorResponse("SERVER_ERROR", toReadableStoreError(err));
  }
}

type DeleteInput = { key?: unknown; all?: unknown };

export async function DELETE(request: Request) {
  const limit = checkRateLimit(`redeems:delete:${clientFingerprint(request)}`, 20, 60 * 1000);
  if (!limit.ok) {
    return errorResponse("RATE_LIMITED", "יותר מדי בקשות. נסו שוב בעוד דקה.");
  }

  let body: DeleteInput | null = null;
  try {
    body = (await request.json()) as DeleteInput;
  } catch {
    body = null;
  }

  try {
    const store = await getRedeemStore();
    const key = safeString(body?.key, MAX_KEY_LEN);
    const removeAll = body?.all === true;

    if (!key && !removeAll) {
      return errorResponse(
        "VALIDATION_ERROR",
        "יש לציין `key` למחיקת רשומה או `all:true` לאיפוס כללי."
      );
    }

    if (key) {
      await store.removeRedeem(key);
    } else if (removeAll) {
      await store.clear();
    }

    const data = await snapshot();
    return okResponse(data);
  } catch (err) {
    console.error("DELETE /api/redeems failed", err);
    return errorResponse("SERVER_ERROR", toReadableStoreError(err));
  }
}

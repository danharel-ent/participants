import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "SERVER_ERROR";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
};

export function okResponse<T>(
  data: T,
  init?: { headers?: HeadersInit; status?: number }
) {
  return NextResponse.json(
    { ok: true, data, meta: { updatedAt: new Date().toISOString() } },
    init
  );
}

export function errorResponse(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
  init?: { headers?: HeadersInit }
) {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message, details },
      meta: { updatedAt: new Date().toISOString() },
    },
    { status: STATUS_BY_CODE[code], headers: init?.headers }
  );
}

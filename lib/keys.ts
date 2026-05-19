import type { Participant } from "./types";

/** Stable key for scan state (phone/email/qr — not display name). */
export function participantKey(p: Participant): string {
  return `${p.אירוע}::${p.order_id}::${p.טלפון}::${p.אימייל}::${p.qr}`;
}

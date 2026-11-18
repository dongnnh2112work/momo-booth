import { createHmac, timingSafeEqual } from "node:crypto";

export const QR_WINDOW_MS = 15 * 60 * 1000;

const EXPIRED_MESSAGE = "QR đã hết hạn. Quét lại mã trên màn hình.";

function secret() {
  return process.env.BOOTH_QR_SECRET?.trim() || process.env.STAFF_KEY?.trim() || "";
}

function slotOf(now: number, offset: number) {
  return Math.floor(now / QR_WINDOW_MS) + offset;
}

export function qrToken(now = Date.now(), offset = 0) {
  const key = secret();
  if (!key) return "";
  return createHmac("sha256", key).update(`momo-checkin:${slotOf(now, offset)}`).digest("base64url").slice(0, 22);
}

function sameToken(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function qrTokenValid(token: string, now = Date.now()) {
  if (!token || !secret()) return false;
  return sameToken(token, qrToken(now, 0)) || sameToken(token, qrToken(now, -1));
}

export function qrExpiresAt(now = Date.now()) {
  return (slotOf(now, 0) + 1) * QR_WINDOW_MS;
}

export function expiredCheckin() {
  return { status: "unknown" as const, message: EXPIRED_MESSAGE, canControl: false };
}

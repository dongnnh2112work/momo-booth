import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function staffAuthorized(key: string | null): boolean {
  const expected = process.env.STAFF_KEY;
  if (typeof expected !== "string" || expected.trim() === "") return false;
  const provided = sha256(typeof key === "string" ? key : "");
  return timingSafeEqual(provided, sha256(expected));
}

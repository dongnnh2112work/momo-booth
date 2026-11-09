import "server-only";

export function staffAuthorized(key: string | null): boolean {
  const expected = process.env.STAFF_KEY || "momo-ptb";
  if (!key || key.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= key.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return mismatch === 0;
}

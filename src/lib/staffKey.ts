const PLACEHOLDER_STAFF_KEY = "change-me-before-event";
const RETIRED_STAFF_KEY = "momo-ptb";

const REFUSE_MESSAGE =
  "Refusing to start: STAFF_KEY is missing or still a placeholder. Set a unique STAFF_KEY before local/event mode.";

function envFlag(name: string) {
  const value = process.env[name];
  return value === "1" || value === "true";
}

export function usesLocalStore(): boolean {
  if (envFlag("MOMO_LOCAL")) return true;
  return !process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN;
}

export function localStaffKeyRejected(value: string | undefined): boolean {
  if (value == null) return true;
  const key = value.trim();
  if (!key) return true;
  return key === PLACEHOLDER_STAFF_KEY || key === RETIRED_STAFF_KEY;
}

export function assertLocalStaffKey(): void {
  if (!usesLocalStore()) return;
  if (!localStaffKeyRejected(process.env.STAFF_KEY)) return;
  console.error(REFUSE_MESSAGE);
  process.exitCode = 1;
  throw new Error(REFUSE_MESSAGE);
}

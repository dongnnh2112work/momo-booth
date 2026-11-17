const PLACEHOLDER_STAFF_KEY = "change-me-before-event";
const RETIRED_STAFF_KEY = "momo-ptb";

const REFUSE_MESSAGE =
  "Refusing to start: STAFF_KEY is missing or still a placeholder. Set a unique STAFF_KEY before local/event mode.";

function envFlag(name: string) {
  const value = process.env[name];
  return value === "1" || value === "true";
}

// MOMO_REMOTE=1 keeps one shared TV queue in Supabase live_state.
// MOMO_LOCAL=1 keeps that queue on this machine. MOMO_LOCAL wins if both are set.
// Blob env vars are not a mode switch.
export function usesLocalStore(): boolean {
  if (envFlag("MOMO_LOCAL")) return true;
  if (envFlag("MOMO_REMOTE")) return false;
  return true;
}

export function localStaffKeyRejected(value: string | undefined): boolean {
  if (value == null) return true;
  const key = value.trim();
  if (!key) return true;
  return key === PLACEHOLDER_STAFF_KEY || key === RETIRED_STAFF_KEY;
}

export function assertLocalStaffKey(): void {
  if (localStaffKeyRejected(process.env.STAFF_KEY)) {
    console.error(REFUSE_MESSAGE);
    process.exitCode = 1;
    throw new Error(REFUSE_MESSAGE);
  }
  if (usesLocalStore()) return;
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((name) => {
    const value = process.env[name];
    return typeof value !== "string" || value.trim().length === 0;
  });
  if (missing.length === 0) return;
  const message = `Refusing to start: remote mode missing ${missing.join(", ")}.`;
  console.error(message);
  process.exitCode = 1;
  throw new Error(message);
}

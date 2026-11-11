const STAFF_MANUAL_PREFIX = "staff-manual";

/**
 * Stable per booth and code so a repeat entry hits the same local slot.
 * A later pending-sync queue can reuse this id when it replays checkIn.
 * Nothing here buffers offline work or flushes Supabase.
 */
export function staffManualClientId(boothId: string, code: string): string {
  const slug = `${boothId}-${code}`.replace(/[^A-Za-z0-9-]/g, "").slice(0, 64);
  const id = `${STAFF_MANUAL_PREFIX}-${slug}`;
  return id.length >= 8 ? id.slice(0, 80) : `${STAFF_MANUAL_PREFIX}-entry`;
}

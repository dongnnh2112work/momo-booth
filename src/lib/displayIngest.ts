import "server-only";

import {
  realtimeEnabled,
  subscribe as subscribeCheckins,
  type CheckinRealtimeHandlers,
  type CheckinRealtimeRow,
} from "./checkinRealtime";
import { normalizeClientId } from "./codes";
import { usesLocalStore } from "./staffKey";

type DisplayIngest = (
  boothId: string,
  rows: { code: string; clientId: string; at: number }[],
) => Promise<unknown>;

type DisplayIngestDeps = {
  boothIds?: readonly string[];
  subscribe?: (booth: string, handlers: CheckinRealtimeHandlers) => () => void;
  ingest?: DisplayIngest;
};

const globalFlag = globalThis as typeof globalThis & { __momoDisplayIngest?: boolean };

export function displayIngestRunning(): boolean {
  return globalFlag.__momoDisplayIngest === true;
}

// Local/hybrid display on this process, and only when the public Supabase
// anon config is present. Unset public env keeps the in-memory SSE path.
export function displayIngestShouldStart(): boolean {
  if (process.env.NEXT_RUNTIME === "edge") return false;
  if (process.env.NEXT_PHASE === "phase-production-build") return false;
  if (!usesLocalStore()) return false;
  return realtimeEnabled();
}

export function toDisplayedCheckin(
  boothId: string,
  row: CheckinRealtimeRow,
): { code: string; clientId: string; at: number } | null {
  if (row.booth !== boothId) return null;
  if (typeof row.code !== "string" || !row.code.trim()) return null;
  const clientId = normalizeClientId(row.client_id) ?? normalizeClientId(row.id);
  if (!clientId) return null;
  const at = Date.parse(row.created_at);
  return { code: row.code, clientId, at: Number.isFinite(at) ? at : 0 };
}

export async function applyDisplayedRow(
  boothId: string,
  row: CheckinRealtimeRow,
  ingest: DisplayIngest,
): Promise<void> {
  const parsed = toDisplayedCheckin(boothId, row);
  if (!parsed) return;
  try {
    await ingest(boothId, [parsed]);
  } catch (error) {
    console.error(error instanceof Error ? error.name : "display ingest failed");
    throw error;
  }
}

export async function startDisplayIngest(deps?: DisplayIngestDeps): Promise<void> {
  if (globalFlag.__momoDisplayIngest) return;
  if (!displayIngestShouldStart()) return;

  const boothIds = deps?.boothIds ?? (await import("./booths")).BOOTH_IDS;
  const ingest = deps?.ingest ?? (await import("./store")).ingestDisplayedCheckins;
  const listen = deps?.subscribe ?? subscribeCheckins;
  if (globalFlag.__momoDisplayIngest) return;
  if (!displayIngestShouldStart()) return;

  globalFlag.__momoDisplayIngest = true;
  for (const boothId of boothIds) {
    listen(boothId, {
      onInsert(row) {
        return applyDisplayedRow(boothId, row, ingest);
      },
    });
  }
}

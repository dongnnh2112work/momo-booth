import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { LiveState } from "./types";

function envValue(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string") return "";
  return value.trim();
}

let service: { url: string; client: SupabaseClient } | null = null;

export function serviceRoleClient(): SupabaseClient | null {
  const url = envValue("NEXT_PUBLIC_SUPABASE_URL");
  const key = envValue("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  if (service && service.url === url) return service.client;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    db: { schema: "public" },
  });
  service = { url, client };
  return client;
}

export const LIVE_STATE_ID = "live";
export const LIVE_STATE_ATTEMPTS = 5;

export type LiveStateDraft<T> = {
  changed: boolean;
  emit?: string[];
  build: () => T;
};

export type LiveStateGateway = {
  read: () => Promise<{ revision: number; state: unknown } | null>;
  compareAndSwap: (expectedRevision: number | null, next: LiveState) => Promise<boolean>;
};

type Row = { revision?: unknown; state?: unknown };

function revisionOf(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) return parsed;
  }
  return 0;
}

function isConflict(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  const text = error.message ?? "";
  return error.code === "23505" || /duplicate key value|unique constraint/i.test(text);
}

export function supabaseLiveStateGateway(client: SupabaseClient | null = serviceRoleClient()): LiveStateGateway {
  if (!client) {
    return {
      async read() {
        throw new Error("live state unavailable");
      },
      async compareAndSwap() {
        throw new Error("live state unavailable");
      },
    };
  }

  return {
    async read() {
      const { data, error } = await client
        .from("live_state")
        .select("revision, state")
        .eq("id", LIVE_STATE_ID)
        .maybeSingle();
      if (error) throw new Error("live state read failed");
      if (!data) return null;
      const row = data as Row;
      return { revision: revisionOf(row.revision), state: row.state };
    },
    async compareAndSwap(expectedRevision, next) {
      const payload = {
        id: LIVE_STATE_ID,
        revision: next.revision,
        state: next,
        updated_at: new Date().toISOString(),
      };
      if (expectedRevision === null) {
        const { error } = await client.from("live_state").insert(payload);
        if (!error) return true;
        if (isConflict(error)) return false;
        throw new Error("live state insert failed");
      }
      const { data, error } = await client
        .from("live_state")
        .update(payload)
        .eq("id", LIVE_STATE_ID)
        .eq("revision", expectedRevision)
        .select("id");
      if (error) throw new Error("live state write failed");
      return Array.isArray(data) && data.length > 0;
    },
  };
}

export async function commitSharedState<T>(input: {
  gateway: LiveStateGateway;
  empty: () => LiveState;
  sanitize: (value: unknown) => LiveState;
  work: (state: LiveState, now: number) => LiveStateDraft<T>;
  now?: () => number;
  attempts?: number;
}): Promise<{ result: T; state: LiveState; changed: boolean; attempts: number; emit: string[] }> {
  const now = input.now ?? Date.now;
  const limit = input.attempts ?? LIVE_STATE_ATTEMPTS;
  let attempts = 0;
  for (let attempt = 1; attempt <= limit; attempt += 1) {
    attempts = attempt;
    const row = await input.gateway.read();
    const state = row ? input.sanitize(row.state) : input.empty();
    if (row) state.revision = row.revision;
    const draft = input.work(state, now());
    if (!draft.changed) {
      return { result: draft.build(), state, changed: false, attempts, emit: draft.emit ?? [] };
    }
    const expected = row ? state.revision : null;
    state.revision += 1;
    const wrote = await input.gateway.compareAndSwap(expected, state);
    if (!wrote) continue;
    return { result: draft.build(), state, changed: true, attempts, emit: draft.emit ?? [] };
  }
  throw new Error("live state conflict");
}

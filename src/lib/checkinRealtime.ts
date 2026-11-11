import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

export type CheckinRealtimeRow = {
  id: string;
  code: string;
  booth: string;
  client_id: string;
  created_at: string;
};

export type CheckinRealtimeHandlers = {
  onInsert: (row: CheckinRealtimeRow) => void | Promise<void>;
};

type PublicSupabaseConfig = {
  url: string;
  anonKey: string;
};

function publicSupabaseConfig(): PublicSupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function realtimeEnabled(): boolean {
  return publicSupabaseConfig() !== null;
}

let browser: { url: string; anonKey: string; client: SupabaseClient } | null = null;

export function browserClient(): SupabaseClient | null {
  const config = publicSupabaseConfig();
  if (!config) return null;
  if (browser && browser.url === config.url && browser.anonKey === config.anonKey) return browser.client;
  const client = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    db: { schema: "public" },
  });
  browser = { url: config.url, anonKey: config.anonKey, client };
  return client;
}

function isRow(value: unknown): value is CheckinRealtimeRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<CheckinRealtimeRow>;
  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.code === "string" &&
    typeof row.booth === "string" &&
    typeof row.client_id === "string" &&
    typeof row.created_at === "string"
  );
}

export function mergeCheckins(existingIds: Iterable<string>, rows: readonly CheckinRealtimeRow[]): CheckinRealtimeRow[] {
  const seen = new Set(existingIds);
  const fresh: CheckinRealtimeRow[] = [];
  for (const row of rows) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    fresh.push(row);
  }
  fresh.sort((left, right) => {
    if (left.created_at < right.created_at) return -1;
    if (left.created_at > right.created_at) return 1;
    if (left.id < right.id) return -1;
    if (left.id > right.id) return 1;
    return 0;
  });
  return fresh;
}

export async function catchUp(booth: string, client: SupabaseClient | null = browserClient()): Promise<CheckinRealtimeRow[]> {
  if (!client) return [];
  try {
    const { data, error } = await client
      .from("checkins")
      .select("id, code, booth, client_id, created_at")
      .eq("booth", booth)
      .order("created_at", { ascending: true });
    if (error || !Array.isArray(data)) return [];
    const rows: CheckinRealtimeRow[] = [];
    for (const item of data) {
      if (isRow(item) && item.booth === booth) rows.push(item);
    }
    return rows;
  } catch {
    return [];
  }
}

export function subscribe(
  booth: string,
  handlers: CheckinRealtimeHandlers,
  client: SupabaseClient | null = browserClient(),
): () => void {
  if (!client) return () => {};
  const applied = new Set<string>();
  let stopped = false;
  let chain: Promise<void> = Promise.resolve();

  const deliver = (rows: CheckinRealtimeRow[]) => {
    chain = chain
      .then(async () => {
        if (stopped) return;
        const fresh = mergeCheckins(applied, rows);
        for (const row of fresh) applied.add(row.id);
        for (const row of fresh) {
          try {
            await handlers.onInsert(row);
          } catch {
            applied.delete(row.id);
          }
        }
      })
      .catch(() => undefined);
  };

  void catchUp(booth, client).then((rows) => deliver(rows));

  const topic = `checkins:${booth}:${Math.random().toString(36).slice(2, 10)}`;
  const channel: RealtimeChannel = client
    .channel(topic)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "checkins", filter: `booth=eq.${booth}` },
      (payload) => {
        const row = isRow(payload.new) ? payload.new : null;
        if (!row || row.booth !== booth) return;
        deliver([row]);
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void catchUp(booth, client).then((rows) => deliver(rows));
      }
    });

  return () => {
    stopped = true;
    void client.removeChannel(channel);
  };
}

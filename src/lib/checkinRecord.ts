import "server-only";

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { BOOTHS, isBoothId, type BoothId } from "./booths";
import { normalizeCode } from "./codes";

const UNKNOWN_CODE = "Không tìm thấy mã này trong danh sách vinh danh.";

export type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
} | null;

export type CheckinWriteStatus = "checked-in" | "already-checked-in" | "error";

export type CheckinRow = {
  id: string;
  code: string;
  booth: string;
  client_id: string;
  created_at: string;
};

export type CheckinInsertClient = {
  from: (table: "checkins") => {
    insert: (row: CheckinRow) => PromiseLike<{ error: SupabaseErrorLike }>;
  };
};

export type RemoteCheckinBody = {
  status: "unknown" | "wrong_booth" | "checked-in" | "already-checked-in";
  message: string;
  canControl: false;
  code?: string;
  booth?: string;
  client_id?: string;
  created_at?: string;
};

export type RemoteCheckinResult = {
  status: number;
  body: RemoteCheckinBody | { message: string };
};

type CodesClient = {
  from: (table: "codes") => {
    select: (columns: "booth") => {
      eq: (
        column: "code",
        value: string,
      ) => PromiseLike<{ data: Array<{ booth?: string | null }> | null; error: SupabaseErrorLike }>;
    };
  };
};

function envValue(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string") return "";
  return value.trim();
}

export function remoteCheckinEnabled(): boolean {
  return Boolean(envValue("NEXT_PUBLIC_SUPABASE_URL") && envValue("SUPABASE_SERVICE_ROLE_KEY"));
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

export function toCheckinRow(input: CheckinRow): CheckinRow {
  return {
    id: input.id,
    code: input.code,
    booth: input.booth,
    client_id: input.client_id,
    created_at: input.created_at,
  };
}

/** Unique (code, booth) conflict. A conflict is not a second insert. */
export function mapCheckinInsertError(error: SupabaseErrorLike): CheckinWriteStatus {
  if (!error) return "checked-in";
  const code = error.code ?? "";
  const text = `${error.message ?? ""}\n${error.details ?? ""}`;
  const uniqueViolation = code === "23505" || /duplicate key value|unique constraint/i.test(text);
  if (!uniqueViolation) return "error";
  return "already-checked-in";
}

export async function applyCheckinInsert(
  client: CheckinInsertClient,
  row: CheckinRow,
): Promise<{ status: CheckinWriteStatus; payload: CheckinRow }> {
  const payload = toCheckinRow(row);
  const { error } = await client.from("checkins").insert(payload);
  return { status: mapCheckinInsertError(error), payload };
}

function rosterFile(): string {
  const raw = process.env.ROSTER_PATH;
  if (!raw) return path.join(process.cwd(), "data/roster.json");
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

function rosterBoothFor(code: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(rosterFile(), "utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const employees = (parsed as { employees?: unknown }).employees;
  if (!Array.isArray(employees)) return null;
  for (const person of employees) {
    if (!person || typeof person !== "object") continue;
    const record = person as {
      code?: unknown;
      boothId?: unknown;
      name?: unknown;
      department?: unknown;
      photo?: unknown;
      years?: unknown;
    };
    if (typeof record.code !== "string" || normalizeCode(record.code) !== code) continue;
    if (typeof record.boothId !== "string" || !isBoothId(record.boothId)) continue;
    if (typeof record.name !== "string" || !record.name) continue;
    if (typeof record.department !== "string" || !record.department) continue;
    if (typeof record.photo !== "string" || !record.photo) continue;
    if (typeof record.years !== "number" || !Number.isFinite(record.years)) continue;
    return record.boothId;
  }
  return null;
}

function writerFor(client: SupabaseClient): CheckinInsertClient {
  return {
    from(table) {
      return {
        insert(row) {
          return client.from(table).insert(row) as PromiseLike<{ error: SupabaseErrorLike }>;
        },
      };
    },
  };
}

function codesFor(client: SupabaseClient): CodesClient {
  return {
    from(table) {
      return {
        select(columns) {
          return {
            eq(column, value) {
              return client.from(table).select(columns).eq(column, value) as PromiseLike<{
                data: Array<{ booth?: string | null }> | null;
                error: SupabaseErrorLike;
              }>;
            },
          };
        },
      };
    },
  };
}

async function codesBooths(client: CodesClient, code: string): Promise<string[] | "error"> {
  const { data, error } = await client.from("codes").select("booth").eq("code", code);
  if (error) return "error";
  if (!Array.isArray(data)) return [];
  const booths: string[] = [];
  for (const row of data) {
    if (row && typeof row.booth === "string" && row.booth) booths.push(row.booth);
  }
  return booths;
}

function admission(
  rosterBooth: string | null,
  codes: string[] | "error",
  booth: string,
): "allow" | "unknown" | "wrong_booth" | "unavailable" {
  const codesMatch = codes !== "error" && codes.includes(booth);
  if (rosterBooth === booth || codesMatch) return "allow";
  if (codes === "error") return rosterBooth ? "wrong_booth" : "unavailable";
  if (rosterBooth || codes.length > 0) return "wrong_booth";
  return "unknown";
}

function wrongBoothBody(code: string, boothId: string): RemoteCheckinBody {
  const label = isBoothId(boothId) ? BOOTHS[boothId].label : boothId;
  return {
    status: "wrong_booth",
    message: `Mã này thuộc booth ${label}. Bạn qua booth bên kia nhé.`,
    canControl: false,
    code,
  };
}

export async function recordRemoteCheckin(
  input: { boothId: BoothId; code: string; clientId: string },
  deps?: { insert?: CheckinInsertClient; codes?: CodesClient; now?: Date; id?: string },
): Promise<RemoteCheckinResult> {
  const code = normalizeCode(input.code);
  if (!code) {
    return { status: 200, body: { status: "unknown", message: UNKNOWN_CODE, canControl: false } };
  }

  const supabase = deps?.insert && deps.codes ? null : serviceRoleClient();
  if (!deps?.insert && !supabase) {
    return { status: 500, body: { message: "Booth đang bận, thử lại." } };
  }
  const insertClient = deps?.insert ?? writerFor(supabase as SupabaseClient);
  const codesClient = deps?.codes ?? codesFor(supabase as SupabaseClient);

  const rosterBooth = rosterBoothFor(code);
  const listed = await codesBooths(codesClient, code);
  const decision = admission(rosterBooth, listed, input.boothId);
  if (decision === "unavailable") {
    return { status: 500, body: { message: "Booth đang bận, thử lại." } };
  }
  if (decision === "unknown") {
    return { status: 200, body: { status: "unknown", message: UNKNOWN_CODE, canControl: false } };
  }
  if (decision === "wrong_booth") {
    const other = rosterBooth && rosterBooth !== input.boothId ? rosterBooth : listed !== "error" ? listed.find((id) => id !== input.boothId) : undefined;
    return { status: 200, body: wrongBoothBody(code, other || input.boothId) };
  }

  const row = toCheckinRow({
    id: deps?.id ?? randomUUID(),
    code,
    booth: input.boothId,
    client_id: input.clientId,
    created_at: (deps?.now ?? new Date()).toISOString(),
  });
  const written = await applyCheckinInsert(insertClient, row);
  if (written.status === "error") {
    return { status: 500, body: { message: "Booth đang bận, thử lại." } };
  }
  if (written.status === "already-checked-in") {
    return {
      status: 200,
      body: {
        status: "already-checked-in",
        message: "already-checked-in",
        canControl: false,
        code: written.payload.code,
        booth: written.payload.booth,
        client_id: written.payload.client_id,
      },
    };
  }
  return {
    status: 200,
    body: {
      status: "checked-in",
      message: "Đã ghi nhận check-in.",
      canControl: false,
      code: written.payload.code,
      booth: written.payload.booth,
      client_id: written.payload.client_id,
      created_at: written.payload.created_at,
    },
  };
}

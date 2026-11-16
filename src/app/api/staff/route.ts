import { staffAuthorized } from "@/lib/auth";
import { BOOTH_IDS } from "@/lib/booths";
import { normalizeCode } from "@/lib/codes";
import { makeEtag } from "@/lib/etag";
import { json, readJson, withEtag } from "@/lib/http";
import { rateLimited } from "@/lib/rateLimit";
import { staffManualClientId } from "@/lib/staffManual";
import { usesLocalStore } from "@/lib/staffKey";
import {
  checkIn,
  clearCooldown,
  clearQueue,
  parseBooth,
  readHealth,
  readLiveState,
  readStaff,
  skipTurn,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function opOf(request: Request, body?: Record<string, unknown>) {
  const fromQuery = new URL(request.url).searchParams.get("op");
  if (fromQuery) return fromQuery;
  if (typeof body?.op === "string") return body.op;
  return null;
}

export async function GET(request: Request) {
  const op = opOf(request) ?? "state";
  if (op === "health") {
    return json(await readHealth());
  }

  const limited = rateLimited(request, "staff-read");
  if (limited) return limited;
  if (!staffAuthorized(request.headers.get("x-staff-key"))) {
    return json({ message: "Sai khóa." }, 401);
  }

  if (op === "export") {
    const state = await readLiveState();
    return json(state, 200, {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="live-state.json"',
    });
  }

  if (op !== "state") return json({ message: "Sai lệnh." }, 400);

  const payload = await readStaff();
  const etag = makeEtag(["staff", ...BOOTH_IDS.map((id) => payload.booths[id].snapshot.revision)]);
  return withEtag(request, etag, payload);
}

export async function POST(request: Request) {
  const limited = rateLimited(request, "staff-write");
  if (limited) return limited;
  if (!staffAuthorized(request.headers.get("x-staff-key"))) {
    return json({ message: "Sai khóa." }, 401);
  }

  const body = await readJson(request);
  const op = opOf(request, body);
  const boothId = parseBooth(body.boothId);
  if (!boothId) return json({ message: "Sai booth." }, 400);

  try {
    if (op === "skip") return json(await skipTurn(boothId));
    if (op === "clear") return json(await clearQueue(boothId));
    if (op === "clear-cooldown") {
      const code = typeof body.code === "string" ? body.code : undefined;
      return json(await clearCooldown(boothId, code));
    }
    if (op === "manual-checkin") {
      if (!usesLocalStore()) {
        return json({ message: "Nhập mã tay chỉ dùng trên máy local." }, 403);
      }
      const rawCode = typeof body.code === "string" ? body.code : "";
      const normalized = normalizeCode(rawCode);
      const clientId = staffManualClientId(boothId, normalized ?? "invalid");
      const result = await checkIn(boothId, { code: rawCode, clientId, intent: "join" });
      if (result.status === "spotlight" || result.status === "queued") return json(result);
      return json(result, result.status === "unknown" ? 404 : 409);
    }
    return json({ message: "Sai lệnh." }, 400);
  } catch (error) {
    console.error(error instanceof Error ? error.name : "staff action failed");
    return json({ message: "Booth đang bận, thử lại." }, 500);
  }
}

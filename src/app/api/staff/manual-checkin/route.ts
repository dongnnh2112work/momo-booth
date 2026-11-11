import { staffAuthorized } from "@/lib/auth";
import { normalizeCode } from "@/lib/codes";
import { json, readJson } from "@/lib/http";
import { rateLimited } from "@/lib/rateLimit";
import { staffManualClientId } from "@/lib/staffManual";
import { usesLocalStore } from "@/lib/staffKey";
import { checkIn, parseBooth } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = rateLimited(request, "staff-write");
  if (limited) return limited;
  if (!staffAuthorized(request.headers.get("x-staff-key"))) {
    return json({ message: "Sai khóa." }, 401);
  }
  if (!usesLocalStore()) {
    return json({ message: "Nhập mã tay chỉ dùng trên máy local." }, 403);
  }
  const body = await readJson(request);
  const boothId = parseBooth(body.boothId);
  if (!boothId) return json({ message: "Sai booth." }, 400);
  const rawCode = typeof body.code === "string" ? body.code : "";
  const normalized = normalizeCode(rawCode);
  const clientId = staffManualClientId(boothId, normalized ?? "invalid");
  try {
    const result = await checkIn(boothId, { code: rawCode, clientId, intent: "join" });
    if (result.status === "spotlight" || result.status === "queued") return json(result);
    return json(result, result.status === "unknown" ? 404 : 409);
  } catch (error) {
    console.error(error instanceof Error ? error.name : "manual checkin failed");
    return json({ message: "Booth đang bận, thử lại." }, 500);
  }
}

import { staffAuthorized } from "@/lib/auth";
import { json, readJson } from "@/lib/http";
import { clearCooldown, parseBooth } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!staffAuthorized(request.headers.get("x-staff-key"))) {
    return json({ message: "Sai khóa." }, 401);
  }
  const body = await readJson(request);
  const boothId = parseBooth(body.boothId);
  if (!boothId) return json({ message: "Sai booth." }, 400);
  const code = typeof body.code === "string" ? body.code : undefined;
  const result = await clearCooldown(boothId, code);
  return json(result);
}

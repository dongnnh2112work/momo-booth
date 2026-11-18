import { expiredCheckin, qrTokenValid } from "@/lib/checkinPass";
import { normalizeClientId } from "@/lib/codes";
import { json, readJson } from "@/lib/http";
import { clientRateLimited, rateLimited } from "@/lib/rateLimit";
import { checkInByCode } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = rateLimited(request, "checkin");
  if (limited) return limited;
  const body = await readJson(request);
  const clientId = typeof body.clientId === "string" ? normalizeClientId(body.clientId) : null;
  if (!clientId) return json({ message: "Thiếu mã máy." }, 400);
  const clientLimited = clientRateLimited(clientId);
  if (clientLimited) return clientLimited;
  const code = typeof body.code === "string" ? body.code : "";
  const intent = body.intent === "resume" ? "resume" : "join";
  const pass = typeof body.k === "string" ? body.k : "";
  if (intent === "join" && !qrTokenValid(pass)) return json(expiredCheckin());
  try {
    const result = await checkInByCode({ code, clientId, intent });
    return json(result);
  } catch (error) {
    console.error(error instanceof Error ? error.name : "checkin failed");
    return json({ message: "Booth đang bận, thử lại." }, 500);
  }
}

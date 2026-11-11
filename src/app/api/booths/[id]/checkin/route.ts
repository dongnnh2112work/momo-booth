import { isBoothId } from "@/lib/booths";
import { recordRemoteCheckin, remoteCheckinEnabled } from "@/lib/checkinRecord";
import { normalizeClientId } from "@/lib/codes";
import { json, readJson } from "@/lib/http";
import { rateLimited } from "@/lib/rateLimit";
import { checkIn } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const limited = rateLimited(request, "checkin");
  if (limited) return limited;
  const { id } = await context.params;
  if (!isBoothId(id)) return json({ message: "Không có booth này." }, 404);
  const body = await readJson(request);
  const clientId = typeof body.clientId === "string" ? normalizeClientId(body.clientId) : null;
  if (!clientId) return json({ message: "Thiếu mã máy." }, 400);
  const code = typeof body.code === "string" ? body.code : "";
  const intent = body.intent === "resume" ? "resume" : "join";
  try {
    if (remoteCheckinEnabled()) {
      const recorded = await recordRemoteCheckin({ boothId: id, code, clientId });
      return json(recorded.body, recorded.status);
    }
    const result = await checkIn(id, { code, clientId, intent });
    return json(result);
  } catch (error) {
    console.error(error instanceof Error ? error.name : "checkin failed");
    return json({ message: "Booth đang bận, thử lại." }, 500);
  }
}

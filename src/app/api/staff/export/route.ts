import { staffAuthorized } from "@/lib/auth";
import { json } from "@/lib/http";
import { rateLimited } from "@/lib/rateLimit";
import { readLiveState } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = rateLimited(request, "staff-read");
  if (limited) return limited;
  if (!staffAuthorized(request.headers.get("x-staff-key"))) {
    return json({ message: "Sai khóa." }, 401);
  }
  const state = await readLiveState();
  return json(state, 200, {
    "Content-Type": "application/json",
    "Content-Disposition": 'attachment; filename="live-state.json"',
  });
}

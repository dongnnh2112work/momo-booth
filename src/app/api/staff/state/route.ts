import { staffAuthorized } from "@/lib/auth";
import { BOOTH_IDS } from "@/lib/booths";
import { makeEtag } from "@/lib/etag";
import { json, withEtag } from "@/lib/http";
import { rateLimited } from "@/lib/rateLimit";
import { readStaff } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = rateLimited(request, "staff-read");
  if (limited) return limited;
  if (!staffAuthorized(request.headers.get("x-staff-key"))) {
    return json({ message: "Sai khóa." }, 401);
  }
  const payload = await readStaff();
  const etag = makeEtag(["staff", ...BOOTH_IDS.map((id) => payload.booths[id].snapshot.revision)]);
  return withEtag(request, etag, payload);
}

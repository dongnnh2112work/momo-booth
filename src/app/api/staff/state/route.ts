import { staffAuthorized } from "@/lib/auth";
import { json } from "@/lib/http";
import { readStaff } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!staffAuthorized(request.headers.get("x-staff-key"))) {
    return json({ message: "Sai khóa." }, 401);
  }
  const payload = await readStaff();
  return json(payload);
}

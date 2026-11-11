import { json } from "@/lib/http";
import { readHealth } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await readHealth();
  return json(payload);
}

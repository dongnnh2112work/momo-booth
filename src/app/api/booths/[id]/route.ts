import { isBoothId } from "@/lib/booths";
import { json } from "@/lib/http";
import { getBooth } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isBoothId(id)) return json({ message: "Không có booth này." }, 404);
  const payload = await getBooth(id);
  return json(payload);
}

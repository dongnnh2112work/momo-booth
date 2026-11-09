import { isBoothId } from "@/lib/booths";
import { json, readJson } from "@/lib/http";
import { finishTurn } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isBoothId(id)) return json({ message: "Không có booth này." }, 404);
  const body = await readJson(request);
  const ticket = typeof body.ticket === "string" ? body.ticket : "";
  if (ticket.length < 8) return json({ message: "Thiếu vé lượt chiếu." }, 400);
  try {
    const result = await finishTurn(id, ticket);
    return json(result, result.ok ? 200 : 409);
  } catch (error) {
    console.error(error);
    return json({ message: "Booth đang bận, thử lại." }, 500);
  }
}

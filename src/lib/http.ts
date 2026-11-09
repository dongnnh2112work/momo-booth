export function json(body: unknown, status = 200): Response {
  const timing = (globalThis as { __boothTiming?: { read: number; write: number; attempts: number } }).__boothTiming;
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (timing) {
    headers["Server-Timing"] = `blob-read;dur=${timing.read}, blob-write;dur=${timing.write}, attempts;dur=${timing.attempts}`;
  }
  return Response.json(body, { status, headers });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (body && typeof body === "object") return body as Record<string, unknown>;
  } catch {
    return {};
  }
  return {};
}

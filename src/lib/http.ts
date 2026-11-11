import { etagMatches } from "./etag";

export function json(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  const timing = (globalThis as { __boothTiming?: { read: number; write: number; attempts: number } }).__boothTiming;
  const headers: Record<string, string> = { "Cache-Control": "no-store", ...extraHeaders };
  if (timing) {
    headers["Server-Timing"] = `blob-read;dur=${timing.read}, blob-write;dur=${timing.write}, attempts;dur=${timing.attempts}`;
  }
  return Response.json(body, { status, headers });
}

export function notModified(etag: string): Response {
  return new Response(null, {
    status: 304,
    headers: {
      ETag: etag,
      "Cache-Control": "no-store",
    },
  });
}

export function withEtag(request: Request, etag: string, body: unknown): Response {
  if (etagMatches(request, etag)) return notModified(etag);
  return json(body, 200, { ETag: etag });
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

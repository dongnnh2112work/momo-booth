export function makeEtag(parts: Array<string | number>): string {
  return `"${parts.map((part) => String(part)).join(":")}"`;
}

export function etagMatches(request: Request, etag: string): boolean {
  const raw = request.headers.get("if-none-match");
  if (!raw) return false;
  return raw.split(",").some((item) => {
    const value = item.trim();
    return value === etag || value === `W/${etag}` || value === etag.replace(/^W\//, "");
  });
}

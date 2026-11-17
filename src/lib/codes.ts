export function normalizeCode(input: string): string | null {
  const code = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9.-]{2,40}$/.test(code)) return null;
  return code;
}

// A scanned QR is either the employee code itself, or a check-in link with ?code=.
// The plain booth link (no code) is the QR on the loop and is not a check-in.
export function codeFromScan(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return normalizeCode(url.searchParams.get("code") ?? "");
  } catch {
    return normalizeCode(text);
  }
}

export function normalizeClientId(input: string): string | null {
  if (!/^[A-Za-z0-9-]{8,80}$/.test(input)) return null;
  return input;
}

export function normalizeCode(input: string): string | null {
  const code = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9-]{2,16}$/.test(code)) return null;
  return code;
}

export function normalizeClientId(input: string): string | null {
  if (!/^[A-Za-z0-9-]{8,80}$/.test(input)) return null;
  return input;
}

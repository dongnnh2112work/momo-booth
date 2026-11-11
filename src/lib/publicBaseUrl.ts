export type PublicBaseEnv = {
  PUBLIC_BASE_URL?: string;
  NEXT_PUBLIC_BASE_URL?: string;
};

// Absolute origin for check-in QR codes and the setup-page check-in/display URLs.
// Precedence: PUBLIC_BASE_URL, then NEXT_PUBLIC_BASE_URL, then `fallback`
// (window.location.origin when unset). SetupHome is a client component, so the
// server page passes both values in. NEXT_PUBLIC_BASE_URL is the client-visible
// name for the same setting — set only one. Trailing slashes are stripped.
// Blank values count as unset.
export function publicBaseUrl(env: PublicBaseEnv, fallback: string): string {
  const preferred = stripTrailingSlashes(env.PUBLIC_BASE_URL);
  if (preferred) return preferred;
  const clientVisible = stripTrailingSlashes(env.NEXT_PUBLIC_BASE_URL);
  if (clientVisible) return clientVisible;
  return stripTrailingSlashes(fallback);
}

function stripTrailingSlashes(value: string | undefined): string {
  if (value == null) return "";
  return value.trim().replace(/\/+$/, "");
}

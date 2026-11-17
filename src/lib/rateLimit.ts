import net from "node:net";

import { json } from "./http";

const WINDOW_MS = 60_000;
const MAX_BUCKETS = 4_000;

export const RATE_LIMIT_MESSAGE = "Quá nhiều yêu cầu.";

// Per IP, per minute. Check-in stays wide enough for a shared event Wi-Fi.
// A separate global bucket is only a circuit breaker. Duplicate check-ins are
// still rejected per code and booth.
const DEFAULT_LIMITS = {
  checkin: 120,
  "checkin-client": 10,
  "staff-read": 120,
  "staff-write": 60,
  global: 5000,
} as const;

const LIMIT_ENV = {
  checkin: "RATE_LIMIT_CHECKIN_PER_MIN",
  "checkin-client": "RATE_LIMIT_CHECKIN_CLIENT_PER_MIN",
  "staff-read": "RATE_LIMIT_STAFF_READ_PER_MIN",
  "staff-write": "RATE_LIMIT_STAFF_WRITE_PER_MIN",
  global: "RATE_LIMIT_GLOBAL_PER_MIN",
} as const;

export type RateScope = keyof typeof DEFAULT_LIMITS;

function positiveInt(raw: string | undefined, fallback: number): number {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return fallback;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value <= 0) return fallback;
  return value;
}

export function limitFor(scope: RateScope, env: NodeJS.ProcessEnv = process.env): number {
  return positiveInt(env[LIMIT_ENV[scope]], DEFAULT_LIMITS[scope]);
}

export const LIMITS: { readonly [K in RateScope]: number } = {
  get checkin() {
    return limitFor("checkin");
  },
  get "checkin-client"() {
    return limitFor("checkin-client");
  },
  get "staff-read"() {
    return limitFor("staff-read");
  },
  get "staff-write"() {
    return limitFor("staff-write");
  },
  get global() {
    return limitFor("global");
  },
};

type Buckets = Map<string, number[]>;

function store(): Buckets {
  const holder = globalThis as { __momoRateBuckets?: Buckets };
  if (!holder.__momoRateBuckets) holder.__momoRateBuckets = new Map();
  return holder.__momoRateBuckets;
}

function parseIpToken(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let token = raw.trim();
  if (!token || token.length > 128) return null;
  if (token.startsWith('"') && token.endsWith('"') && token.length >= 2) {
    token = token.slice(1, -1).trim();
  }
  if (token.startsWith("[") && token.includes("]")) {
    token = token.slice(1, token.indexOf("]"));
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(token)) {
    token = token.slice(0, token.lastIndexOf(":"));
  }
  if (token.startsWith("::ffff:")) {
    const mapped = token.slice("::ffff:".length);
    if (net.isIP(mapped) === 4) return mapped;
  }
  return net.isIP(token) ? token : null;
}

function trustedProxy(): boolean {
  const value = process.env.TRUST_PROXY;
  return value === "1" || value === "true";
}

function lastForwardedIp(header: string): string | null {
  const parts = header.split(",");
  const start = Math.max(0, parts.length - 8);
  for (let index = parts.length - 1; index >= start; index -= 1) {
    const ip = parseIpToken(parts[index]);
    if (ip) return ip;
  }
  return null;
}

function forwardedForIp(header: string): string | null {
  const match = /for=\s*"?\[?([^\]";,\s]+)/i.exec(header);
  return parseIpToken(match?.[1] ?? null);
}

/**
 * Address added by a trusted proxy, or "unknown".
 * Client-supplied X-Forwarded-For is ignored unless TRUST_PROXY=1, and then
 * only the last hop counts. The rate limit itself is per process, so a forged
 * header cannot open a new budget.
 */
export function clientIp(request: Request): string {
  if (!trustedProxy()) return "unknown";
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ip = lastForwardedIp(forwarded);
    if (ip) return ip;
  }
  const real = parseIpToken(request.headers.get("x-real-ip"));
  if (real) return real;
  const rfc = request.headers.get("forwarded");
  if (rfc) {
    const ip = forwardedForIp(rfc);
    if (ip) return ip;
  }
  return "unknown";
}

function recentHits(hits: number[], now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  return hits.filter((stamp) => stamp > cutoff);
}

function sweep(now: number) {
  const buckets = store();
  for (const [key, hits] of buckets) {
    const recent = recentHits(hits, now, WINDOW_MS);
    if (recent.length === 0) buckets.delete(key);
    else if (recent.length !== hits.length) buckets.set(key, recent);
  }
}

export function resetRateLimits(): void {
  store().clear();
}

function bucketKey(key: string, now: number): string {
  const buckets = store();
  if (buckets.has(key) || buckets.size < MAX_BUCKETS) return key;
  sweep(now);
  if (buckets.has(key) || buckets.size < MAX_BUCKETS) return key;
  return "overflow";
}

export function consumeRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const buckets = store();
  const id = bucketKey(key, now);
  const hits = recentHits(buckets.get(id) ?? [], now, windowMs);
  if (hits.length >= limit) {
    if (hits.length > 0) buckets.set(id, hits);
    else buckets.delete(id);
    return false;
  }
  hits.push(now);
  buckets.set(id, hits);
  return true;
}

function blocked(): Response {
  return json({ message: RATE_LIMIT_MESSAGE }, 429);
}

export function rateLimited(request: Request, scope: Exclude<RateScope, "global" | "checkin-client">, now = Date.now()): Response | null {
  if (!consumeRateLimit(`global:${scope}`, limitFor("global"), WINDOW_MS, now)) return blocked();
  const ip = clientIp(request);
  if (ip !== "unknown" && !consumeRateLimit(`${scope}:${ip}`, limitFor(scope), WINDOW_MS, now)) return blocked();
  return null;
}

export function clientRateLimited(clientId: string, now = Date.now()): Response | null {
  if (!consumeRateLimit(`checkin:client:${clientId}`, limitFor("checkin-client"), WINDOW_MS, now)) return blocked();
  return null;
}

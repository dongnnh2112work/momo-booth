import fs from "node:fs";
import path from "node:path";

import { DEFAULT_BOOTHS, type Booth, type BoothId } from "./booths-shared";

export type { Booth, BoothId };

// Server catalog. Client code must import @/lib/booths-shared instead.
// Cached when this module is first imported. Set BOOTH_IDS or data/booths.json
// before importing, or call reloadBooths() after changing them.

export const BOOTH_IDS: BoothId[] = [];

export const BOOTHS: Record<BoothId, Booth> = {};

function builtin(id: string): Booth | undefined {
  return DEFAULT_BOOTHS.find((booth) => booth.id === id);
}

function placeholder(id: string): Booth {
  const known = builtin(id);
  if (known) return known;
  return { id, label: id, title: id, blurb: "", sample: "" };
}

function parseEnvIds(raw: string | undefined): string[] | null {
  if (raw == null || raw.trim() === "") return null;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids.length > 0 ? ids : null;
}

function parseBooth(value: unknown): Booth | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id) return null;
  const label = typeof record.label === "string" && record.label.trim() ? record.label : id;
  const title = typeof record.title === "string" ? record.title : label;
  const blurb = typeof record.blurb === "string" ? record.blurb : "";
  const sample = typeof record.sample === "string" ? record.sample : "";
  return { id, label, title, blurb, sample };
}

function readBoothFile(): Booth[] | null {
  const file = path.join(process.cwd(), "data", "booths.json");
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    console.error(`booths.json unreadable: ${file}`);
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(`booths.json ignored (invalid JSON): ${file}`);
    return null;
  }
  if (!Array.isArray(parsed)) {
    console.error(`booths.json ignored (expected an array): ${file}`);
    return null;
  }
  const booths: Booth[] = [];
  const seen = new Set<string>();
  for (const entry of parsed) {
    const booth = parseBooth(entry);
    if (!booth || seen.has(booth.id)) continue;
    seen.add(booth.id);
    booths.push(booth);
  }
  return booths.length > 0 ? booths : null;
}

// 1. BOOTH_IDS selects the ids (json entry, else built-in copy, else label = id).
// 2. Otherwise data/booths.json when it is a non-empty array.
// 3. Otherwise the built-in 5-10 and 3-5 booths.
function loadBooths(): Booth[] {
  const fromFile = readBoothFile();
  const fromEnv = parseEnvIds(process.env.BOOTH_IDS);
  if (fromEnv) {
    const byId = new Map((fromFile ?? []).map((booth) => [booth.id, booth]));
    return fromEnv.map((id) => byId.get(id) ?? placeholder(id));
  }
  if (fromFile) return fromFile;
  return DEFAULT_BOOTHS;
}

function publish(list: Booth[]) {
  BOOTH_IDS.splice(0, BOOTH_IDS.length, ...list.map((booth) => booth.id));
  for (const key of Object.keys(BOOTHS)) delete BOOTHS[key];
  for (const booth of list) BOOTHS[booth.id] = { ...booth };
}

export function reloadBooths(): void {
  publish(loadBooths());
}

export function isBoothId(value: string): value is BoothId {
  return BOOTH_IDS.includes(value);
}

reloadBooths();

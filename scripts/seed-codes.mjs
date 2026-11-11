#!/usr/bin/env node
// Upsert public.codes with code + booth only. Never send or log roster PII.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");

const BATCH = 500;
const CODE_RE = /^[A-Z0-9-]{2,16}$/;

function envValue(name) {
  const value = process.env[name];
  if (typeof value !== "string") return "";
  return value.trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function rosterPath() {
  const raw = envValue("ROSTER_PATH");
  if (!raw) return path.join(process.cwd(), "data/roster.json");
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

/** Same shape as src/lib/codes.ts normalizeCode so check-in lookups match. */
export function normalizeCode(input) {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!CODE_RE.test(code)) return null;
  return code;
}

function boothIdOf(input) {
  if (typeof input !== "string") return null;
  const booth = input.trim();
  if (!booth || booth.length > 64) return null;
  return booth;
}

/**
 * Employees in, { code, booth } rows out. Drops every other field.
 * Duplicate (code, booth) pairs collapse so one upsert batch cannot conflict
 * with itself. Invalid rows increment errors and are not returned.
 */
export function buildCodeRows(employees) {
  const rows = [];
  const seen = new Set();
  let errors = 0;
  if (!Array.isArray(employees)) return { rows, errors };
  for (const person of employees) {
    if (!person || typeof person !== "object") {
      errors += 1;
      continue;
    }
    const code = normalizeCode(person.code);
    const booth = boothIdOf(person.boothId);
    if (!code || !booth) {
      errors += 1;
      continue;
    }
    const key = `${code}\0${booth}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ code, booth });
  }
  return { rows, errors };
}

function supabaseOrigin(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return "";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
  if (!parsed.hostname) return "";
  return parsed.origin;
}

function loadEnv() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", {
    info() {},
    error() {},
  });
}

function credentials() {
  const urlRaw = envValue("NEXT_PUBLIC_SUPABASE_URL") || envValue("SUPABASE_URL");
  const key = envValue("SUPABASE_SERVICE_ROLE_KEY");
  if (!urlRaw || !key) {
    fail(
      "Missing Supabase URL or service role key. Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  const url = supabaseOrigin(urlRaw);
  if (!url) {
    fail("Supabase URL is invalid. Set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL to an http(s) URL.");
  }
  return { url, key };
}

function readRoster() {
  let raw;
  try {
    raw = fs.readFileSync(rosterPath(), "utf8");
  } catch {
    fail("Could not read roster file. Expected data/roster.json or ROSTER_PATH.");
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail("Roster file is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray(parsed.employees)) {
    fail("Roster must be an object with an employees array.");
  }
  return parsed.employees;
}

async function upsertCodes(client, rows) {
  let upserted = 0;
  for (let index = 0; index < rows.length; index += BATCH) {
    const batch = rows.slice(index, index + BATCH);
    try {
      const { error } = await client.from("codes").upsert(batch, {
        onConflict: "code,booth",
        ignoreDuplicates: false,
        defaultToNull: false,
      });
      if (error) return { upserted, failed: rows.length - upserted };
      upserted += batch.length;
    } catch {
      return { upserted, failed: rows.length - upserted };
    }
  }
  return { upserted, failed: 0 };
}

export async function syncCodes(options = {}) {
  const employees = options.employees ?? readRoster();
  const read = employees.length;
  const built = buildCodeRows(employees);
  const client =
    options.client ??
    createClient(options.url, options.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      db: { schema: "public" },
    });
  const result = built.rows.length === 0 ? { upserted: 0, failed: 0 } : await upsertCodes(client, built.rows);
  const upserted = result.upserted;
  const errors = built.errors + result.failed;
  console.log(`read ${read}, upserted ${upserted}, errors ${errors}`);
  return { read, upserted, errors };
}

async function main() {
  loadEnv();
  const { url, key } = credentials();
  const { errors } = await syncCodes({ url, key });
  if (errors > 0) process.exit(1);
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return pathToFileURL(path.resolve(entry)).href === import.meta.url;
}

if (isDirectRun()) {
  main().catch(() => {
    console.error("codes sync failed");
    process.exit(1);
  });
}

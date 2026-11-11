#!/usr/bin/env node
// Live hybrid E2E. Prints counts, timings, HTTP statuses, and error names only.
// Display ingest admits a code only when it is on the local roster, so this
// process gets a temp E2E roster and its own state file. data/roster.json and
// data/live-state.json are not modified. Sample codes A01–A16 / B01–B16 are
// never written or deleted.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NEXT_BIN = path.join(ROOT, "node_modules/next/dist/bin/next");
const URL_FILE = "/workspace/momo-agent-logs/secrets/supabase_url";
const ANON_FILE = "/workspace/momo-agent-logs/secrets/supabase_anon";
const CHECKIN_PORT = 3012;
const DISPLAY_PORT = 3013;
const CHECKIN_BASE = `http://127.0.0.1:${CHECKIN_PORT}`;
const DISPLAY_BASE = `http://127.0.0.1:${DISPLAY_PORT}`;
const CONCURRENCY = 8;
const CODE_RE = /^[A-Z0-9-]{2,16}$/;
const E2E_CODE = /^E2E-[AB]\d{3}$/;
const CLIENT_RE = /^[A-Za-z0-9-]{8,80}$/;
const JOIN_OK = new Set(["checked-in", "queued", "spotlight"]);
const LATENCY_WAIT_MS = 15_000;
const CATCHUP_WAIT_MS = 30_000;
const HEALTH_WAIT_MS = 60_000;

const summary = {
  seed: null,
  checkin: null,
  duplicates: null,
  latency: null,
  reconnect: null,
  cleanup: null,
  sseErrors: 0,
  problems: [],
  exitCode: 1,
};

let anonMissing = false;
let client = null;
let tempDir = "";
let checkinChild = null;
let displayChild = null;
const livePids = new Set();
let checkinOk = 0;
let checkinFail = 0;
let streams = [];
let sseErrors = 0;
const arrived = new Map();
const waiters = new Map();
const latencies = [];
let latencyMiss = 0;
const checkinHttp = {};
let printed = false;
let cleanupPromise = null;
let finishing = null;

function errorLabel(error) {
  if (error == null) return "Error";
  const name =
    typeof error.name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(error.name) ? error.name : "Error";
  const code = typeof error.code === "string" && /^[A-Za-z0-9_]{1,16}$/.test(error.code) ? error.code : "";
  const status = Number.isInteger(error.status) ? error.status : Number.isInteger(error.statusCode) ? error.statusCode : null;
  const bits = [name];
  if (code) bits.push(code);
  if (status != null) bits.push(`http=${status}`);
  return bits.join(" ");
}

function note(error) {
  summary.problems.push(errorLabel(error));
}

function readTrimmed(file) {
  try {
    if (!fs.existsSync(file)) return "";
    const raw = fs.readFileSync(file, "utf8");
    return typeof raw === "string" ? raw.trim() : "";
  } catch {
    return "";
  }
}

function envTrim(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function originOf(raw) {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    if (!parsed.hostname) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function loadCreds() {
  const urlRaw = envTrim("NEXT_PUBLIC_SUPABASE_URL") || readTrimmed(URL_FILE);
  const serviceKey = envTrim("SUPABASE_SERVICE_ROLE_KEY");
  const anon = envTrim("NEXT_PUBLIC_SUPABASE_ANON_KEY") || readTrimmed(ANON_FILE);
  if (!urlRaw || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const url = originOf(urlRaw);
  if (!url) {
    console.error("Supabase URL is invalid");
    process.exit(1);
  }
  return { url, serviceKey, anon };
}

function dbError(error, name) {
  const err = new Error(name);
  err.name = name;
  if (error && typeof error.code === "string") err.code = error.code;
  if (error && Number.isInteger(error.status)) err.status = error.status;
  return err;
}

function pad(value) {
  return String(value).padStart(3, "0");
}

function buildJobs() {
  const jobs = [];
  for (let index = 1; index <= 150; index += 1) {
    const n = pad(index);
    jobs.push({ booth: "3-5", code: `E2E-A${n}`, clientId: `e2e-a-${n}` });
  }
  for (let index = 1; index <= 50; index += 1) {
    const n = pad(index);
    jobs.push({ booth: "5-10", code: `E2E-B${n}`, clientId: `e2e-b-${n}` });
  }
  let invalid = 0;
  for (const job of jobs) {
    if (!CODE_RE.test(job.code) || !E2E_CODE.test(job.code) || !CLIENT_RE.test(job.clientId)) invalid += 1;
    if (job.booth !== "3-5" && job.booth !== "5-10") invalid += 1;
  }
  if (invalid) {
    const err = new Error("code");
    err.name = "CodeFormat";
    throw err;
  }
  return jobs;
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function tally(map, key) {
  const name = String(key);
  map[name] = (map[name] || 0) + 1;
}

async function mapLimit(items, limit, worker) {
  if (items.length === 0) return;
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => run()));
}

async function countTable(table) {
  const { count, error } = await client.from(table).select("code", { count: "exact", head: true }).like("code", "E2E-%");
  if (error) throw dbError(error, "CountError");
  return count ?? 0;
}

async function deleteTable(table) {
  let deleted = 0;
  let remaining = await countTable(table);
  for (let attempt = 0; attempt < 5 && remaining > 0; attempt += 1) {
    const before = remaining;
    const { error } = await client.from(table).delete({ count: "exact" }).like("code", "E2E-%");
    if (error) throw dbError(error, "DeleteError");
    remaining = await countTable(table);
    deleted += Math.max(0, before - remaining);
    if (remaining >= before) break;
  }
  return { deleted, remaining };
}

function writeDisplayRoster(jobs) {
  const employees = jobs.map((job) => ({
    code: job.code,
    boothId: job.booth,
    name: "E2E",
    department: "E2E",
    years: 1,
    photo: "/portraits/e2e.webp",
  }));
  fs.writeFileSync(path.join(tempDir, "roster.json"), JSON.stringify({ employees }));
}

function childEnv(overrides, remove) {
  const env = { ...process.env, NODE_ENV: "production", ...overrides };
  for (const key of remove) delete env[key];
  return env;
}

function isAlive(pid) {
  if (!pid || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function listDescendants(rootPid) {
  const childrenByParent = new Map();
  let entries = [];
  try {
    entries = fs.readdirSync("/proc");
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    let status = "";
    try {
      status = fs.readFileSync(`/proc/${entry}/status`, "utf8");
    } catch {
      continue;
    }
    const match = status.match(/^PPid:\s+(\d+)/m);
    if (!match) continue;
    const parent = Number(match[1]);
    const pid = Number(entry);
    const list = childrenByParent.get(parent);
    if (list) list.push(pid);
    else childrenByParent.set(parent, [pid]);
  }
  const found = [];
  const walk = (pid) => {
    for (const childPid of childrenByParent.get(pid) ?? []) {
      if (childPid === process.pid) continue;
      found.push(childPid);
      walk(childPid);
    }
  };
  walk(rootPid);
  return found;
}

function signalTree(pid, signal) {
  if (!pid || pid === process.pid) return;
  for (const childPid of listDescendants(pid).reverse()) {
    if (childPid === process.pid) continue;
    try {
      process.kill(childPid, signal);
    } catch {
      /* already gone */
    }
  }
  try {
    process.kill(-pid, signal);
  } catch {
    /* not a group leader */
  }
  try {
    process.kill(pid, signal);
  } catch {
    /* already gone */
  }
}

function onceExit(child) {
  return new Promise((resolve) => {
    if (!child) {
      resolve(true);
      return;
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(true);
      return;
    }
    child.once("exit", () => resolve(true));
  });
}

function startNext(port, env) {
  const child = spawn(process.execPath, [NEXT_BIN, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: ROOT,
    env,
    detached: true,
    stdio: "ignore",
  });
  child.on("error", (error) => {
    child._spawnFailed = errorLabel(error);
  });
  if (child.pid) {
    livePids.add(child.pid);
    child.once("exit", () => {
      livePids.delete(child.pid);
    });
  }
  return child;
}

async function stopChild(child) {
  if (!child || child._stopped) return;
  child._stopped = true;
  const pid = child.pid;
  if (!pid) return;
  signalTree(pid, "SIGTERM");
  const exited = await Promise.race([onceExit(child), delay(2_000).then(() => false)]);
  if (!exited || isAlive(pid) || listDescendants(pid).some((item) => isAlive(item))) {
    signalTree(pid, "SIGKILL");
    await Promise.race([onceExit(child), delay(1_500).then(() => false)]);
  }
  if (isAlive(pid)) {
    const err = new Error("stop");
    err.name = "ServerStop";
    throw err;
  }
}

async function waitForHealth(base) {
  const start = Date.now();
  let lastStatus = 0;
  let lastName = "HealthTimeout";
  while (Date.now() - start < HEALTH_WAIT_MS) {
    try {
      const response = await fetch(`${base}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(4_000) });
      lastStatus = response.status;
      if (response.ok) {
        const body = await response.json();
        if (body?.ok !== true) {
          const err = new Error("health");
          err.name = "HealthNotOk";
          err.status = response.status;
          throw err;
        }
        return { local: body.local === true };
      }
      await response.arrayBuffer().catch(() => undefined);
    } catch (error) {
      if (error?.name === "HealthNotOk") throw error;
      lastName = error?.name === "TimeoutError" || error?.name === "AbortError" ? "HealthTimeout" : errorLabel(error).split(" ")[0];
    }
    await delay(250);
  }
  const err = new Error("health");
  err.name = /^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(lastName) ? lastName : "HealthTimeout";
  if (lastStatus) err.status = lastStatus;
  throw err;
}

function codesInSnapshot(snapshot) {
  const found = [];
  const spot = snapshot?.spotlight?.code;
  if (typeof spot === "string" && E2E_CODE.test(spot)) found.push(spot);
  for (const list of [snapshot?.queueStates, snapshot?.queue]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (item && typeof item.code === "string" && E2E_CODE.test(item.code)) found.push(item.code);
    }
  }
  return found;
}

function markArrived(code, now) {
  if (!E2E_CODE.test(code) || arrived.has(code)) return;
  arrived.set(code, now);
  const waiter = waiters.get(code);
  if (waiter) {
    waiters.delete(code);
    waiter(now);
  }
}

function consumeEvents(buffer) {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    if (!part.includes("event: snapshot")) continue;
    const line = part.split("\n").find((row) => row.startsWith("data: "));
    if (!line) continue;
    try {
      const snapshot = JSON.parse(line.slice(6));
      const now = Date.now();
      for (const code of codesInSnapshot(snapshot)) markArrived(code, now);
    } catch {
      sseErrors += 1;
    }
  }
  return rest;
}

function isAbort(error) {
  return error?.name === "AbortError" || error?.code === "ABORT_ERR";
}

function openEventStream(base, booth) {
  const ac = new AbortController();
  let readySettled = false;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const done = (async () => {
    try {
      const response = await fetch(`${base}/api/booths/${encodeURIComponent(booth)}/events`, {
        method: "GET",
        headers: { Accept: "text/event-stream", "Cache-Control": "no-cache" },
        cache: "no-store",
        signal: ac.signal,
      });
      if (!response.ok || !response.body) {
        try {
          await response.body?.cancel();
        } catch {
          /* ignore */
        }
        const err = new Error("sse");
        err.name = "SSEError";
        err.status = response.status;
        throw err;
      }
      readySettled = true;
      resolveReady();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done: ended } = await reader.read();
        if (ended) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = consumeEvents(buffer);
      }
    } catch (error) {
      if (!readySettled) {
        readySettled = true;
        rejectReady(error);
      }
      if (!ac.signal.aborted && !isAbort(error)) sseErrors += 1;
    }
  })();
  return {
    ready,
    close: async () => {
      ac.abort();
      await Promise.race([done, delay(1_000)]);
    },
  };
}

async function closeStreams() {
  const current = streams;
  streams = [];
  await Promise.all(current.map((stream) => stream.close()));
}

async function openStreams() {
  await closeStreams();
  const next = [openEventStream(DISPLAY_BASE, "3-5"), openEventStream(DISPLAY_BASE, "5-10")];
  streams = next;
  await Promise.all(next.map((stream) => stream.ready));
}

function waitForArrival(code, timeoutMs) {
  const existing = arrived.get(code);
  if (existing != null) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters.delete(code);
      resolve(null);
    }, timeoutMs);
    waiters.set(code, (now) => {
      clearTimeout(timer);
      resolve(now);
    });
  });
}

async function postCheckin(job) {
  const t0 = Date.now();
  try {
    const response = await fetch(`${CHECKIN_BASE}/api/booths/${encodeURIComponent(job.booth)}/checkin`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ code: job.code, clientId: job.clientId, intent: "join" }),
      signal: AbortSignal.timeout(20_000),
    });
    let status = "";
    try {
      const body = await response.json();
      if (typeof body?.status === "string" && /^[a-z-]{1,40}$/.test(body.status)) status = body.status;
    } catch {
      status = "";
    }
    return { t0, http: response.status, status };
  } catch (error) {
    return { t0, http: 0, status: "", name: error?.name === "TimeoutError" ? "TimeoutError" : "NetworkError" };
  }
}

async function runPosts(jobs, measure) {
  let ok = 0;
  let fail = 0;
  await mapLimit(jobs, CONCURRENCY, async (job) => {
    const result = await postCheckin(job);
    tally(checkinHttp, result.http);
    const accepted = result.http === 200 && JOIN_OK.has(result.status);
    if (!accepted) {
      checkinFail += 1;
      fail += 1;
      return;
    }
    checkinOk += 1;
    ok += 1;
    if (!measure) return;
    const t1 = await waitForArrival(job.code, LATENCY_WAIT_MS);
    if (t1 == null) latencyMiss += 1;
    else latencies.push(t1 - result.t0);
  });
  return { ok, fail };
}

async function runDuplicates(jobs) {
  const sample = jobs.slice(0, 10);
  let alreadyCheckedIn = 0;
  let otherOk = 0;
  let fail = 0;
  const http = {};
  await mapLimit(sample, CONCURRENCY, async (job, index) => {
    const clientId = `e2e-dup-${pad(index + 1)}`;
    const result = await postCheckin({ booth: job.booth, code: job.code, clientId });
    tally(http, result.http);
    if (result.http === 200 && result.status === "already-checked-in") alreadyCheckedIn += 1;
    else if (result.http === 200 && JOIN_OK.has(result.status)) otherOk += 1;
    else fail += 1;
  });
  return { sent: sample.length, alreadyCheckedIn, otherOk, fail, http };
}

async function waitMissed(codes) {
  const start = Date.now();
  const deadline = start + CATCHUP_WAIT_MS;
  let seen = 0;
  while (true) {
    seen = codes.filter((code) => arrived.has(code)).length;
    if (seen === codes.length || Date.now() >= deadline) break;
    await delay(50);
  }
  return { seen, waitMs: Date.now() - start };
}

function assertRole(health, expectLocal, name) {
  if (health.local !== expectLocal) {
    const err = new Error("role");
    err.name = name;
    throw err;
  }
}

async function startCheckin(url, serviceKey) {
  const env = childEnv(
    {
      NEXT_PUBLIC_SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: serviceKey,
      RATE_LIMIT_CHECKIN_PER_MIN: "1000",
      BLOB_READ_WRITE_TOKEN: "e2e-unused",
      BLOB_STORE_ID: "e2e-unused",
      PORT: String(CHECKIN_PORT),
      STATE_PATH: path.join(tempDir, "checkin-state.json"),
    },
    ["MOMO_LOCAL", "STAFF_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  );
  checkinChild = startNext(CHECKIN_PORT, env);
  await delay(50);
  if (checkinChild._spawnFailed) {
    const err = new Error("spawn");
    err.name = "SpawnError";
    throw err;
  }
  const health = await waitForHealth(CHECKIN_BASE);
  assertRole(health, false, "CheckinRole");
}

async function startDisplay(url, anon) {
  const env = childEnv(
    {
      MOMO_LOCAL: "1",
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
      STAFF_KEY: "e2e-local-test-key",
      RATE_LIMIT_CHECKIN_PER_MIN: "1000",
      PORT: String(DISPLAY_PORT),
      ROSTER_PATH: path.join(tempDir, "roster.json"),
      STATE_PATH: path.join(tempDir, "display-state.json"),
    },
    ["SUPABASE_SERVICE_ROLE_KEY", "BLOB_READ_WRITE_TOKEN", "BLOB_STORE_ID"],
  );
  displayChild = startNext(DISPLAY_PORT, env);
  await delay(50);
  if (displayChild._spawnFailed) {
    const err = new Error("spawn");
    err.name = "SpawnError";
    throw err;
  }
  const health = await waitForHealth(DISPLAY_BASE);
  assertRole(health, true, "DisplayRole");
}

async function stopDisplay() {
  await closeStreams();
  const child = displayChild;
  displayChild = null;
  await stopChild(child);
}

async function doCleanup() {
  try {
    await closeStreams();
  } catch (error) {
    note(error);
  }
  try {
    const child = displayChild;
    displayChild = null;
    await stopChild(child);
  } catch (error) {
    note(error);
  }
  try {
    const child = checkinChild;
    checkinChild = null;
    await stopChild(child);
  } catch (error) {
    note(error);
  }
  if (client) {
    try {
      const checkins = await deleteTable("checkins");
      const codes = await deleteTable("codes");
      summary.cleanup = { checkinsDeleted: checkins.deleted, codesDeleted: codes.deleted };
      if (checkins.remaining || codes.remaining) {
        const err = new Error("cleanup");
        err.name = "CleanupRemaining";
        note(err);
      }
    } catch (error) {
      note(error);
      if (!summary.cleanup) summary.cleanup = { checkinsDeleted: null, codesDeleted: null };
    }
  } else if (!summary.cleanup) {
    summary.cleanup = { checkinsDeleted: 0, codesDeleted: 0 };
  }
  if (tempDir) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      summary.problems.push("TempCleanup");
    }
  }
}

function cleanup() {
  if (!cleanupPromise) cleanupPromise = doCleanup();
  return cleanupPromise;
}

function printSummary() {
  if (printed) return;
  printed = true;
  summary.sseErrors = sseErrors;
  if (!summary.checkin) summary.checkin = { ok: checkinOk, fail: checkinFail, http: checkinHttp };
  if (!anonMissing && summary.latency == null && (latencies.length > 0 || latencyMiss > 0)) {
    summary.latency = {
      count: latencies.length,
      miss: latencyMiss,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies.length ? Math.max(...latencies) : null,
    };
  }
  if (anonMissing) {
    console.log(["SKIPPED", "reason: NEXT_PUBLIC_SUPABASE_ANON_KEY unavailable", "skipped: latency, reconnect"].join("\n"));
  }
  console.log(JSON.stringify(summary, null, 2));
}

function finish(code) {
  if (!finishing) {
    finishing = (async () => {
      await cleanup();
      let exitCode = code;
      if (summary.problems.length && (exitCode === 0 || exitCode === 2)) exitCode = 1;
      summary.exitCode = exitCode;
      printSummary();
      process.exit(exitCode);
    })();
  }
  return finishing;
}

process.on("exit", () => {
  for (const pid of livePids) signalTree(pid, "SIGKILL");
});
process.on("SIGINT", () => {
  void finish(130);
});
process.on("SIGTERM", () => {
  void finish(143);
});
process.on("unhandledRejection", (error) => {
  note(error);
  void finish(1);
});

async function main() {
  if (!fs.existsSync(path.join(ROOT, ".next"))) {
    console.error("Missing .next build");
    process.exit(1);
  }
  if (!fs.existsSync(NEXT_BIN)) {
    console.error("Missing next binary");
    process.exit(1);
  }

  const creds = loadCreds();
  anonMissing = !creds.anon;
  if (anonMissing) {
    summary.latency = "SKIPPED";
    summary.reconnect = "SKIPPED";
  }

  let exitCode = 1;
  try {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "momo-e2e-hybrid-"));
    client = createClient(creds.url, creds.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      db: { schema: "public" },
    });

    const jobs = buildJobs();
    const clearedCheckins = await deleteTable("checkins");
    const clearedCodes = await deleteTable("codes");
    if (clearedCheckins.remaining || clearedCodes.remaining) {
      const err = new Error("preclean");
      err.name = "PreCleanRemaining";
      throw err;
    }

    const rows = jobs.map((job) => ({ code: job.code, booth: job.booth }));
    const { error: seedError } = await client.from("codes").upsert(rows, {
      onConflict: "code,booth",
      ignoreDuplicates: false,
      defaultToNull: false,
    });
    if (seedError) throw dbError(seedError, "SeedError");
    const counted = await countTable("codes");
    summary.seed = { upserted: rows.length, counted, booth35: 150, booth510: 50 };
    if (counted !== rows.length) {
      const err = new Error("seed");
      err.name = "SeedCount";
      throw err;
    }

    await startCheckin(creds.url, creds.serviceKey);

    const phase1 = jobs.slice(0, 50);
    const phaseDown = jobs.slice(50, 100);
    const phaseRest = jobs.slice(100);
    let ok = 0;
    let fail = 0;

    if (anonMissing) {
      const all = await runPosts(jobs, false);
      ok += all.ok;
      fail += all.fail;
    } else {
      writeDisplayRoster(jobs);
      await startDisplay(creds.url, creds.anon);
      await openStreams();
      const first = await runPosts(phase1, true);
      ok += first.ok;
      fail += first.fail;

      await stopDisplay();
      const down = await runPosts(phaseDown, false);
      ok += down.ok;
      fail += down.fail;

      await startDisplay(creds.url, creds.anon);
      const catchStart = Date.now();
      await openStreams();
      const missedCodes = phaseDown.map((job) => job.code);
      const missed = await waitMissed(missedCodes);
      summary.reconnect = {
        missedExpected: missedCodes.length,
        missedSeen: missed.seen,
        catchUpWaitMs: Date.now() - catchStart,
      };

      const rest = await runPosts(phaseRest, true);
      ok += rest.ok;
      fail += rest.fail;

      summary.latency = {
        count: latencies.length,
        miss: latencyMiss,
        p50: percentile(latencies, 50),
        p95: percentile(latencies, 95),
        max: latencies.length ? Math.max(...latencies) : null,
      };
    }

    summary.checkin = { ok, fail, http: checkinHttp };
    const rowsBefore = await countTable("checkins");
    const duplicates = await runDuplicates(jobs);
    const rowsAfter = await countTable("checkins");
    summary.duplicates = { ...duplicates, rowsBefore, rowsAfter };

    const checkinPass = ok === jobs.length && fail === 0 && rowsAfter === jobs.length && rowsBefore === jobs.length;
    const dupPass = duplicates.fail === 0 && duplicates.alreadyCheckedIn + duplicates.otherOk === duplicates.sent && rowsAfter === rowsBefore;
    if (anonMissing) {
      exitCode = checkinPass && dupPass ? 2 : 1;
    } else {
      const latencyPass = latencyMiss === 0 && latencies.length === phase1.length + phaseRest.length;
      const reconnectPass =
        summary.reconnect &&
        summary.reconnect.missedSeen === summary.reconnect.missedExpected &&
        summary.reconnect.missedExpected === phaseDown.length;
      exitCode = checkinPass && dupPass && latencyPass && reconnectPass && sseErrors === 0 ? 0 : 1;
    }
  } catch (error) {
    note(error);
    exitCode = 1;
  } finally {
    try {
      await cleanup();
    } catch (error) {
      note(error);
    }
    if (summary.problems.length && (exitCode === 0 || exitCode === 2)) exitCode = 1;
    summary.exitCode = exitCode;
    printSummary();
  }
  process.exit(exitCode);
}

main().catch((error) => {
  note(error);
  return finish(1);
});

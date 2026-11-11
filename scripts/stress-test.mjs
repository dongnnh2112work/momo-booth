#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const ROOT = process.cwd();
const PORT = Number(process.env.STRESS_PORT || 3011);
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const STAFF_KEY = process.env.STRESS_STAFF_KEY || "stress-local-key";
const CONCURRENCY = Number(process.env.STRESS_CONCURRENCY || 40);
const SSE_CLIENTS = Number(process.env.STRESS_SSE_CLIENTS || 12);
const START_SERVER = process.env.STRESS_EXTERNAL !== "1";
const ROSTER_PATH = path.join(ROOT, "data/stress-roster.json");
const STATE_PATH = path.join(ROOT, "data/stress-state.json");

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function rssOf(pid) {
  try {
    const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
    const line = status.split("\n").find((row) => row.startsWith("VmRSS:"));
    return line ? line.replace(/\s+/g, " ").trim() : null;
  } catch {
    return null;
  }
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
  const descendants = listDescendants(pid).filter((childPid) => childPid !== process.pid);
  for (const childPid of descendants.reverse()) {
    try {
      process.kill(childPid, signal);
    } catch {
      /* already gone */
    }
  }
  try {
    // Spawned detached, so pid leads its own process group.
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

function onceExit(childProc) {
  return new Promise((resolve) => {
    if (!childProc) {
      resolve(true);
      return;
    }
    const onExit = () => resolve(true);
    childProc.once("exit", onExit);
    if (childProc.exitCode !== null || childProc.signalCode !== null) {
      childProc.removeListener("exit", onExit);
      resolve(true);
    }
  });
}

function watchedPids(childProc) {
  if (!childProc?.pid) return [];
  return childProc._watchPids ?? [childProc.pid];
}

function anyAlive(pids) {
  return pids.some((pid) => isAlive(pid));
}

function destroyQuiet(stream) {
  if (!stream) return;
  try {
    stream.socket?.destroy();
  } catch {
    /* already closed */
  }
  try {
    if (typeof stream.destroy === "function") stream.destroy();
  } catch {
    /* already closed */
  }
}

async function stopServer(childProc) {
  if (!childProc || childProc._stopped) return;
  childProc._stopped = true;
  const pid = childProc.pid;
  childProc._watchPids = pid ? [pid, ...listDescendants(pid)] : [];
  signalTree(pid, "SIGTERM");
  const exited = await Promise.race([onceExit(childProc), delay(2_000).then(() => false)]);
  if (!exited || anyAlive(watchedPids(childProc))) {
    for (const survivor of watchedPids(childProc)) {
      if (survivor === process.pid) continue;
      try {
        process.kill(survivor, "SIGKILL");
      } catch {
        /* already gone */
      }
    }
    signalTree(pid, "SIGKILL");
  }
  childProc.stdout?.destroy();
  childProc.stderr?.destroy();
  childProc.stdin?.destroy();
  childProc.unref();
}

function writeRoster() {
  const employees = [];
  for (let index = 1; index <= 150; index += 1) {
    const code = `C${String(index).padStart(3, "0")}`;
    employees.push({
      code,
      boothId: "3-5",
      name: `Guest ${code}`,
      department: "Stress",
      years: 4,
      photo: `/portraits/hero/${code}.webp`,
      thumb: `/portraits/thumbs/${code}.webp`,
    });
  }
  for (let index = 1; index <= 50; index += 1) {
    const code = `D${String(index).padStart(3, "0")}`;
    employees.push({
      code,
      boothId: "5-10",
      name: `Guest ${code}`,
      department: "Stress",
      years: 8,
      photo: `/portraits/hero/${code}.webp`,
      thumb: `/portraits/thumbs/${code}.webp`,
    });
  }
  fs.mkdirSync(path.dirname(ROSTER_PATH), { recursive: true });
  fs.writeFileSync(ROSTER_PATH, JSON.stringify({ employees }, null, 2));
  for (const leftover of [STATE_PATH, `${STATE_PATH}.tmp`]) {
    if (fs.existsSync(leftover)) fs.unlinkSync(leftover);
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function waitForHealth(timeoutMs = 30_000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${BASE}/api/health`, { cache: "no-store" });
      if (response.ok) return response.json();
      last = response.status;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  throw new Error(`Server did not become ready: ${last}`);
}

function startServer() {
  const env = {
    ...process.env,
    MOMO_LOCAL: "1",
    STAFF_KEY,
    ROSTER_PATH,
    STATE_PATH,
    PORT: String(PORT),
  };
  delete env.BLOB_STORE_ID;
  delete env.BLOB_READ_WRITE_TOKEN;
  const child = spawn("npx", ["next", "start", "--hostname", "127.0.0.1", "--port", String(PORT)], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    // New session so SIGTERM/SIGKILL can hit npx and the Next.js child together.
    detached: true,
  });
  const logs = [];
  const collect = (chunk) => {
    const text = chunk.toString();
    logs.push(text);
    if (process.env.STRESS_VERBOSE === "1") process.stderr.write(text);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.logs = logs;
  return child;
}

function openSse(boothId) {
  const record = { boothId, snapshots: 0, errors: 0, lastRevision: null, ready: false };
  const ac = new AbortController();
  let req = null;
  let res = null;
  let agent = null;
  let aborted = false;
  let settled = false;

  const done = new Promise((resolve) => {
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    let url;
    try {
      url = new URL(`${BASE}/api/booths/${encodeURIComponent(boothId)}/events`);
    } catch {
      record.errors += 1;
      finish();
      return;
    }

    const transport = url.protocol === "https:" ? https : http;
    agent = new transport.Agent({ keepAlive: false, maxSockets: 1 });
    req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        agent,
        headers: {
          Accept: "text/event-stream",
          Connection: "close",
        },
        signal: ac.signal,
      },
      (response) => {
        res = response;
        if (response.statusCode !== 200) {
          record.errors += 1;
          response.resume();
          destroyQuiet(response);
          finish();
          return;
        }
        record.ready = true;
        response.setEncoding("utf8");
        let buffer = "";
        response.on("data", (chunk) => {
          buffer += chunk;
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            if (!part.includes("event: snapshot")) continue;
            const line = part.split("\n").find((row) => row.startsWith("data: "));
            if (!line) continue;
            try {
              const snap = JSON.parse(line.slice(6));
              record.snapshots += 1;
              record.lastRevision = snap.revision ?? record.lastRevision;
            } catch {
              record.errors += 1;
            }
          }
        });
        response.on("end", finish);
        response.on("aborted", finish);
        response.on("error", () => {
          if (!aborted && !ac.signal.aborted) record.errors += 1;
          finish();
        });
      },
    );
    req.on("error", (error) => {
      const closed = aborted || ac.signal.aborted || error?.name === "AbortError" || error?.code === "ECONNRESET" || error?.code === "EPIPE";
      if (!closed) record.errors += 1;
      finish();
    });
    req.on("close", finish);
    req.end();
  });

  let closing = null;
  return {
    record,
    close() {
      if (closing) return closing;
      aborted = true;
      ac.abort();
      destroyQuiet(res);
      destroyQuiet(req);
      try {
        agent?.destroy();
      } catch {
        /* already closed */
      }
      closing = Promise.race([done, delay(1_000)]);
      return closing;
    },
  };
}

async function checkin(boothId, code, clientId) {
  const started = Date.now();
  try {
    const response = await fetch(`${BASE}/api/booths/${boothId}/checkin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, clientId, intent: "join" }),
    });
    const body = await response.json().catch(() => ({}));
    return {
      ok: response.ok && (body.status === "spotlight" || body.status === "queued"),
      status: body.status ?? String(response.status),
      ms: Date.now() - started,
      boothId,
      code,
      http: response.status,
    };
  } catch (error) {
    return { ok: false, status: "network", ms: Date.now() - started, boothId, code, error: String(error) };
  }
}

async function staffSkip(boothId) {
  const started = Date.now();
  try {
    const response = await fetch(`${BASE}/api/staff/skip`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-staff-key": STAFF_KEY },
      body: JSON.stringify({ boothId }),
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok && body.ok !== false, ms: Date.now() - started, http: response.status, boothId, message: body.message };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, boothId, error: String(error) };
  }
}

async function boothView(boothId) {
  const response = await fetch(`${BASE}/api/booths/${boothId}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`GET ${boothId} ${response.status}`);
  return response.json();
}

function codesOf(payload) {
  const snapshot = payload.snapshot;
  const codes = [];
  if (snapshot.spotlight?.code) codes.push(snapshot.spotlight.code);
  for (const item of snapshot.queueStates ?? snapshot.queue ?? []) codes.push(item.code);
  const unique = new Set(codes);
  return { codes, unique: unique.size, duplicates: codes.length - unique.size, length: snapshot.queueLength ?? snapshot.queue?.length ?? 0 };
}

async function main() {
  const wallStart = Date.now();
  if (!fs.existsSync(path.join(ROOT, ".next"))) {
    console.error("Missing .next build. Run npm run build first.");
    process.exit(2);
  }
  writeRoster();

  let child;
  if (START_SERVER) {
    child = startServer();
    child.on("exit", (code, signal) => {
      if (!child._stopped) console.error(`Server exited early code=${code} signal=${signal}\n${child.logs.slice(-20).join("")}`);
    });
  }

  const stop = async () => {
    await stopServer(child);
  };

  process.on("SIGINT", () => {
    void Promise.race([stop(), delay(3_000)]).finally(() => process.exit(130));
  });

  try {
    const healthBefore = await waitForHealth();
    const rssBefore = child?.pid ? rssOf(child.pid) : null;

    const sse = [];
    const boothCycle = ["3-5", "3-5", "3-5", "5-10", "5-10", "5-10"];
    for (let index = 0; index < SSE_CLIENTS; index += 1) {
      sse.push(openSse(boothCycle[index % boothCycle.length]));
    }
    await delay(500);
    const sseReady = sse.filter((client) => client.record.ready).length;

    const jobs = [
      ...Array.from({ length: 150 }, (_, index) => ({
        boothId: "3-5",
        code: `C${String(index + 1).padStart(3, "0")}`,
        clientId: `client-c-${String(index + 1).padStart(4, "0")}`,
      })),
      ...Array.from({ length: 50 }, (_, index) => ({
        boothId: "5-10",
        code: `D${String(index + 1).padStart(3, "0")}`,
        clientId: `client-d-${String(index + 1).padStart(4, "0")}`,
      })),
    ];

    const burstStart = Date.now();
    const results = await mapLimit(jobs, CONCURRENCY, (job) => checkin(job.boothId, job.code, job.clientId));
    const burstMs = Date.now() - burstStart;

    const latencies = results.map((row) => row.ms);
    const errors = results.filter((row) => !row.ok);
    const okA = results.filter((row) => row.boothId === "3-5" && row.ok).length;
    const okB = results.filter((row) => row.boothId === "5-10" && row.ok).length;

    const afterBurst = {
      "3-5": codesOf(await boothView("3-5")),
      "5-10": codesOf(await boothView("5-10")),
    };

    const skipTargets = ["3-5", "5-10", "3-5", "5-10", "3-5", "3-5"];
    const skips = await Promise.all(skipTargets.map((boothId) => staffSkip(boothId)));

    const afterSkip = {
      "3-5": codesOf(await boothView("3-5")),
      "5-10": codesOf(await boothView("5-10")),
    };

    const healthAfter = await fetch(`${BASE}/api/health`).then((res) => res.json());
    const rssAfter = child?.pid ? rssOf(child.pid) : null;

    await Promise.all(sse.map((client) => client.close()));

    const expectedAfterSkipA = afterBurst["3-5"].unique - skips.filter((row) => row.boothId === "3-5" && row.ok).length;
    const expectedAfterSkipB = afterBurst["5-10"].unique - skips.filter((row) => row.boothId === "5-10" && row.ok).length;

    const report = {
      host: "linux-box",
      note: "Measured on this Linux box, not the event Mac mini. totalRuntimeMs is wall time before server teardown.",
      base: BASE,
      wallMs: Date.now() - wallStart,
      totalRuntimeMs: Date.now() - wallStart,
      burstMs,
      concurrency: CONCURRENCY,
      checkins: {
        total: results.length,
        ok: results.filter((row) => row.ok).length,
        failed: errors.length,
        okBooth35: okA,
        okBooth510: okB,
        p50ms: percentile(latencies, 50),
        p95ms: percentile(latencies, 95),
        maxMs: Math.max(...latencies),
        errorSamples: errors.slice(0, 8),
      },
      sse: {
        requested: SSE_CLIENTS,
        ready: sseReady,
        errors: sse.reduce((sum, client) => sum + client.record.errors, 0),
        snapshots: sse.reduce((sum, client) => sum + client.record.snapshots, 0),
      },
      staffSkips: {
        total: skips.length,
        ok: skips.filter((row) => row.ok).length,
        failed: skips.filter((row) => !row.ok).length,
        results: skips,
      },
      consistency: {
        afterBurst: afterBurst,
        afterSkip: afterSkip,
        burstExpected: { "3-5": 150, "5-10": 50 },
        burstPass: afterBurst["3-5"].unique === 150 && afterBurst["3-5"].duplicates === 0 && afterBurst["5-10"].unique === 50 && afterBurst["5-10"].duplicates === 0 && okA === 150 && okB === 50,
        skipPass: afterSkip["3-5"].unique === expectedAfterSkipA && afterSkip["5-10"].unique === expectedAfterSkipB && afterSkip["3-5"].duplicates === 0 && afterSkip["5-10"].duplicates === 0,
      },
      memory: {
        rssBefore,
        rssAfter,
        healthBefore: healthBefore.memory,
        healthAfter: healthAfter.memory,
      },
    };

    console.log(JSON.stringify(report, null, 2));
    if (!report.consistency.burstPass || !report.consistency.skipPass || errors.length) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error);
    process.exitCode ??= 1;
  } finally {
    await Promise.race([stop(), delay(3_000)]);
    process.exit(process.exitCode ?? 0);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CheckinRealtimeHandlers, CheckinRealtimeRow } from "./checkinRealtime";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = path.join(projectRoot, "src");
const serverOnlyEmpty = path.join(projectRoot, "node_modules/next/dist/compiled/server-only/empty.js");

type ResolveFilename = (this: unknown, request: string, ...args: unknown[]) => string;

const nodeModule = Module as unknown as { _resolveFilename: ResolveFilename };
const originalResolve = nodeModule._resolveFilename;
nodeModule._resolveFilename = function (this: unknown, request: string, ...args: unknown[]) {
  if (request === "server-only") return serverOnlyEmpty;
  return originalResolve.call(this, request, ...args);
};

function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

function row(id: string, booth = "5-10"): CheckinRealtimeRow {
  return {
    id,
    code: "A01",
    booth,
    client_id: "client-12345678",
    created_at: "2026-11-11T00:00:01.000Z",
  };
}

const envKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_RUNTIME",
  "NEXT_PHASE",
  "MOMO_LOCAL",
  "BLOB_STORE_ID",
  "BLOB_READ_WRITE_TOKEN",
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of envKeys) saved[key] = process.env[key];
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>) {
  for (const key of envKeys) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function clearGateEnv() {
  for (const key of envKeys) delete process.env[key];
}

async function main() {
  assert.equal(fs.existsSync(path.join(sourceRoot, "app/api/booths/[id]/ingest/route.ts")), false);
  assert.equal(fs.existsSync(path.join(sourceRoot, "components/useCheckinRealtime.ts")), false);

  for (const file of filesUnder(path.join(sourceRoot, "app"))) {
    const source = fs.readFileSync(file, "utf8");
    assert.equal(source.includes("ingestDisplayedCheckins"), false, file);
    assert.equal(source.includes("/ingest"), false, file);
  }

  for (const file of filesUnder(path.join(sourceRoot, "components"))) {
    const source = fs.readFileSync(file, "utf8");
    assert.equal(source.includes("/ingest"), false, file);
    assert.equal(source.includes("useCheckinRealtime"), false, file);
    assert.equal(source.includes("SUPABASE_SERVICE_ROLE_KEY"), false, file);
    assert.equal(source.includes("serviceRoleClient"), false, file);
  }

  const holders: string[] = [];
  for (const file of filesUnder(sourceRoot)) {
    if (!/\.(ts|tsx)$/.test(file) || file.endsWith(".test.ts")) continue;
    const source = fs.readFileSync(file, "utf8");
    if (source.includes("ingestDisplayedCheckins")) holders.push(path.relative(sourceRoot, file));
  }
  holders.sort();
  assert.deepEqual(holders, ["lib/displayIngest.ts", "lib/store.ts"]);

  for (const relative of ["lib/checkinRealtime.ts", "lib/displayIngest.ts", "components/DisplayStage.tsx"]) {
    const source = fs.readFileSync(path.join(sourceRoot, relative), "utf8");
    assert.equal(source.includes("SUPABASE_SERVICE_ROLE_KEY"), false, relative);
    assert.equal(source.includes("serviceRoleClient"), false, relative);
  }

  const displaySource = fs.readFileSync(path.join(sourceRoot, "lib/displayIngest.ts"), "utf8");
  assert.equal(displaySource.includes("subscribeCheckins"), true);
  assert.equal(displaySource.includes("ingestDisplayedCheckins"), true);
  assert.equal(displaySource.includes("/api/booths/"), false);

  const instrumentation = fs.readFileSync(path.join(sourceRoot, "instrumentation.ts"), "utf8");
  assert.equal(instrumentation.includes("assertLocalStaffKey"), true);
  assert.equal(instrumentation.includes("startDisplayIngest"), true);
  assert.equal(instrumentation.includes("SUPABASE_SERVICE_ROLE_KEY"), false);

  const saved = snapshotEnv();
  try {
    const {
      applyDisplayedRow,
      displayIngestRunning,
      displayIngestShouldStart,
      startDisplayIngest,
      toDisplayedCheckin,
    } = await import("./displayIngest");

    clearGateEnv();
    assert.equal(displayIngestShouldStart(), false);
    let blocked = 0;
    await startDisplayIngest({
      boothIds: ["5-10"],
      subscribe() {
        blocked += 1;
        return () => {};
      },
      ingest: async () => {
        blocked += 1;
      },
    });
    assert.equal(blocked, 0);
    assert.equal(displayIngestRunning(), false);

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
    process.env.MOMO_LOCAL = "1";
    process.env.NEXT_PHASE = "phase-production-build";
    assert.equal(displayIngestShouldStart(), false);
    await startDisplayIngest({
      subscribe() {
        blocked += 1;
        return () => {};
      },
    });
    assert.equal(blocked, 0);

    delete process.env.NEXT_PHASE;
    process.env.NEXT_RUNTIME = "edge";
    assert.equal(displayIngestShouldStart(), false);
    await startDisplayIngest({
      subscribe() {
        blocked += 1;
        return () => {};
      },
    });
    assert.equal(blocked, 0);

    delete process.env.NEXT_RUNTIME;
    delete process.env.MOMO_LOCAL;
    process.env.BLOB_STORE_ID = "store";
    process.env.BLOB_READ_WRITE_TOKEN = "token";
    assert.equal(displayIngestShouldStart(), false);
    await startDisplayIngest({
      subscribe() {
        blocked += 1;
        return () => {};
      },
    });
    assert.equal(blocked, 0);
    assert.equal(displayIngestRunning(), false);

    delete process.env.BLOB_STORE_ID;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.MOMO_LOCAL = "1";
    assert.equal(displayIngestShouldStart(), true);

    const seen: { boothId: string; rows: { code: string; clientId: string; at: number }[] }[] = [];
    let handlers: CheckinRealtimeHandlers | null = null;
    const listened: string[] = [];
    await startDisplayIngest({
      boothIds: ["5-10", "3-5"],
      subscribe(booth, next) {
        listened.push(booth);
        if (booth === "5-10") handlers = next;
        return () => {};
      },
      async ingest(boothId, rows) {
        seen.push({ boothId, rows });
      },
    });
    assert.deepEqual(listened, ["5-10", "3-5"]);
    assert.equal(displayIngestRunning(), true);
    const active = handlers;
    if (!active) throw new Error("display ingest did not subscribe");

    const accepted = row("11111111-1111-4111-8111-111111111111");
    assert.deepEqual(toDisplayedCheckin("5-10", accepted), {
      code: "A01",
      clientId: "client-12345678",
      at: Date.parse(accepted.created_at),
    });
    await active.onInsert(accepted);
    assert.deepEqual(seen, [
      {
        boothId: "5-10",
        rows: [{ code: "A01", clientId: "client-12345678", at: Date.parse(accepted.created_at) }],
      },
    ]);

    await active.onInsert(row("22222222-2222-4222-8222-222222222222", "3-5"));
    await active.onInsert({ ...accepted, id: "short", client_id: "bad", code: " " });
    assert.equal(seen.length, 1);

    let again = 0;
    await startDisplayIngest({
      boothIds: ["5-10"],
      subscribe() {
        again += 1;
        return () => {};
      },
    });
    assert.equal(again, 0);

    const originalError = console.error;
    console.error = () => {};
    try {
      await assert.rejects(() => applyDisplayedRow("5-10", accepted, async () => {
        throw new Error("busy");
      }));
    } finally {
      console.error = originalError;
    }
  } finally {
    restoreEnv(saved);
  }

  console.log("display ingest checks passed");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "display ingest test failed";
  console.error(message);
  process.exit(1);
});

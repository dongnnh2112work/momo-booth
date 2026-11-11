import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BoothId } from "./booths-shared";
import type { LiveState } from "./types";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverOnlyEmpty = path.join(projectRoot, "node_modules/next/dist/compiled/server-only/empty.js");

type ResolveFilename = (this: unknown, request: string, ...args: unknown[]) => string;

const nodeModule = Module as unknown as { _resolveFilename: ResolveFilename };
const originalResolve = nodeModule._resolveFilename;
nodeModule._resolveFilename = function (this: unknown, request: string, ...args: unknown[]) {
  if (request === "server-only") return serverOnlyEmpty;
  return originalResolve.call(this, request, ...args);
};

const KEY = "temp-manual-route-key";
const WRONG_KEY = "wrong-manual-route-key";

function person(code: string, boothId: BoothId) {
  return {
    code,
    boothId,
    name: "N",
    department: "D",
    years: 3,
    photo: "/portraits/n.jpg",
  };
}

function manualRequest(body: unknown, key?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": "203.0.113.77",
  };
  if (key !== undefined) headers["x-staff-key"] = key;
  return new Request("http://127.0.0.1/api/staff/manual-checkin", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function placed(live: LiveState, boothId: BoothId): string[] {
  const booth = live.booths[boothId];
  const codes: string[] = [];
  if (booth.spotlight) codes.push(booth.spotlight.code);
  for (const item of booth.queue) codes.push(item.code);
  return codes;
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "momo-manual-"));
  const statePath = path.join(directory, "live-state.json");
  const rosterPath = path.join(directory, "roster.json");
  const previous = {
    STAFF_KEY: process.env.STAFF_KEY,
    MOMO_LOCAL: process.env.MOMO_LOCAL,
    STATE_PATH: process.env.STATE_PATH,
    ROSTER_PATH: process.env.ROSTER_PATH,
    BLOB_STORE_ID: process.env.BLOB_STORE_ID,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    RATE_LIMIT_STAFF_WRITE_PER_MIN: process.env.RATE_LIMIT_STAFF_WRITE_PER_MIN,
  };
  const restore = (name: keyof typeof previous) => {
    const value = previous[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  try {
    fs.writeFileSync(
      rosterPath,
      JSON.stringify({
        employees: [person("M35A", "3-5"), person("M35B", "3-5"), person("M510", "5-10"), person("M511", "5-10")],
      }),
    );
    process.env.MOMO_LOCAL = "1";
    process.env.STAFF_KEY = KEY;
    process.env.STATE_PATH = statePath;
    process.env.ROSTER_PATH = rosterPath;
    delete process.env.BLOB_STORE_ID;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.RATE_LIMIT_STAFF_WRITE_PER_MIN = "1";

    const { POST } = await import("../app/api/staff/manual-checkin/route");
    const { resetRateLimits } = await import("./rateLimit");
    const store = await import("./store");
    resetRateLimits();

    const missing = await POST(manualRequest({ boothId: "3-5", code: "M35A" }));
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { message: "Sai khóa." });

    const limited = await POST(manualRequest({ boothId: "3-5", code: "M35A" }, WRONG_KEY));
    assert.equal(limited.status, 429);

    process.env.RATE_LIMIT_STAFF_WRITE_PER_MIN = "100";
    resetRateLimits();

    const wrong = await POST(manualRequest({ boothId: "3-5", code: "M35A" }, WRONG_KEY));
    assert.equal(wrong.status, 401);
    assert.deepEqual(await wrong.json(), { message: "Sai khóa." });

    let emits = 0;
    let spotlightCode = "";
    const queueCodes: string[] = [];
    const stop = store.subscribe("3-5", (snapshot) => {
      emits += 1;
      spotlightCode = snapshot.spotlight?.code ?? "";
      queueCodes.splice(0, queueCodes.length, ...snapshot.queue.map((item) => item.code));
    });

    const joined = await POST(manualRequest({ boothId: "3-5", code: "m35a" }, KEY));
    assert.equal(joined.status, 200);
    const joinedBody = (await joined.json()) as {
      status?: string;
      code?: string;
      snapshot?: { spotlight?: { code?: string } | null };
    };
    assert.equal(joinedBody.status, "spotlight");
    assert.equal(joinedBody.code, "M35A");
    assert.equal(joinedBody.snapshot?.spotlight?.code, "M35A");
    assert.equal(emits, 1);
    assert.equal(spotlightCode, "M35A");
    let live = await store.readLiveState();
    assert.deepEqual(placed(live, "3-5"), ["M35A"]);
    assert.deepEqual(placed(live, "5-10"), []);

    const again = await POST(manualRequest({ boothId: "3-5", code: "M35A" }, KEY));
    assert.equal(again.status, 200);
    const againBody = (await again.json()) as { status?: string };
    assert.equal(againBody.status, "spotlight");
    assert.equal(emits, 1);
    live = await store.readLiveState();
    assert.deepEqual(placed(live, "3-5"), ["M35A"]);

    const second = await POST(manualRequest({ boothId: "3-5", code: "M35B" }, KEY));
    assert.equal(second.status, 200);
    const secondBody = (await second.json()) as { status?: string; code?: string };
    assert.equal(secondBody.status, "queued");
    assert.equal(secondBody.code, "M35B");
    assert.equal(emits, 2);
    assert.equal(spotlightCode, "M35A");
    assert.deepEqual(queueCodes, ["M35B"]);
    live = await store.readLiveState();
    assert.deepEqual(placed(live, "3-5"), ["M35A", "M35B"]);

    const secondAgain = await POST(manualRequest({ boothId: "3-5", code: "M35B" }, KEY));
    assert.equal(secondAgain.status, 200);
    await secondAgain.json();
    assert.equal(emits, 2);
    live = await store.readLiveState();
    assert.deepEqual(placed(live, "3-5"), ["M35A", "M35B"]);

    const unknown = await POST(manualRequest({ boothId: "3-5", code: "NOPE99" }, KEY));
    assert.equal(unknown.status, 404);
    const unknownBody = (await unknown.json()) as { status?: string; message?: string };
    assert.equal(unknownBody.status, "unknown");
    assert.equal(typeof unknownBody.message, "string");
    assert.ok(unknownBody.message && unknownBody.message.length > 0);
    live = await store.readLiveState();
    assert.deepEqual(placed(live, "3-5"), ["M35A", "M35B"]);
    assert.deepEqual(placed(live, "5-10"), []);

    const wrongBooth = await POST(manualRequest({ boothId: "3-5", code: "M510" }, KEY));
    assert.equal(wrongBooth.status, 409);
    const wrongBody = (await wrongBooth.json()) as { status?: string; message?: string; correctBoothId?: string };
    assert.equal(wrongBody.status, "wrong_booth");
    assert.equal(wrongBody.correctBoothId, "5-10");
    assert.equal(typeof wrongBody.message, "string");
    assert.ok(wrongBody.message && wrongBody.message.length > 0);
    live = await store.readLiveState();
    assert.deepEqual(placed(live, "3-5"), ["M35A", "M35B"]);
    assert.deepEqual(placed(live, "5-10"), []);

    const locked = await POST(manualRequest({ boothId: "5-10", code: "M511" }));
    assert.equal(locked.status, 401);
    live = await store.readLiveState();
    assert.deepEqual(placed(live, "5-10"), []);

    delete process.env.MOMO_LOCAL;
    process.env.BLOB_STORE_ID = "manual-checkin-offline";
    process.env.BLOB_READ_WRITE_TOKEN = "manual-checkin-offline";
    const stillLocked = await POST(manualRequest({ boothId: "5-10", code: "M511" }, WRONG_KEY));
    assert.equal(stillLocked.status, 401);
    const blocked = await POST(manualRequest({ boothId: "5-10", code: "M511" }, KEY));
    assert.equal(blocked.status, 403);
    const blockedBody = (await blocked.json()) as { message?: string };
    assert.equal(blockedBody.message, "Nhập mã tay chỉ dùng trên máy local.");
    const saved = fs.existsSync(statePath) ? fs.readFileSync(statePath, "utf8") : "";
    assert.equal(saved.includes("M511"), false);

    process.env.MOMO_LOCAL = "1";
    delete process.env.BLOB_STORE_ID;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    live = await store.readLiveState();
    assert.deepEqual(placed(live, "3-5"), ["M35A", "M35B"]);
    assert.equal(placed(live, "5-10").includes("M511"), false);
    stop();
  } finally {
    restore("STAFF_KEY");
    restore("MOMO_LOCAL");
    restore("STATE_PATH");
    restore("ROSTER_PATH");
    restore("BLOB_STORE_ID");
    restore("BLOB_READ_WRITE_TOKEN");
    restore("RATE_LIMIT_STAFF_WRITE_PER_MIN");
    fs.rmSync(directory, { recursive: true, force: true });
  }
  console.log("manual checkin checks passed");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "manual checkin test failed";
  console.error(message);
  process.exit(1);
});

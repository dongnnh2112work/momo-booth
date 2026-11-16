import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

async function main() {
  const { commitSharedState } = await import("./liveStateRemote");

function blank(): LiveState {
  return {
    revision: 0,
    booths: {
      "5-10": { spotlight: null, queue: [], cooldowns: {} },
      "3-5": { spotlight: null, queue: [], cooldowns: {} },
    },
  };
}

function clone(state: LiveState): LiveState {
  return JSON.parse(JSON.stringify(state)) as LiveState;
}

const stored: { row: { revision: number; state: LiveState } | null; writes: number } = {
  row: null,
  writes: 0,
};

let conflictOnce = false;

const gateway = {
  async read() {
    return stored.row ? { revision: stored.row.revision, state: clone(stored.row.state) } : null;
  },
  async compareAndSwap(expected: number | null, next: LiveState) {
    stored.writes += 1;
    if (conflictOnce) {
      conflictOnce = false;
      return false;
    }
    if (expected === null) {
      if (stored.row) return false;
      stored.row = { revision: next.revision, state: clone(next) };
      return true;
    }
    if (!stored.row || stored.row.revision !== expected) return false;
    stored.row = { revision: next.revision, state: clone(next) };
    return true;
  },
};

const unchanged = await commitSharedState({
  gateway,
  empty: blank,
  sanitize: (value) => clone(value as LiveState),
  work: (state) => ({ changed: false, emit: [], build: () => state.revision }),
});
assert.equal(unchanged.result, 0);
assert.equal(stored.writes, 0);

const first = await commitSharedState({
  gateway,
  empty: blank,
  sanitize: (value) => clone(value as LiveState),
  work: (state) => {
    state.booths["5-10"].queue.push({
      code: "A01",
      ticket: "t1",
      clientId: "client-12345678",
      enqueuedAt: 1,
    });
    return { changed: true, emit: ["5-10"], build: () => state.booths["5-10"].queue.length };
  },
});
assert.equal(first.result, 1);
assert.equal(first.attempts, 1);
assert.equal(stored.row?.revision, 1);
assert.equal(stored.writes, 1);

conflictOnce = true;
const second = await commitSharedState({
  gateway,
  empty: blank,
  sanitize: (value) => clone(value as LiveState),
  work: (state) => {
    state.booths["3-5"].queue.push({
      code: "B01",
      ticket: "t2",
      clientId: "client-22345678",
      enqueuedAt: 2,
    });
    return { changed: true, emit: ["3-5"], build: () => state.revision };
  },
});
assert.equal(second.attempts, 2);
assert.equal(stored.row?.revision, 2);
assert.equal(stored.row?.state.booths["5-10"].queue.length, 1);
assert.equal(stored.row?.state.booths["3-5"].queue.length, 1);
assert.equal(stored.writes, 3);

  const { supabaseLiveStateGateway } = await import("./liveStateRemote");
  const bigintClient = {
    from(table: string) {
      assert.equal(table, "live_state");
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: { revision: "4", state: { revision: 4 } }, error: null }),
              };
            },
          };
        },
      };
    },
  };
  const parsed = await supabaseLiveStateGateway(bigintClient as never).read();
  assert.equal(parsed?.revision, 4);
  console.log("liveStateRemote.test ok");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "live state test failed";
  console.error(message);
  process.exit(1);
});

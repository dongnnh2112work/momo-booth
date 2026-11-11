import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import Module from "node:module";
import os from "node:os";
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

function booth(cooldowns: Record<string, number> = {}) {
  return { spotlight: null, queue: [], cooldowns };
}

function state(revision: number, cooldown: number): LiveState {
  return {
    revision,
    booths: {
      "5-10": booth({ A01: cooldown }),
      "3-5": booth(),
    },
  };
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "momo-store-"));
  const statePath = path.join(directory, "live-state.json");
  const rosterPath = path.join(directory, "roster.json");
  try {
    fs.writeFileSync(
      rosterPath,
      JSON.stringify({
        employees: [
          {
            code: "A01",
            boothId: "5-10",
            name: "Test Person",
            department: "QA",
            years: 1,
            photo: "/portraits/a01.jpg",
          },
        ],
      }),
    );
    process.env.MOMO_LOCAL = "1";
    process.env.STATE_PATH = statePath;
    process.env.ROSTER_PATH = rosterPath;
    process.env.STAFF_KEY = `test-only-${randomUUID()}`;

    const store = (await import("./store")) as {
      loadState: () => LiveState;
      saveState: (value: LiveState) => void;
    };

    const first = state(1, 111);
    const second = state(2, 222);
    store.saveState(first);
    assert.equal(fs.readFileSync(`${statePath}.bak-1`, "utf8"), JSON.stringify(first));

    store.saveState(second);
    assert.equal(fs.readFileSync(statePath, "utf8"), JSON.stringify(second));
    assert.equal(fs.readFileSync(`${statePath}.bak-1`, "utf8"), JSON.stringify(second));
    assert.equal(fs.readFileSync(`${statePath}.bak-2`, "utf8"), JSON.stringify(first));
    assert.equal(store.loadState().revision, 2);

    fs.writeFileSync(statePath, "{");
    const logged: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      logged.push(args.map((arg) => (typeof arg === "string" ? arg : "")).join(" "));
    };
    try {
      const recovered = store.loadState();
      assert.equal(recovered.revision, 2);
      assert.equal(recovered.booths["5-10"].cooldowns.A01, 222);
      assert.ok(logged.some((line) => line.includes("live-state.json.bak-1")));
    } finally {
      console.error = originalError;
    }

    fs.writeFileSync(statePath, "{");
    for (let index = 1; index <= 12; index += 1) {
      fs.rmSync(`${statePath}.bak-${index}`, { force: true });
    }
    assert.throws(
      () => store.loadState(),
      (error: unknown) => error instanceof Error,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "store persist test failed";
  console.error(message);
  process.exit(1);
});

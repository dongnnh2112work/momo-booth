import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverOnlyEmpty = path.join(projectRoot, "node_modules/next/dist/compiled/server-only/empty.js");

type ResolveFilename = (this: unknown, request: string, ...args: unknown[]) => string;

const nodeModule = Module as unknown as { _resolveFilename: ResolveFilename };
const originalResolve = nodeModule._resolveFilename;
nodeModule._resolveFilename = function (this: unknown, request: string, ...args: unknown[]) {
  if (request === "server-only") return serverOnlyEmpty;
  return originalResolve.call(this, request, ...args);
};

const TEMP_KEY = "temp-unit-staff-key";

async function main() {
  const { staffAuthorized } = await import("./auth");
  const previous = process.env.STAFF_KEY;
  try {
    process.env.STAFF_KEY = TEMP_KEY;
    assert.equal(staffAuthorized(TEMP_KEY), true);
    assert.equal(staffAuthorized("wrong-unit-staff-key"), false);
    assert.equal(staffAuthorized("no"), false);
    assert.equal(staffAuthorized(`${TEMP_KEY}-extra-length`), false);
    assert.equal(staffAuthorized(null), false);
    assert.equal(staffAuthorized(""), false);

    delete process.env.STAFF_KEY;
    assert.equal(staffAuthorized(TEMP_KEY), false);
    assert.equal(staffAuthorized(null), false);
    assert.equal(staffAuthorized("no"), false);

    process.env.STAFF_KEY = "";
    assert.equal(staffAuthorized(TEMP_KEY), false);
    assert.equal(staffAuthorized(""), false);

    process.env.STAFF_KEY = "   ";
    assert.equal(staffAuthorized("   "), false);
    assert.equal(staffAuthorized(TEMP_KEY), false);
  } finally {
    if (previous === undefined) delete process.env.STAFF_KEY;
    else process.env.STAFF_KEY = previous;
  }
  console.log("auth checks passed");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "auth test failed";
  console.error(message);
  process.exit(1);
});

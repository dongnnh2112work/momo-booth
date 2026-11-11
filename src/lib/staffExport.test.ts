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

const TEMP_KEY = "temp-export-route-key";
const WRONG_KEY = "wrong-export-route-key";

function staffRequest(key?: string) {
  const headers: Record<string, string> = { "x-forwarded-for": "203.0.113.60" };
  if (key !== undefined) headers["x-staff-key"] = key;
  return new Request("http://127.0.0.1/api/staff/export", { method: "GET", headers });
}

async function main() {
  const previous = process.env.STAFF_KEY;
  process.env.STAFF_KEY = TEMP_KEY;
  try {
    const { GET } = await import("../app/api/staff/export/route");
    const { resetRateLimits } = await import("./rateLimit");
    resetRateLimits();

    const missing = await GET(staffRequest());
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { message: "Sai khóa." });

    const wrong = await GET(staffRequest(WRONG_KEY));
    assert.equal(wrong.status, 401);
    assert.deepEqual(await wrong.json(), { message: "Sai khóa." });
  } finally {
    if (previous === undefined) delete process.env.STAFF_KEY;
    else process.env.STAFF_KEY = previous;
  }
  console.log("staff export auth checks passed");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "staff export test failed";
  console.error(message);
  process.exit(1);
});

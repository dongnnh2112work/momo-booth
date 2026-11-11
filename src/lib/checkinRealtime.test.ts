import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { mergeCheckins, type CheckinRealtimeRow } from "./checkinRealtime";

function row(id: string, createdAt: string, code = id): CheckinRealtimeRow {
  return {
    id,
    code,
    booth: "5-10",
    client_id: `client-${id}`,
    created_at: createdAt,
  };
}

const later = row("b", "2026-11-11T00:00:02.000Z", "A02");
const earlier = row("a", "2026-11-11T00:00:01.000Z", "A01");
const sameTime = row("c", "2026-11-11T00:00:02.000Z", "A03");
const input = [later, earlier, sameTime, earlier];

const merged = mergeCheckins(["b"], input);
assert.deepEqual(
  merged.map((item) => item.id),
  ["a", "c"],
);
assert.deepEqual(
  input.map((item) => item.id),
  ["b", "a", "c", "a"],
);

const ordered = mergeCheckins([], [sameTime, later, earlier]);
assert.deepEqual(
  ordered.map((item) => item.id),
  ["a", "b", "c"],
);
assert.equal(ordered[1]?.created_at, later.created_at);
assert.equal(ordered[2]?.created_at, sameTime.created_at);

const none = mergeCheckins(new Set(["a", "b", "c"]), ordered);
assert.deepEqual(none, []);

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const relative of ["lib/checkinRealtime.ts", "components/DisplayStage.tsx"]) {
  const source = fs.readFileSync(path.join(sourceRoot, relative), "utf8");
  assert.equal(source.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
  assert.equal(source.includes("serviceRoleClient"), false);
  assert.equal(source.includes("/ingest"), false);
}
assert.equal(fs.existsSync(path.join(sourceRoot, "components/useCheckinRealtime.ts")), false);

console.log("checkin realtime merge passed");

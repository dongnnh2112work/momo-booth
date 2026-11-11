import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { indexRoster } from "./roster";
import { applyCheckin, emptyState, toSnapshot } from "./session";
import { QUEUE_PREVIEW } from "./timing";
import type { Employee } from "./types";

function employees(count: number, boothId: "3-5" | "5-10", prefix: string): Employee[] {
  return Array.from({ length: count }, (_, index) => {
    const n = String(index + 1).padStart(3, "0");
    return {
      code: `${prefix}${n}`,
      boothId,
      name: `Guest ${prefix}${n}`,
      department: "Test",
      years: 4,
      photo: `/portraits/hero/${prefix}${n}.webp`,
      thumb: `/portraits/thumbs/${prefix}${n}.webp`,
    };
  });
}

const people = [...employees(150, "3-5", "C"), ...employees(50, "5-10", "D")];
people.push({ ...people[0], name: "Duplicate Should Skip" });
const roster = indexRoster(people);
assert.equal(roster.byCode.size, 200);
assert.equal(roster.byBooth["3-5"].length, 150);
assert.equal(roster.byBooth["5-10"].length, 50);
assert.equal(roster.byCode.get("C001")?.name, "Guest C001");
assert.match(
  roster.byCode.get("C001")?.thumb ?? "",
  /^\/portraits\/thumbs\/C001\.webp(?:\?v=[0-9a-f]{12})?$/,
);
const portraitFile = path.join(process.cwd(), "public/portraits/hero/a01.webp");
if (fs.existsSync(portraitFile)) {
  const hash = crypto.createHash("sha256").update(fs.readFileSync(portraitFile)).digest("hex").slice(0, 12);
  const versioned = indexRoster([
    {
      code: "A01",
      boothId: "5-10",
      name: "Hash Check",
      department: "QA",
      years: 1,
      photo: "/portraits/hero/a01.webp",
      thumb: "/portraits/does-not-exist.webp",
    },
    {
      code: "EXT",
      boothId: "3-5",
      name: "Remote",
      department: "QA",
      years: 1,
      photo: "https://example.com/portrait.webp",
    },
  ]);
  assert.equal(versioned.byCode.get("A01")?.photo, `/portraits/hero/a01.webp?v=${hash}`);
  assert.equal(versioned.byCode.get("A01")?.thumb, "/portraits/does-not-exist.webp");
  assert.equal(versioned.byCode.get("EXT")?.photo, "https://example.com/portrait.webp");
}
assert.ok(roster.byCode.has("D050"));
assert.equal(roster.byCode.get("Z999"), undefined);

const state = emptyState();
const now = 1_700_000_000_000;
for (let index = 0; index < 25; index += 1) {
  const code = `C${String(index + 1).padStart(3, "0")}`;
  const result = applyCheckin(state, roster, {
    boothId: "3-5",
    code,
    clientId: `client-${String(index + 1).padStart(4, "0")}`,
    now: now + index,
    intent: "join",
  });
  assert.notEqual(result.result.status, "unknown");
}
assert.equal(state.booths["3-5"].spotlight?.code, "C001");
assert.equal(state.booths["3-5"].queue.length, 24);

const pub = toSnapshot(state, roster, "3-5", now);
assert.equal(pub.queueLength, 24);
assert.equal(pub.queue.length, QUEUE_PREVIEW);
assert.equal(pub.queueStates.length, 24);
assert.deepEqual(
  pub.queue.map((item) => item.code),
  pub.queueStates.slice(0, QUEUE_PREVIEW).map((item) => item.code),
);
assert.equal(pub.queueStates[23]?.code, "C025");
assert.equal(pub.queueStates[23]?.position, 25);
assert.ok(pub.queue.every((item) => item.photo.startsWith("/portraits/hero/")));
assert.ok(!pub.queue.some((item) => item.code === "C025"));

const staff = toSnapshot(state, roster, "3-5", now, { fullQueue: true });
assert.equal(staff.queue.length, 24);
assert.equal(staff.queue[23]?.name, "Guest C025");
assert.equal(staff.queueLength, 24);
assert.equal(staff.queueStates.length, 24);

console.log("snapshot checks passed");

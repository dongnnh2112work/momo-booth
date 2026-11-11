import assert from "node:assert/strict";

import { BOOTH_IDS, isBoothId, reloadBooths } from "./booths";

const previous = process.env.BOOTH_IDS;

try {
  delete process.env.BOOTH_IDS;
  reloadBooths();

  assert.deepEqual([...BOOTH_IDS], ["5-10", "3-5"]);
  assert.equal(isBoothId("5-10"), true);
  assert.equal(isBoothId("3-5"), true);
  assert.equal(isBoothId("alpha"), false);

  process.env.BOOTH_IDS = "alpha,beta";
  reloadBooths();

  assert.deepEqual([...BOOTH_IDS], ["alpha", "beta"]);
  assert.equal(isBoothId("alpha"), true);
  assert.equal(isBoothId("beta"), true);
  assert.equal(isBoothId("5-10"), false);
  assert.equal(isBoothId("3-5"), false);
} finally {
  if (previous === undefined) delete process.env.BOOTH_IDS;
  else process.env.BOOTH_IDS = previous;
  reloadBooths();
}

console.log("booths checks passed");

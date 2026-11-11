import assert from "node:assert/strict";

import { clientIp, consumeRateLimit, LIMITS, RATE_LIMIT_MESSAGE, limitFor, rateLimited, resetRateLimits } from "./rateLimit";

function request(headers: Record<string, string> = {}) {
  return new Request("http://127.0.0.1/api/booths/5-10/checkin", { method: "POST", headers });
}

resetRateLimits();

assert.equal(clientIp(request({ "x-forwarded-for": "203.0.113.10, 10.0.0.8" })), "203.0.113.10");
assert.equal(clientIp(request({ "x-forwarded-for": "not-an-ip", "x-real-ip": "198.51.100.8" })), "198.51.100.8");
assert.equal(clientIp(request({ forwarded: 'for="203.0.113.44"' })), "203.0.113.44");
assert.equal(clientIp(request({ "x-forwarded-for": "%%%" })), "unknown");
assert.equal(clientIp(request()), "unknown");

const now = 1_700_000_000_000;
assert.equal(consumeRateLimit("checkin:203.0.113.10", 2, 60_000, now), true);
assert.equal(consumeRateLimit("checkin:203.0.113.10", 2, 60_000, now + 10), true);
assert.equal(consumeRateLimit("checkin:203.0.113.10", 2, 60_000, now + 20), false);
assert.equal(consumeRateLimit("checkin:203.0.113.11", 2, 60_000, now + 20), true);
assert.equal(consumeRateLimit("checkin:203.0.113.10", 2, 60_000, now + 60_000), true);

async function main() {
  resetRateLimits();
  const shared = request({ "x-forwarded-for": "still-not-an-ip" });
  const missing = request();
  assert.equal(rateLimited(shared, "staff-write", now), null);
  for (let index = 1; index < LIMITS["staff-write"]; index += 1) {
    assert.equal(rateLimited(missing, "staff-write", now + index), null);
  }
  const blocked = rateLimited(shared, "staff-write", now + 50);
  assert.ok(blocked);
  assert.equal(blocked.status, 429);
  assert.deepEqual(await blocked.json(), { message: RATE_LIMIT_MESSAGE });
  assert.equal(rateLimited(request({ "x-real-ip": "203.0.113.77" }), "staff-write", now + 60), null);

  const previous = {
    checkin: process.env.RATE_LIMIT_CHECKIN_PER_MIN,
    read: process.env.RATE_LIMIT_STAFF_READ_PER_MIN,
    write: process.env.RATE_LIMIT_STAFF_WRITE_PER_MIN,
  };
  try {
    delete process.env.RATE_LIMIT_CHECKIN_PER_MIN;
    delete process.env.RATE_LIMIT_STAFF_READ_PER_MIN;
    delete process.env.RATE_LIMIT_STAFF_WRITE_PER_MIN;
    assert.equal(LIMITS.checkin, 300);
    assert.equal(LIMITS["staff-read"], 20);
    assert.equal(LIMITS["staff-write"], 10);
    assert.equal(limitFor("checkin", {}), 300);

    resetRateLimits();
    const sharedNat = request({ "x-forwarded-for": "203.0.113.200" });
    for (let index = 0; index < 200; index += 1) {
      assert.equal(rateLimited(sharedNat, "checkin", now + index), null);
    }

    process.env.RATE_LIMIT_CHECKIN_PER_MIN = "2";
    assert.equal(LIMITS.checkin, 2);
    resetRateLimits();
    const custom = request({ "x-forwarded-for": "203.0.113.201" });
    assert.equal(rateLimited(custom, "checkin", now), null);
    assert.equal(rateLimited(custom, "checkin", now + 1), null);
    const overCustom = rateLimited(custom, "checkin", now + 2);
    assert.ok(overCustom);
    assert.equal(overCustom.status, 429);
    assert.deepEqual(await overCustom.json(), { message: RATE_LIMIT_MESSAGE });

    for (const bad of ["0", "-3", "nope", "1.5", "", "  "]) {
      process.env.RATE_LIMIT_CHECKIN_PER_MIN = bad;
      assert.equal(LIMITS.checkin, 300);
      assert.equal(limitFor("checkin"), 300);
    }
    process.env.RATE_LIMIT_STAFF_READ_PER_MIN = "0";
    process.env.RATE_LIMIT_STAFF_WRITE_PER_MIN = "nope";
    assert.equal(LIMITS["staff-read"], 20);
    assert.equal(LIMITS["staff-write"], 10);
  } finally {
    if (previous.checkin === undefined) delete process.env.RATE_LIMIT_CHECKIN_PER_MIN;
    else process.env.RATE_LIMIT_CHECKIN_PER_MIN = previous.checkin;
    if (previous.read === undefined) delete process.env.RATE_LIMIT_STAFF_READ_PER_MIN;
    else process.env.RATE_LIMIT_STAFF_READ_PER_MIN = previous.read;
    if (previous.write === undefined) delete process.env.RATE_LIMIT_STAFF_WRITE_PER_MIN;
    else process.env.RATE_LIMIT_STAFF_WRITE_PER_MIN = previous.write;
  }

  console.log("rate limit checks passed");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "rate limit test failed";
  console.error(message);
  process.exit(1);
});

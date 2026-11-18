import assert from "node:assert/strict";

import { QR_WINDOW_MS, qrExpiresAt, qrToken, qrTokenValid } from "./checkinPass";

const previous = process.env.BOOTH_QR_SECRET;
process.env.BOOTH_QR_SECRET = "test-qr-secret";

const now = 1_700_000_000_000;
const token = qrToken(now);
assert.equal(qrTokenValid(token, now), true);
assert.equal(qrTokenValid(token, now + QR_WINDOW_MS), true);
assert.equal(qrTokenValid(token, now + QR_WINDOW_MS * 2), false);
assert.equal(qrTokenValid("nope", now), false);
assert.equal(qrExpiresAt(now), (Math.floor(now / QR_WINDOW_MS) + 1) * QR_WINDOW_MS);

if (previous === undefined) delete process.env.BOOTH_QR_SECRET;
else process.env.BOOTH_QR_SECRET = previous;

console.log("check-in pass checks passed");

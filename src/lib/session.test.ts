import assert from "node:assert/strict";

import { indexRoster } from "./roster";
import {
  applyCheckin,
  applyClearCooldown,
  applyClearQueue,
  applyDone,
  applySkip,
  emptyState,
  sweep,
} from "./session";
import { MAX_HOLD_MS, MIN_HOLD_MS } from "./timing";
import type { BoothId } from "./booths";
import type { Employee } from "./types";

const CLIENT_A = "client-a-0001";
const CLIENT_B = "client-b-0002";
const CLIENT_C = "client-c-0003";
const T0 = 1_700_000_000_000;

function people(): Employee[] {
  const rows: Employee[] = [];
  for (let index = 1; index <= 2; index += 1) {
    rows.push({
      code: `A0${index}`,
      boothId: "5-10",
      name: `Người A${index}`,
      department: "Phòng Kinh doanh",
      years: 6,
      photo: `/portraits/a0${index}.jpg`,
    });
    rows.push({
      code: `B0${index}`,
      boothId: "3-5",
      name: `Người B${index}`,
      department: "Phòng Marketing",
      years: 4,
      photo: `/portraits/b0${index}.jpg`,
    });
  }
  rows.push({
    code: "A03",
    boothId: "5-10",
    name: "Người A3",
    department: "Phòng Công nghệ",
    years: 8,
    photo: "/portraits/a03.jpg",
  });
  return rows;
}

const roster = indexRoster(people());

function join(state: ReturnType<typeof emptyState>, boothId: BoothId, code: string, clientId: string, now: number) {
  return applyCheckin(state, roster, { boothId, code, clientId, now, intent: "join" });
}

function boothJson(state: ReturnType<typeof emptyState>, id: BoothId) {
  return JSON.stringify(state.booths[id]);
}

const unknown = emptyState();
const beforeUnknown = JSON.stringify(unknown);
const unknownResult = join(unknown, "5-10", "Z99", CLIENT_A, T0);
assert.equal(unknownResult.result.status, "unknown");
assert.equal(JSON.stringify(unknown), beforeUnknown);

const wrong = emptyState();
const wrongBefore = JSON.stringify(wrong.booths);
const wrongResult = join(wrong, "5-10", "b01", CLIENT_A, T0);
assert.equal(wrongResult.result.status, "wrong_booth");
assert.equal(wrongResult.result.correctBoothId, "3-5");
assert.equal(JSON.stringify(wrong.booths), wrongBefore);

const state = emptyState();
const otherBefore = boothJson(state, "3-5");
const first = join(state, "5-10", "a01", CLIENT_A, T0);
assert.equal(first.result.status, "spotlight");
assert.equal(first.result.canControl, true);
assert.equal(state.booths["5-10"].spotlight?.code, "A01");
assert.equal(state.booths["5-10"].spotlight?.endsAt, T0 + MAX_HOLD_MS);
assert.equal(boothJson(state, "3-5"), otherBefore);
const ticketA = first.result.ticket;
assert.ok(ticketA);

const again = join(state, "5-10", "A01", CLIENT_A, T0 + 1000);
assert.equal(again.result.ticket, ticketA);
assert.equal(again.result.canControl, true);
assert.equal(state.booths["5-10"].spotlight?.endsAt, T0 + MAX_HOLD_MS);

const stranger = join(state, "5-10", "A01", CLIENT_B, T0 + 1500);
assert.equal(stranger.result.canControl, false);
assert.equal(stranger.result.ticket, undefined);
assert.equal(stranger.result.status, "spotlight");
assert.equal(state.booths["5-10"].spotlight?.ticket, ticketA);

const second = join(state, "5-10", "A02", CLIENT_B, T0 + 2000);
assert.equal(second.result.status, "queued");
assert.equal(second.result.position, 2);
assert.equal(state.booths["5-10"].spotlight?.code, "A01");
assert.equal(state.booths["5-10"].queue.length, 1);
const ticketB = second.result.ticket;
assert.ok(ticketB);

const blocked = join(state, "5-10", "A03", CLIENT_A, T0 + 2500);
assert.equal(blocked.result.code, "A01");
assert.equal(state.booths["5-10"].queue.length, 1);
assert.equal(state.booths["5-10"].spotlight?.code, "A01");

const tooSoon = applyDone(state, "5-10", ticketA, T0 + 1000);
assert.equal(tooSoon.ok, false);
assert.equal(tooSoon.error, "too_soon");
assert.equal(state.booths["5-10"].spotlight?.code, "A01");

const wrongTicket = applyDone(state, "5-10", "not-the-ticket", T0 + MIN_HOLD_MS);
assert.equal(wrongTicket.ok, false);
assert.equal(wrongTicket.error, "forbidden");
assert.equal(state.booths["5-10"].spotlight?.code, "A01");

const done = applyDone(state, "5-10", ticketA, T0 + MIN_HOLD_MS);
assert.equal(done.ok, true);
assert.equal(state.booths["5-10"].spotlight?.code, "A02");
assert.equal(state.booths["5-10"].spotlight?.ticket, ticketB);
assert.equal(state.booths["5-10"].queue.length, 0);
assert.equal(state.booths["5-10"].cooldowns.A01, undefined);

const againAfter = join(state, "5-10", "A01", CLIENT_A, T0 + MIN_HOLD_MS + 1000);
assert.equal(againAfter.result.status, "queued");
assert.equal(state.booths["5-10"].spotlight?.code, "A02");

const resumeState = emptyState();
const resume = applyCheckin(resumeState, roster, {
  boothId: "5-10",
  code: "A01",
  clientId: CLIENT_A,
  now: T0,
  intent: "resume",
});
assert.equal(resume.result.status, "idle");
assert.equal(resume.result.canControl, false);
assert.equal(resumeState.booths["5-10"].spotlight, null);

const timed = emptyState();
join(timed, "5-10", "A01", CLIENT_A, T0);
join(timed, "5-10", "A02", CLIENT_B, T0 + 10);
assert.equal(sweep(timed, T0 + MAX_HOLD_MS), true);
assert.equal(timed.booths["5-10"].spotlight?.code, "A02");
assert.equal(timed.booths["5-10"].cooldowns.A01, undefined);

const skipped = emptyState();
join(skipped, "5-10", "A01", CLIENT_A, T0);
join(skipped, "5-10", "A02", CLIENT_B, T0 + 10);
const skip = applySkip(skipped, "5-10", T0 + 1000);
assert.equal(skip.ok, true);
assert.equal(skipped.booths["5-10"].spotlight?.code, "A02");
assert.equal(skipped.booths["5-10"].cooldowns.A01, undefined);

const queued = emptyState();
join(queued, "5-10", "A01", CLIENT_A, T0);
join(queued, "5-10", "A02", CLIENT_B, T0 + 10);
join(queued, "5-10", "A03", CLIENT_C, T0 + 20);
applyClearQueue(queued, "5-10", T0 + 30);
assert.equal(queued.booths["5-10"].spotlight?.code, "A01");
assert.equal(queued.booths["5-10"].queue.length, 0);

const cooledState = emptyState();
const held = join(cooledState, "5-10", "A01", CLIENT_A, T0);
applyDone(cooledState, "5-10", held.result.ticket ?? "", T0 + MIN_HOLD_MS);
const rejoined = join(cooledState, "5-10", "A01", CLIENT_A, T0 + MIN_HOLD_MS + 20);
assert.equal(rejoined.result.status, "spotlight");
assert.equal(cooledState.booths["5-10"].spotlight?.code, "A01");

const isolated = emptyState();
join(isolated, "3-5", "B01", CLIENT_B, T0);
assert.equal(isolated.booths["5-10"].spotlight, null);
assert.equal(isolated.booths["3-5"].spotlight?.code, "B01");
assert.equal(join(isolated, "3-5", "A01", CLIENT_A, T0).result.status, "wrong_booth");
assert.equal(isolated.booths["3-5"].spotlight?.code, "B01");
assert.equal(isolated.booths["5-10"].spotlight, null);

console.log("session checks passed");

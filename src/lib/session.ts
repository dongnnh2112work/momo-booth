import { randomUUID } from "node:crypto";

import { BOOTHS, BOOTH_IDS, type BoothId } from "./booths";
import { normalizeCode } from "./codes";
import type { RosterIndex } from "./roster";
import { COOLDOWN_MS, MAX_HOLD_MS, MIN_HOLD_MS } from "./timing";
import type {
  ActionResult,
  BoothLive,
  CheckinResult,
  LiveState,
  PublicQueueItem,
  PublicSnapshot,
  QueueItem,
  Spotlight,
  StaffCooldown,
} from "./types";

const UNKNOWN = "Không tìm thấy mã này trong danh sách vinh danh.";

export function emptyState(): LiveState {
  return {
    revision: 0,
    booths: {
      "5-10": { spotlight: null, queue: [], cooldowns: {} },
      "3-5": { spotlight: null, queue: [], cooldowns: {} },
    },
  };
}

type Slot = {
  kind: "spotlight" | "queue";
  code: string;
  ticket: string;
  clientId: string;
  index: number;
};

export type Mutation = {
  changed: boolean;
  emit: BoothId[];
};

function withEmit(changed: boolean, emit: Set<BoothId>): Mutation {
  return { changed, emit: [...emit] };
}

function baseSweep(swept: boolean): { changed: boolean; emit: Set<BoothId> } {
  return {
    changed: swept,
    emit: new Set(swept ? BOOTH_IDS : []),
  };
}

export function sweep(state: LiveState, now: number): boolean {
  let changed = false;
  for (const id of BOOTH_IDS) {
    const booth = state.booths[id];
    for (const [code, until] of Object.entries(booth.cooldowns)) {
      if (until <= now) {
        delete booth.cooldowns[code];
        changed = true;
      }
    }
    if (booth.spotlight && booth.spotlight.endsAt <= now) {
      finishSpotlight(booth, now);
      changed = true;
    }
  }
  return changed;
}

function finishSpotlight(booth: BoothLive, now: number) {
  if (!booth.spotlight) return;
  if (COOLDOWN_MS > 0) booth.cooldowns[booth.spotlight.code] = now + COOLDOWN_MS;
  const next = booth.queue.shift() ?? null;
  booth.spotlight = next ? promote(next, now) : null;
}

function promote(next: QueueItem, now: number): Spotlight {
  return {
    code: next.code,
    ticket: next.ticket,
    clientId: next.clientId,
    startedAt: now,
    endsAt: now + MAX_HOLD_MS,
  };
}

function findCode(booth: BoothLive, code: string): Slot | null {
  if (booth.spotlight?.code === code) {
    return {
      kind: "spotlight",
      index: -1,
      code: booth.spotlight.code,
      ticket: booth.spotlight.ticket,
      clientId: booth.spotlight.clientId,
    };
  }
  const index = booth.queue.findIndex((item) => item.code === code);
  if (index < 0) return null;
  const item = booth.queue[index];
  return { kind: "queue", index, code: item.code, ticket: item.ticket, clientId: item.clientId };
}

function findOwned(booth: BoothLive, clientId: string): Slot | null {
  if (booth.spotlight?.clientId === clientId) {
    return {
      kind: "spotlight",
      index: -1,
      code: booth.spotlight.code,
      ticket: booth.spotlight.ticket,
      clientId: booth.spotlight.clientId,
    };
  }
  const index = booth.queue.findIndex((item) => item.clientId === clientId);
  if (index < 0) return null;
  const item = booth.queue[index];
  return { kind: "queue", index, code: item.code, ticket: item.ticket, clientId: item.clientId };
}

function personName(roster: RosterIndex, code: string): string {
  return roster.byCode.get(code)?.name ?? code;
}

function describe(roster: RosterIndex, booth: BoothLive, slot: Slot, canControl: boolean, now: number): CheckinResult {
  const name = personName(roster, slot.code);
  if (slot.kind === "spotlight" && booth.spotlight) {
    const waitingBehind = booth.queue.length;
    let message = canControl
      ? "Ảnh của bạn đang ở trên màn hình."
      : "Mã này đang được chiếu. Màn hình không đổi.";
    if (canControl && waitingBehind > 0) {
      message = `Ảnh của bạn đang ở trên màn hình. Có ${waitingBehind} người đang chờ — bấm Chụp xong để nhường.`;
    }
    return {
      status: "spotlight",
      message,
      canControl,
      code: slot.code,
      name,
      position: 1,
      ticket: canControl ? slot.ticket : undefined,
      minHoldUntil: booth.spotlight.startedAt + MIN_HOLD_MS,
      worstCaseEndsAt: booth.spotlight.endsAt,
      waitingBehind,
    };
  }

  const position = slot.index + 2;
  const worstCaseEndsAt = (booth.spotlight?.endsAt ?? now) + Math.max(0, slot.index) * MAX_HOLD_MS;
  return {
    status: "queued",
    message: canControl
      ? `Bạn là số ${position}. Màn hình giữ nguyên cho tới khi người trước bấm Chụp xong.`
      : `Mã này đang trong hàng chờ, vị trí ${position}.`,
    canControl,
    code: slot.code,
    name,
    position,
    ticket: canControl ? slot.ticket : undefined,
    worstCaseEndsAt,
  };
}

function unknownResult(owned: Slot | null, roster: RosterIndex, booth: BoothLive, now: number): CheckinResult {
  if (!owned) return { status: "unknown", message: UNKNOWN, canControl: false };
  return {
    ...describe(roster, booth, owned, true, now),
    message: `Không tìm thấy mã này. Máy này đang giữ lượt ${owned.code}.`,
  };
}

export type CheckinInput = {
  boothId: BoothId;
  code: string;
  clientId: string;
  now: number;
  intent: "join" | "resume";
};

export function applyCheckin(
  state: LiveState,
  roster: RosterIndex,
  input: CheckinInput,
): { result: CheckinResult } & Mutation {
  const sweepState = baseSweep(sweep(state, input.now));
  const emit = sweepState.emit;
  let changed = sweepState.changed;
  const booth = state.booths[input.boothId];
  const owned = findOwned(booth, input.clientId);
  const code = normalizeCode(input.code);

  if (!code) {
    return { result: unknownResult(owned, roster, booth, input.now), ...withEmit(changed, emit) };
  }

  const employee = roster.byCode.get(code);
  if (!employee) {
    return { result: unknownResult(owned, roster, booth, input.now), ...withEmit(changed, emit) };
  }

  if (employee.boothId !== input.boothId) {
    const correct = BOOTHS[employee.boothId];
    return {
      result: {
        status: "wrong_booth",
        message: `Mã này thuộc booth ${correct.label}. Bạn qua booth bên kia nhé.`,
        canControl: false,
        code,
        name: employee.name,
        correctBoothId: employee.boothId,
        correctBoothLabel: correct.label,
      },
      ...withEmit(changed, emit),
    };
  }

  const codeSlot = findCode(booth, code);
  if (codeSlot) {
    return {
      result: describe(roster, booth, codeSlot, codeSlot.clientId === input.clientId, input.now),
      ...withEmit(changed, emit),
    };
  }

  if (owned) {
    return {
      result: {
        ...describe(roster, booth, owned, true, input.now),
        message: `Máy này đang giữ lượt của mã ${owned.code}. Hoàn tất lượt đó trước khi nhập mã khác.`,
      },
      ...withEmit(changed, emit),
    };
  }

  const cooldownUntil = COOLDOWN_MS > 0 ? booth.cooldowns[code] : undefined;
  if (cooldownUntil && cooldownUntil > input.now) {
    return {
      result: {
        status: "cooldown",
        message: "Bạn đã check-in rồi. Màn hình sẽ không chiếu lại mã này trong lúc này.",
        canControl: false,
        code,
        name: employee.name,
        cooldownUntil,
      },
      ...withEmit(changed, emit),
    };
  }

  if (input.intent === "resume") {
    return { result: { status: "idle", message: "", canControl: false }, ...withEmit(changed, emit) };
  }

  const ticket = randomUUID().replace(/-/g, "");
  if (!booth.spotlight) {
    booth.spotlight = {
      code,
      ticket,
      clientId: input.clientId,
      startedAt: input.now,
      endsAt: input.now + MAX_HOLD_MS,
    };
  } else {
    booth.queue.push({ code, ticket, clientId: input.clientId, enqueuedAt: input.now });
  }
  changed = true;
  emit.add(input.boothId);
  const created = findCode(booth, code);
  return {
    result: created
      ? describe(roster, booth, created, true, input.now)
      : { status: "idle", message: "", canControl: false },
    ...withEmit(changed, emit),
  };
}

export function applyDone(
  state: LiveState,
  boothId: BoothId,
  ticket: string,
  now: number,
): ActionResult & Mutation {
  const sweepState = baseSweep(sweep(state, now));
  const emit = sweepState.emit;
  const booth = state.booths[boothId];
  if (!booth.spotlight) {
    return {
      ok: false,
      error: "idle",
      message: "Hiện không có lượt nào đang chiếu.",
      ...withEmit(sweepState.changed, emit),
    };
  }
  if (booth.spotlight.ticket !== ticket) {
    return {
      ok: false,
      error: "forbidden",
      message: "Máy này không giữ lượt đang chiếu.",
      ...withEmit(sweepState.changed, emit),
    };
  }
  const minHoldUntil = booth.spotlight.startedAt + MIN_HOLD_MS;
  if (now < minHoldUntil) {
    return {
      ok: false,
      error: "too_soon",
      message: "Giữ thêm một chút để kịp chụp.",
      minHoldUntil,
      ...withEmit(sweepState.changed, emit),
    };
  }
  finishSpotlight(booth, now);
  emit.add(boothId);
  return { ok: true, message: "Đã xong. Cảm ơn bạn.", ...withEmit(true, emit) };
}

export function applySkip(state: LiveState, boothId: BoothId, now: number): ActionResult & Mutation {
  const sweepState = baseSweep(sweep(state, now));
  const emit = sweepState.emit;
  const booth = state.booths[boothId];
  if (!booth.spotlight) {
    return { ok: true, message: "Đang ở vòng lặp.", ...withEmit(sweepState.changed, emit) };
  }
  finishSpotlight(booth, now);
  emit.add(boothId);
  return { ok: true, message: "Đã chuyển lượt.", ...withEmit(true, emit) };
}

export function applyClearQueue(state: LiveState, boothId: BoothId, now: number): ActionResult & Mutation {
  const sweepState = baseSweep(sweep(state, now));
  const emit = sweepState.emit;
  const booth = state.booths[boothId];
  if (booth.queue.length === 0) {
    return { ok: true, message: "Hàng chờ đang trống.", ...withEmit(sweepState.changed, emit) };
  }
  booth.queue = [];
  emit.add(boothId);
  return { ok: true, message: "Đã xoá hàng chờ.", ...withEmit(true, emit) };
}

export function applyClearCooldown(
  state: LiveState,
  boothId: BoothId,
  now: number,
  code?: string,
): ActionResult & Mutation {
  const sweepState = baseSweep(sweep(state, now));
  const emit = sweepState.emit;
  const booth = state.booths[boothId];
  if (code) {
    const normalized = normalizeCode(code);
    if (!normalized || booth.cooldowns[normalized] === undefined) {
      return { ok: true, message: "Không có cooldown cho mã này.", ...withEmit(sweepState.changed, emit) };
    }
    delete booth.cooldowns[normalized];
  } else if (Object.keys(booth.cooldowns).length === 0) {
    return { ok: true, message: "Không có cooldown.", ...withEmit(sweepState.changed, emit) };
  } else {
    booth.cooldowns = {};
  }
  emit.add(boothId);
  return { ok: true, message: "Đã gỡ cooldown.", ...withEmit(true, emit) };
}

export function toSnapshot(state: LiveState, roster: RosterIndex, boothId: BoothId, now: number): PublicSnapshot {
  const meta = BOOTHS[boothId];
  const booth = state.booths[boothId];
  const current = booth.spotlight ? roster.byCode.get(booth.spotlight.code) : undefined;
  const queue: PublicQueueItem[] = booth.queue.map((item, index) => {
    const person = roster.byCode.get(item.code);
    return {
      code: item.code,
      name: person?.name ?? item.code,
      photo: person?.photo ?? "",
      position: index + 2,
      worstCaseEndsAt: (booth.spotlight?.endsAt ?? now) + index * MAX_HOLD_MS,
    };
  });

  return {
    boothId,
    revision: state.revision,
    label: meta.label,
    title: meta.title,
    mode: booth.spotlight ? "spotlight" : "loop",
    serverNow: now,
    spotlight: booth.spotlight
      ? {
          code: booth.spotlight.code,
          name: current?.name ?? booth.spotlight.code,
          department: current?.department ?? "",
          years: current?.years ?? 0,
          photo: current?.photo ?? "",
          startedAt: booth.spotlight.startedAt,
          endsAt: booth.spotlight.endsAt,
          minHoldUntil: booth.spotlight.startedAt + MIN_HOLD_MS,
          waitingBehind: booth.queue.length,
        }
      : null,
    queue,
  };
}

export function cooldownList(state: LiveState, roster: RosterIndex, boothId: BoothId, now: number): StaffCooldown[] {
  return Object.entries(state.booths[boothId].cooldowns)
    .filter(([, until]) => until > now)
    .map(([code, until]) => ({ code, name: personName(roster, code), until }))
    .sort((a, b) => a.until - b.until);
}

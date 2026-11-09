import "server-only";

import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { BlobError, BlobPreconditionFailedError, get, put } from "@vercel/blob";

import { BOOTH_IDS, isBoothId, type BoothId } from "./booths";
import { indexRoster, type RosterIndex } from "./roster";
import {
  applyCheckin,
  applyClearCooldown,
  applyClearQueue,
  applyDone,
  applySkip,
  cooldownList,
  emptyState,
  sweep,
  toSnapshot,
} from "./session";
import type {
  ActionResponse,
  BoothLive,
  CheckinResponse,
  Employee,
  LiveState,
  PublicSnapshot,
  QueueItem,
  RosterCard,
  Spotlight,
  StaffPayload,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "live-state.json");
const ROSTER_PATH = path.join(DATA_DIR, "roster.json");
const STATE_BLOB = "booth/live-state.json";

function useSharedState() {
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

function rememberTiming(read: number, write: number, attempts: number) {
  (globalThis as { __boothTiming?: { read: number; write: number; attempts: number } }).__boothTiming = {
    read,
    write,
    attempts,
  };
}

type StoreGlobal = {
  emitter: EventEmitter;
  chain: Promise<void>;
  timer: NodeJS.Timeout | null;
  memory: LiveState;
  roster: RosterIndex;
  rosterMtime: number;
  runTick: () => Promise<void>;
};

const globalStore = globalThis as typeof globalThis & { __momoBooth?: StoreGlobal };

type Ctx = {
  state: LiveState;
  now: number;
  roster: RosterIndex;
};

function readRosterFile(): Employee[] {
  const raw = fs.readFileSync(ROSTER_PATH, "utf8");
  const parsed = JSON.parse(raw) as { employees?: Employee[] };
  return Array.isArray(parsed.employees) ? parsed.employees : [];
}

function isSpotlight(value: unknown): value is Spotlight {
  if (!value || typeof value !== "object") return false;
  const item = value as Spotlight;
  return (
    typeof item.code === "string" &&
    typeof item.ticket === "string" &&
    typeof item.clientId === "string" &&
    typeof item.startedAt === "number" &&
    typeof item.endsAt === "number"
  );
}

function isQueueItem(value: unknown): value is QueueItem {
  if (!value || typeof value !== "object") return false;
  const item = value as QueueItem;
  return (
    typeof item.code === "string" &&
    typeof item.ticket === "string" &&
    typeof item.clientId === "string" &&
    typeof item.enqueuedAt === "number"
  );
}

function sanitize(parsed: unknown): LiveState {
  const base = emptyState();
  if (!parsed || typeof parsed !== "object") return base;
  const record = parsed as Partial<LiveState>;
  if (typeof record.revision === "number" && Number.isFinite(record.revision)) {
    base.revision = record.revision;
  }
  for (const id of BOOTH_IDS) {
    const booth = record.booths?.[id];
    if (!booth) continue;
    const cooldowns: Record<string, number> = {};
    if (booth.cooldowns && typeof booth.cooldowns === "object") {
      for (const [code, until] of Object.entries(booth.cooldowns)) {
        if (typeof until === "number") cooldowns[code] = until;
      }
    }
    const next: BoothLive = {
      spotlight: isSpotlight(booth.spotlight) ? booth.spotlight : null,
      queue: Array.isArray(booth.queue) ? booth.queue.filter(isQueueItem) : [],
      cooldowns,
    };
    base.booths[id] = next;
  }
  return base;
}

function loadState(): LiveState {
  try {
    return sanitize(JSON.parse(fs.readFileSync(STATE_PATH, "utf8")));
  } catch {
    return emptyState();
  }
}

function saveState(state: LiveState) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporary = `${STATE_PATH}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state));
  fs.renameSync(temporary, STATE_PATH);
}

function rosterMtime(): number {
  try {
    return fs.statSync(ROSTER_PATH).mtimeMs;
  } catch {
    return 0;
  }
}

function currentRoster(store: StoreGlobal): RosterIndex {
  const mtime = rosterMtime();
  if (mtime !== store.rosterMtime) {
    try {
      store.roster = indexRoster(readRosterFile());
      store.rosterMtime = mtime;
    } catch (error) {
      console.error("roster", error);
    }
  }
  return store.roster;
}

function init(): StoreGlobal {
  if (!globalStore.__momoBooth) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(200);
    let roster = indexRoster([]);
    try {
      roster = indexRoster(readRosterFile());
    } catch (error) {
      console.error("roster", error);
    }
    globalStore.__momoBooth = {
      emitter,
      chain: Promise.resolve(),
      timer: null,
      memory: useSharedState() ? emptyState() : loadState(),
      roster,
      rosterMtime: rosterMtime(),
      runTick: async () => {},
    };
    if (!useSharedState()) {
      const timer = setInterval(() => {
        void globalStore.__momoBooth?.runTick();
      }, 1000);
      timer.unref?.();
      globalStore.__momoBooth.timer = timer;
    }
  }
  globalStore.__momoBooth.runTick = () => tick();
  return globalStore.__momoBooth;
}

function isConflict(error: unknown) {
  if (error instanceof BlobPreconditionFailedError) return true;
  return error instanceof BlobError && /already exists|precondition/i.test(error.message);
}

async function readShared(): Promise<{ state: LiveState; etag: string | null }> {
  const result = await get(STATE_BLOB, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return { state: emptyState(), etag: null };
  }
  const text = await new Response(result.stream).text();
  try {
    return { state: sanitize(JSON.parse(text)), etag: result.blob.etag };
  } catch {
    return { state: emptyState(), etag: result.blob.etag };
  }
}

async function writeShared(state: LiveState, etag: string | null) {
  const saved = await put(STATE_BLOB, JSON.stringify(state), {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 0,
    ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
  });
  return saved.etag;
}

function emitSnapshots(store: StoreGlobal, roster: RosterIndex, state: LiveState, now: number, emit: BoothId[]) {
  const ids = [...new Set(emit.length > 0 ? emit : BOOTH_IDS)];
  for (const id of ids) {
    try {
      store.emitter.emit(id, toSnapshot(state, roster, id, now));
    } catch (error) {
      console.error("emit", error);
    }
  }
}

function mutateLocal<T>(store: StoreGlobal, work: (ctx: Ctx) => { changed: boolean; emit: BoothId[]; build: () => T }): T {
  const now = Date.now();
  const roster = currentRoster(store);
  const state = store.memory;
  const draft = work({ state, now, roster });
  if (draft.changed) state.revision += 1;
  const result = draft.build();
  if (draft.changed) {
    try {
      saveState(state);
    } catch (error) {
      console.error("save state", error);
    }
    emitSnapshots(store, roster, state, now, draft.emit);
  }
  return result;
}

async function mutateShared<T>(
  store: StoreGlobal,
  work: (ctx: Ctx) => { changed: boolean; emit: BoothId[]; build: () => T },
): Promise<T> {
  const roster = currentRoster(store);
  let readMs = 0;
  let writeMs = 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const readStarted = Date.now();
    const loaded = await readShared();
    readMs += Date.now() - readStarted;
    const now = Date.now();
    const draft = work({ state: loaded.state, now, roster });
    if (draft.changed) loaded.state.revision += 1;
    const result = draft.build();
    if (!draft.changed) {
      rememberTiming(readMs, writeMs, attempt + 1);
      return result;
    }
    try {
      const writeStarted = Date.now();
      await writeShared(loaded.state, loaded.etag);
      writeMs += Date.now() - writeStarted;
      emitSnapshots(store, roster, loaded.state, now, draft.emit);
      rememberTiming(readMs, writeMs, attempt + 1);
      return result;
    } catch (error) {
      if (!isConflict(error) || attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
  throw new Error("Booth state is busy");
}

function mutate<T>(work: (ctx: Ctx) => { changed: boolean; emit: BoothId[]; build: () => T }): Promise<T> {
  const store = init();
  const run = store.chain.then(() => (useSharedState() ? mutateShared(store, work) : mutateLocal(store, work)));
  store.chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function tick() {
  return mutate(({ state, now }) => {
    const changed = sweep(state, now);
    return { changed, emit: changed ? [...BOOTH_IDS] : [], build: () => undefined };
  });
}

function cards(roster: RosterIndex, boothId: BoothId): RosterCard[] {
  return roster.byBooth[boothId].map((person) => ({ code: person.code, photo: person.photo }));
}

export function subscribe(boothId: BoothId, listener: (snapshot: PublicSnapshot) => void) {
  const store = init();
  store.emitter.on(boothId, listener);
  return () => {
    store.emitter.off(boothId, listener);
  };
}

export function getBooth(boothId: BoothId) {
  return mutate((ctx) => {
    const changed = sweep(ctx.state, ctx.now);
    return {
      changed,
      emit: changed ? [...BOOTH_IDS] : [],
      build: () => ({
        snapshot: toSnapshot(ctx.state, ctx.roster, boothId, ctx.now),
        roster: cards(ctx.roster, boothId),
      }),
    };
  });
}

export function checkIn(
  boothId: BoothId,
  input: { code: string; clientId: string; intent: "join" | "resume" },
): Promise<CheckinResponse> {
  return mutate((ctx) => {
    const applied = applyCheckin(ctx.state, ctx.roster, { ...input, boothId, now: ctx.now });
    return {
      changed: applied.changed,
      emit: applied.emit,
      build: () => ({
        ...applied.result,
        snapshot: toSnapshot(ctx.state, ctx.roster, boothId, ctx.now),
      }),
    };
  });
}

export function finishTurn(boothId: BoothId, ticket: string): Promise<ActionResponse> {
  return mutate((ctx) => {
    const applied = applyDone(ctx.state, boothId, ticket, ctx.now);
    return {
      changed: applied.changed,
      emit: applied.emit,
      build: () => ({
        ok: applied.ok,
        message: applied.message,
        error: applied.error,
        minHoldUntil: applied.minHoldUntil,
        snapshot: toSnapshot(ctx.state, ctx.roster, boothId, ctx.now),
      }),
    };
  });
}

export function skipTurn(boothId: BoothId): Promise<ActionResponse> {
  return mutate((ctx) => {
    const applied = applySkip(ctx.state, boothId, ctx.now);
    return {
      changed: applied.changed,
      emit: applied.emit,
      build: () => ({
        ...applied,
        snapshot: toSnapshot(ctx.state, ctx.roster, boothId, ctx.now),
      }),
    };
  });
}

export function clearQueue(boothId: BoothId): Promise<ActionResponse> {
  return mutate((ctx) => {
    const applied = applyClearQueue(ctx.state, boothId, ctx.now);
    return {
      changed: applied.changed,
      emit: applied.emit,
      build: () => ({
        ...applied,
        snapshot: toSnapshot(ctx.state, ctx.roster, boothId, ctx.now),
      }),
    };
  });
}

export function clearCooldown(boothId: BoothId, code?: string): Promise<ActionResponse> {
  return mutate((ctx) => {
    const applied = applyClearCooldown(ctx.state, boothId, ctx.now, code);
    return {
      changed: applied.changed,
      emit: applied.emit,
      build: () => ({
        ...applied,
        snapshot: toSnapshot(ctx.state, ctx.roster, boothId, ctx.now),
      }),
    };
  });
}

export function readStaff(): Promise<StaffPayload> {
  return mutate((ctx) => {
    const changed = sweep(ctx.state, ctx.now);
    return {
      changed,
      emit: changed ? [...BOOTH_IDS] : [],
      build: () => ({
        serverNow: ctx.now,
        booths: {
          "5-10": {
            snapshot: toSnapshot(ctx.state, ctx.roster, "5-10", ctx.now),
            cooldowns: cooldownList(ctx.state, ctx.roster, "5-10", ctx.now),
          },
          "3-5": {
            snapshot: toSnapshot(ctx.state, ctx.roster, "3-5", ctx.now),
            cooldowns: cooldownList(ctx.state, ctx.roster, "3-5", ctx.now),
          },
        },
      }),
    };
  });
}

export function parseBooth(value: unknown): BoothId | null {
  return typeof value === "string" && isBoothId(value) ? value : null;
}

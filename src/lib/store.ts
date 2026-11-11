import "server-only";

import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";

import { assertLocalStaffKey, usesLocalStore } from "./staffKey";
import { BOOTH_IDS, isBoothId, type BoothId } from "./booths";
import { indexRoster, type RosterIndex } from "./roster";
import { PERSIST_DEBOUNCE_MS } from "./timing";
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

function resolveDataPath(envName: string, fallback: string) {
  const raw = process.env[envName];
  if (!raw) return path.join(process.cwd(), fallback);
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

function stateFile() {
  return resolveDataPath("STATE_PATH", "data/live-state.json");
}

function rosterFile() {
  return resolveDataPath("ROSTER_PATH", "data/roster.json");
}

function useSharedState() {
  return !usesLocalStore();
}

type PersistGlobal = {
  timer: NodeJS.Timeout | null;
  queued: LiveState | null;
  hooks: boolean;
};

const persist: PersistGlobal = { timer: null, queued: null, hooks: false };

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
  const raw = fs.readFileSync(rosterFile(), "utf8");
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

const BACKUP_LIMIT = 10;

function backupPath(file: string, index: number) {
  return `${file}.bak-${index}`;
}

function readStoredState(file: string): LiveState {
  return sanitize(JSON.parse(fs.readFileSync(file, "utf8")));
}

function recoverFromBackups(file: string): LiveState | null {
  for (let index = 1; index <= BACKUP_LIMIT; index += 1) {
    const candidate = backupPath(file, index);
    if (!fs.existsSync(candidate)) continue;
    try {
      const state = readStoredState(candidate);
      console.error(`state backup used: ${path.basename(candidate)}`);
      return state;
    } catch {
      continue;
    }
  }
  return null;
}

function removeExtraBackups(file: string) {
  const directory = path.dirname(file);
  const prefix = `${path.basename(file)}.bak-`;
  for (const name of fs.readdirSync(directory)) {
    if (!name.startsWith(prefix)) continue;
    const suffix = name.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    if (Number(suffix) > BACKUP_LIMIT) fs.rmSync(path.join(directory, name), { force: true });
  }
}

function rotateBackups(file: string) {
  for (let index = BACKUP_LIMIT - 1; index >= 1; index -= 1) {
    const from = backupPath(file, index);
    if (!fs.existsSync(from)) continue;
    fs.renameSync(from, backupPath(file, index + 1));
  }
  fs.copyFileSync(file, backupPath(file, 1));
  removeExtraBackups(file);
}

export function loadState(): LiveState {
  const file = stateFile();
  if (fs.existsSync(file)) {
    try {
      return readStoredState(file);
    } catch {
      const recovered = recoverFromBackups(file);
      if (recovered) return recovered;
      throw new Error("state file is corrupt and no valid backup exists");
    }
  }
  const recovered = recoverFromBackups(file);
  if (recovered) return recovered;
  return emptyState();
}

export function saveState(state: LiveState) {
  const file = stateFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state));
  fs.renameSync(temporary, file);
  rotateBackups(file);
}

function flushSave() {
  if (persist.timer) {
    clearTimeout(persist.timer);
    persist.timer = null;
  }
  const queued = persist.queued;
  persist.queued = null;
  if (queued) {
    try {
      saveState(queued);
    } catch (error) {
      console.error("save state", error);
    }
  }
}

function scheduleSave(state: LiveState) {
  persist.queued = state;
  if (persist.timer) return;
  persist.timer = setTimeout(() => {
    persist.timer = null;
    flushSave();
  }, PERSIST_DEBOUNCE_MS);
  persist.timer.unref?.();
}

function installPersistHooks() {
  if (persist.hooks) return;
  persist.hooks = true;
  const onStop = () => {
    flushSave();
  };
  process.on("beforeExit", onStop);
  process.on("SIGINT", () => {
    onStop();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    onStop();
    process.exit(143);
  });
}

function rosterMtime(): number {
  try {
    return fs.statSync(rosterFile()).mtimeMs;
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
    if (!useSharedState()) {
      try {
        assertLocalStaffKey();
      } catch {
        process.exit(1);
      }
    }
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
      installPersistHooks();
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

function readShared(): LiveState {
  return loadState();
}

function writeShared(state: LiveState) {
  saveState(state);
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
    scheduleSave(state);
    emitSnapshots(store, roster, state, now, draft.emit);
  }
  return result;
}

async function mutateShared<T>(
  store: StoreGlobal,
  work: (ctx: Ctx) => { changed: boolean; emit: BoothId[]; build: () => T },
): Promise<T> {
  const roster = currentRoster(store);
  const readStarted = Date.now();
  const loaded = readShared();
  const readMs = Date.now() - readStarted;
  const now = Date.now();
  const draft = work({ state: loaded, now, roster });
  if (draft.changed) loaded.revision += 1;
  const result = draft.build();
  let writeMs = 0;
  if (draft.changed) {
    const writeStarted = Date.now();
    writeShared(loaded);
    writeMs = Date.now() - writeStarted;
    emitSnapshots(store, roster, loaded, now, draft.emit);
  }
  rememberTiming(readMs, writeMs, 1);
  return result;
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
  return roster.byBooth[boothId].map((person) => ({
    code: person.code,
    photo: person.photo,
    thumb: person.thumb,
  }));
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

export function ingestDisplayedCheckins(
  boothId: BoothId,
  rows: { code: string; clientId: string; at: number }[],
): Promise<{ accepted: number }> {
  return mutate((ctx) => {
    const ordered = [...rows].sort((left, right) => left.at - right.at);
    let changed = false;
    const emit = new Set<BoothId>();
    let accepted = 0;
    for (const row of ordered) {
      const applied = applyCheckin(ctx.state, ctx.roster, {
        boothId,
        code: row.code,
        clientId: row.clientId,
        now: ctx.now,
        intent: "join",
      });
      if (applied.changed) {
        changed = true;
        accepted += 1;
      }
      for (const id of applied.emit) emit.add(id);
    }
    return { changed, emit: [...emit], build: () => ({ accepted }) };
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

function cloneLiveState(state: LiveState): LiveState {
  const booths = {} as LiveState["booths"];
  for (const id of BOOTH_IDS) {
    const booth = state.booths[id] ?? { spotlight: null, queue: [], cooldowns: {} };
    booths[id] = {
      spotlight: booth.spotlight ? { ...booth.spotlight } : null,
      queue: booth.queue.map((item) => ({ ...item })),
      cooldowns: { ...booth.cooldowns },
    };
  }
  return { revision: state.revision, booths };
}

export function readLiveState(): Promise<LiveState> {
  return mutate((ctx) => {
    const changed = sweep(ctx.state, ctx.now);
    return {
      changed,
      emit: changed ? [...BOOTH_IDS] : [],
      build: () => cloneLiveState(ctx.state),
    };
  });
}

export function readStaff(): Promise<StaffPayload> {
  return mutate((ctx) => {
    const changed = sweep(ctx.state, ctx.now);
    return {
      changed,
      emit: changed ? [...BOOTH_IDS] : [],
      build: () => {
        const booths = {} as StaffPayload["booths"];
        for (const id of BOOTH_IDS) {
          booths[id] = {
            snapshot: toSnapshot(ctx.state, ctx.roster, id, ctx.now, { fullQueue: true }),
            cooldowns: cooldownList(ctx.state, ctx.roster, id, ctx.now),
          };
        }
        return { serverNow: ctx.now, booths };
      },
    };
  });
}

export function readHealth() {
  return mutate((ctx) => {
    const changed = sweep(ctx.state, ctx.now);
    const sizes = Object.fromEntries(
      BOOTH_IDS.map((id) => [
        id,
        {
          spotlight: Boolean(ctx.state.booths[id].spotlight),
          queueLength: ctx.state.booths[id].queue.length,
        },
      ]),
    );
    return {
      changed,
      emit: changed ? [...BOOTH_IDS] : [],
      build: () => ({
        ok: true as const,
        local: !useSharedState(),
        serverNow: ctx.now,
        revision: ctx.state.revision,
        memory: process.memoryUsage(),
        booths: sizes,
      }),
    };
  });
}

export function parseBooth(value: unknown): BoothId | null {
  return typeof value === "string" && isBoothId(value) ? value : null;
}

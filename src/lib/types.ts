import type { BoothId } from "./booths";

export type Employee = {
  code: string;
  boothId: BoothId;
  name: string;
  department: string;
  years: number;
  photo: string;
};

export type Spotlight = {
  code: string;
  ticket: string;
  clientId: string;
  startedAt: number;
  endsAt: number;
};

export type QueueItem = {
  code: string;
  ticket: string;
  clientId: string;
  enqueuedAt: number;
};

export type BoothLive = {
  spotlight: Spotlight | null;
  queue: QueueItem[];
  cooldowns: Record<string, number>;
};

export type LiveState = {
  revision: number;
  booths: Record<BoothId, BoothLive>;
};

export type PublicSpotlight = {
  code: string;
  name: string;
  department: string;
  years: number;
  photo: string;
  startedAt: number;
  endsAt: number;
  minHoldUntil: number;
  waitingBehind: number;
};

export type PublicQueueItem = {
  code: string;
  name: string;
  photo: string;
  position: number;
  worstCaseEndsAt: number;
};

export type PublicSnapshot = {
  boothId: BoothId;
  revision: number;
  label: string;
  title: string;
  mode: "loop" | "spotlight";
  serverNow: number;
  spotlight: PublicSpotlight | null;
  queue: PublicQueueItem[];
};

export type RosterCard = {
  code: string;
  photo: string;
};

export type CheckinStatus = "unknown" | "wrong_booth" | "cooldown" | "spotlight" | "queued" | "idle";

export type CheckinResult = {
  status: CheckinStatus;
  message: string;
  canControl: boolean;
  ticket?: string;
  code?: string;
  name?: string;
  position?: number;
  worstCaseEndsAt?: number;
  cooldownUntil?: number;
  correctBoothId?: BoothId;
  correctBoothLabel?: string;
  minHoldUntil?: number;
  waitingBehind?: number;
};

export type CheckinResponse = CheckinResult & { snapshot: PublicSnapshot };

export type ActionResult = {
  ok: boolean;
  message: string;
  error?: "too_soon" | "forbidden" | "idle";
  minHoldUntil?: number;
};

export type ActionResponse = ActionResult & { snapshot: PublicSnapshot };

export type StaffCooldown = {
  code: string;
  name: string;
  until: number;
};

export type StaffBooth = {
  snapshot: PublicSnapshot;
  cooldowns: StaffCooldown[];
};

export type StaffPayload = {
  booths: Record<BoothId, StaffBooth>;
  serverNow: number;
};

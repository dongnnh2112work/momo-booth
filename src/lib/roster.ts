import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { BOOTH_IDS, isBoothId, type BoothId } from "./booths";
import { normalizeCode } from "./codes";
import type { Employee } from "./types";

export type RosterIndex = {
  byCode: Map<string, Employee>;
  byBooth: Record<BoothId, Employee[]>;
};

const PUBLIC_ROOT = path.resolve(process.cwd(), "public");

function portraitVersion(url: string): string {
  if (!url.startsWith("/") || url.startsWith("//")) return url;
  const pathname = url.split(/[?#]/, 1)[0];
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return url;
  }
  const relative = decoded.replace(/^\/+/, "");
  if (!relative || relative.split("/").some((part) => part === "..")) return url;
  const filePath = path.resolve(PUBLIC_ROOT, relative);
  if (filePath !== PUBLIC_ROOT && !filePath.startsWith(`${PUBLIC_ROOT}${path.sep}`)) return url;
  try {
    const hash = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").slice(0, 12);
    return `${pathname}?v=${hash}`;
  } catch {
    return url;
  }
}

export function indexRoster(employees: Employee[]): RosterIndex {
  const byCode = new Map<string, Employee>();
  const byBooth = {} as Record<BoothId, Employee[]>;
  for (const id of BOOTH_IDS) byBooth[id] = [];
  for (const employee of employees) {
    if (!isBoothId(employee.boothId)) continue;
    if (!employee.name || !employee.department || !employee.photo) continue;
    if (!Number.isFinite(employee.years)) continue;
    const code = normalizeCode(employee.code);
    if (!code || byCode.has(code)) continue;
    const clean: Employee = {
      ...employee,
      code,
      photo: portraitVersion(employee.photo),
      thumb: employee.thumb ? portraitVersion(employee.thumb) : employee.thumb,
    };
    byCode.set(code, clean);
    byBooth[clean.boothId].push(clean);
  }
  return { byCode, byBooth };
}

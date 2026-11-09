import { isBoothId, type BoothId } from "./booths";
import { normalizeCode } from "./codes";
import type { Employee } from "./types";

export type RosterIndex = {
  byCode: Map<string, Employee>;
  byBooth: Record<BoothId, Employee[]>;
};

export function indexRoster(employees: Employee[]): RosterIndex {
  const byCode = new Map<string, Employee>();
  const byBooth: Record<BoothId, Employee[]> = { "5-10": [], "3-5": [] };
  for (const employee of employees) {
    if (!isBoothId(employee.boothId)) continue;
    if (!employee.name || !employee.department || !employee.photo) continue;
    if (!Number.isFinite(employee.years)) continue;
    const code = normalizeCode(employee.code);
    if (!code || byCode.has(code)) continue;
    const clean: Employee = { ...employee, code };
    byCode.set(code, clean);
    byBooth[clean.boothId].push(clean);
  }
  return { byCode, byBooth };
}

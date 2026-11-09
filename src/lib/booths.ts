export const BOOTH_IDS = ["5-10", "3-5"] as const;

export type BoothId = (typeof BOOTH_IDS)[number];

export const BOOTHS: Record<
  BoothId,
  { id: BoothId; label: string; title: string; blurb: string; sample: string }
> = {
  "5-10": {
    id: "5-10",
    label: "5–10 năm",
    title: "5–10 năm cùng MoMo",
    blurb: "Vinh danh nhân sự gắn bó từ 5 đến 10 năm",
    sample: "A01–A16",
  },
  "3-5": {
    id: "3-5",
    label: "3–5 năm",
    title: "3–5 năm cùng MoMo",
    blurb: "Vinh danh nhân sự gắn bó từ 3 đến 5 năm",
    sample: "B01–B16",
  },
};

export function isBoothId(value: string): value is BoothId {
  return value === "5-10" || value === "3-5";
}

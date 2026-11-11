// Client-safe booth types and built-in defaults. No Node APIs.

export type BoothId = string;

export type Booth = {
  id: BoothId;
  label: string;
  title: string;
  blurb: string;
  sample: string;
};

export const DEFAULT_BOOTHS: Booth[] = [
  {
    id: "5-10",
    label: "5–10 năm",
    title: "5–10 năm cùng MoMo",
    blurb: "Vinh danh nhân sự gắn bó từ 5 đến 10 năm",
    sample: "A01–A16",
  },
  {
    id: "3-5",
    label: "3–5 năm",
    title: "3–5 năm cùng MoMo",
    blurb: "Vinh danh nhân sự gắn bó từ 3 đến 5 năm",
    sample: "B01–B16",
  },
];

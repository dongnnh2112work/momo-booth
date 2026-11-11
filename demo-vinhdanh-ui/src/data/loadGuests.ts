export type Guest = {
  code: string;
  boothId: string;
  name: string;
  department: string;
  joinYear: number;
  years: number;
  tag: string;
  stat1Value: string;
  stat1Label: string;
  stat2Value: string;
  stat2Label: string;
  stat3Value: string;
  stat3Label: string;
  photoUrl: string;
};

const PHOTO_URL = "/portraits/placeholder.png";

export async function loadGuests(): Promise<Guest[]> {
  const res = await fetch("/data/mock.csv");
  if (!res.ok) {
    throw new Error(`Failed to load guests: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  const lines = text.split(/\r?\n/);
  const guests: Guest[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const [
      code,
      boothId,
      name,
      department,
      joinYear,
      years,
      tag,
      stat1Value,
      stat1Label,
      stat2Value,
      stat2Label,
      stat3Value,
      stat3Label,
    ] = line.split(",");

    guests.push({
      code: code.trim(),
      boothId: boothId.trim(),
      name: name.trim(),
      department: department.trim(),
      joinYear: Number(joinYear),
      years: Number(years),
      tag: tag.trim(),
      stat1Value: stat1Value.trim(),
      stat1Label: stat1Label.trim(),
      stat2Value: stat2Value.trim(),
      stat2Label: stat2Label.trim(),
      stat3Value: stat3Value.trim(),
      stat3Label: stat3Label.trim(),
      photoUrl: PHOTO_URL,
    });
  }

  return guests;
}

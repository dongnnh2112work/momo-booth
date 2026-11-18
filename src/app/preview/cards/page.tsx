import { CardSheet } from "@/components/CardSheet";
import { BOOTH_IDS } from "@/lib/booths";
import { getBooth } from "@/lib/store";
import type { RosterCard } from "@/lib/types";

export const dynamic = "force-dynamic";

// Review sheet for the honor card: every person in the roster, or one card at
// a fixed pixel width (?code=…&w=2126) to compare against the PSD export.
export default async function Page({ searchParams }: { searchParams: Promise<{ code?: string; w?: string }> }) {
  const { code, w } = await searchParams;
  const people: RosterCard[] = [];
  for (const id of BOOTH_IDS) {
    const { roster } = await getBooth(id);
    people.push(...roster);
  }
  const wanted = code?.trim().toUpperCase();
  const asked = Number(w);
  const width = Number.isFinite(asked) && asked > 0 ? Math.min(2400, Math.max(120, asked)) : undefined;
  return <CardSheet people={wanted ? people.filter((p) => p.code === wanted) : people} width={width} />;
}

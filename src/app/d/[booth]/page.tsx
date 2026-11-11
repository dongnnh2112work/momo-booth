import { notFound } from "next/navigation";

import { DisplayStage } from "@/components/DisplayStage";
import { BOOTHS, isBoothId } from "@/lib/booths";

export default async function Page({ params }: { params: Promise<{ booth: string }> }) {
  const { booth } = await params;
  if (!isBoothId(booth)) notFound();
  const meta = BOOTHS[booth];
  return <DisplayStage boothId={booth} label={meta.label} title={meta.title} />;
}

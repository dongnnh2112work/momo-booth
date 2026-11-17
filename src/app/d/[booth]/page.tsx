import { notFound } from "next/navigation";

import { DisplayStage } from "@/components/DisplayStage";
import { BOOTHS, isBoothId } from "@/lib/booths";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ booth: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const { booth } = await params;
  const { demo } = await searchParams;
  if (!isBoothId(booth)) notFound();
  const meta = BOOTHS[booth];
  return <DisplayStage boothId={booth} label={meta.label} title={meta.title} previewSlide={demo !== "off"} />;
}

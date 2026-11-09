import { notFound } from "next/navigation";

import { DisplayStage } from "@/components/DisplayStage";
import { isBoothId } from "@/lib/booths";

export default async function Page({ params }: { params: Promise<{ booth: string }> }) {
  const { booth } = await params;
  if (!isBoothId(booth)) notFound();
  return <DisplayStage boothId={booth} />;
}

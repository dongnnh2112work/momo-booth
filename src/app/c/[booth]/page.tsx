import { notFound } from "next/navigation";

import { CheckinApp } from "@/components/CheckinApp";
import { BOOTHS, isBoothId } from "@/lib/booths";

export default async function Page({ params }: { params: Promise<{ booth: string }> }) {
  const { booth } = await params;
  if (!isBoothId(booth)) notFound();
  const meta = BOOTHS[booth];
  return <CheckinApp boothId={booth} label={meta.label} title={meta.title} />;
}

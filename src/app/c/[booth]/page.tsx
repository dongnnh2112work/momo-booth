import { notFound } from "next/navigation";

import { CheckinApp } from "@/components/CheckinApp";
import { isBoothId } from "@/lib/booths";

export default async function Page({ params }: { params: Promise<{ booth: string }> }) {
  const { booth } = await params;
  if (!isBoothId(booth)) notFound();
  return <CheckinApp boothId={booth} />;
}

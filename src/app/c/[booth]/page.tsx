import { notFound } from "next/navigation";

import { CheckinApp } from "@/components/CheckinApp";
import { BOOTHS, isBoothId } from "@/lib/booths";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ booth: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { booth } = await params;
  const { k } = await searchParams;
  if (!isBoothId(booth)) notFound();
  const meta = BOOTHS[booth];
  return <CheckinApp boothId={booth} label={meta.label} title={meta.title} pass={typeof k === "string" ? k : ""} />;
}

import { CheckinApp } from "@/components/CheckinApp";

export default async function Page({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k } = await searchParams;
  return <CheckinApp label="Vinh danh" title="Check-in" shared pass={typeof k === "string" ? k : ""} />;
}

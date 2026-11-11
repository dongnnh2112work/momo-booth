import { StaffPanel } from "@/components/StaffPanel";
import { BOOTH_IDS } from "@/lib/booths";

export default function Page() {
  return <StaffPanel boothIds={[...BOOTH_IDS]} />;
}

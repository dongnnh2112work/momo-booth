import { CheckinApp } from "@/components/CheckinApp";

// Opened from the printed QR next to the booth. Old links with ?k= still work.
export default function Page() {
  return <CheckinApp label="Vinh danh" title="Check-in" shared />;
}

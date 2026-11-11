import { SetupHome } from "@/components/SetupHome";
import { BOOTH_IDS, BOOTHS } from "@/lib/booths";

export default function Page() {
  const booths = BOOTH_IDS.map((id) => BOOTHS[id]);
  // PUBLIC_BASE_URL is not inlined into client bundles. Pass both names through;
  // publicBaseUrl() prefers PUBLIC_BASE_URL, then NEXT_PUBLIC_BASE_URL.
  return (
    <SetupHome
      booths={booths}
      baseEnv={{
        PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
        NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
      }}
    />
  );
}

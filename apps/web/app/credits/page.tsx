import { Suspense } from "react";
import { ManualCredits } from "./manual";
export default function CreditsPage() {
  return (
    <Suspense fallback={<p>Loading credits…</p>}>
      <ManualCredits />
    </Suspense>
  );
}

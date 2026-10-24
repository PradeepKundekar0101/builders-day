import { Suspense } from "react";
import BuildRun from "@/components/prompt-studio/build-run";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading build…</p>}>
      <BuildRun />
    </Suspense>
  );
}

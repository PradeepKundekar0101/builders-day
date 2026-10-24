import { Suspense } from "react";
import { PromptStudio } from "@/components/prompt-studio/studio";
export const metadata = { title: "Prompt Studio - Buildwise" };
export default function Page() {
  return (
    <Suspense fallback={<p className="p-8">Loading Prompt Studio…</p>}>
      <PromptStudio />
    </Suspense>
  );
}

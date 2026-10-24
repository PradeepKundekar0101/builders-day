import { Inter } from "next/font/google";
import "@/components/prompt-studio/studio.css";
import { Suspense } from "react";
import { PromptStudio } from "@/components/prompt-studio/studio";
const inter = Inter({ variable: "--font-studio", subsets: ["latin"], style: ["normal", "italic"] });
export const metadata = { title: "Prompt Studio demo - PROVN" };
export default function Page() {
  return (
    <Suspense fallback={<p className="p-8">Loading Prompt Studio…</p>}>
      <div className={inter.variable}>
        <PromptStudio demo />
      </div>
    </Suspense>
  );
}

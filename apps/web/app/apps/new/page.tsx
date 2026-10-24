import { Inter } from "next/font/google";
import "@/components/prompt-studio/studio.css";
import { Suspense } from "react";
import { ConnectedStudio } from "@/components/prompt-studio/connected-studio";
const inter = Inter({ variable: "--font-studio", subsets: ["latin"], style: ["normal", "italic"] });
export const metadata = { title: "Prompt Studio - PROVN" };
export default function Page() {
  return (
    <Suspense fallback={<p className="p-8">Loading Prompt Studio…</p>}>
      <div className={inter.variable}>
        <ConnectedStudio />
      </div>
    </Suspense>
  );
}

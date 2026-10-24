import type { Metadata } from "next";
import { DemoStudio } from "./demo-studio";

export const metadata: Metadata = {
  title: "Build demo - PROVN",
  description:
    "Describe an idea, see the cost and time, watch it build, then attack it. A simulation.",
};

export default function DemoPage() {
  return <DemoStudio />;
}

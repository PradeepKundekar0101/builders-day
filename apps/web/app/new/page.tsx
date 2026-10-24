import type { Metadata } from "next";
import { IdeaForm } from "./idea-form";

export const metadata: Metadata = { title: "Describe your idea - PROVN" };

export default function NewIdeaPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Describe your idea</h1>
      <p className="mt-2 text-slate">
        Say who it is for and what they do with it. Plain words are fine; we ask if anything is
        unclear.
      </p>
      <IdeaForm />
    </div>
  );
}

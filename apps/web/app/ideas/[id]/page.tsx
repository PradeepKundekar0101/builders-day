import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { isUuid } from "@/lib/server/ids";
import { intakeService } from "@/lib/server/intake/instance";
import { IntakeError } from "@/lib/server/intake/service";
import { sessionUser } from "@/lib/server/session-user";
import { IntakeView } from "./intake-view";

export const metadata: Metadata = { title: "Your estimate - PROVN" };

export default function IdeaPage({ params }: PageProps<"/ideas/[id]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Idea params={params} />
    </Suspense>
  );
}

async function Idea({ params }: Pick<PageProps<"/ideas/[id]">, "params">) {
  const { id } = await params;
  const user = await sessionUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/ideas/${id}`)}`);
  if (!isUuid(id)) notFound();
  const view = await intakeService()
    .ideaView(user.id, id)
    .catch((error: unknown) => {
      if (error instanceof IntakeError && error.code === "not_found") return null;
      throw error;
    });
  if (!view) notFound();
  return <IntakeView initial={view} />;
}

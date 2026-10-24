"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PromptStudio } from "./studio";
import { BuildFeedSchema, pollingBuildConnection } from "@/lib/prompt-studio/build-polling";
import type { StudioBuildConnection } from "@/lib/prompt-studio/build-events";

export function ConnectedStudio() {
  const params = useSearchParams();
  const run = params.get("build"),
    session = params.get("session");
  const key = `${run}:${session}`;
  const [state, setState] = useState<{
    key: string;
    connection?: StudioBuildConnection;
    error?: string;
  }>();
  useEffect(() => {
    if (!run) return;
    const controller = new AbortController();
    async function connect() {
      try {
        if (!session) throw new Error("Open this build from its saved Prompt Studio draft.");
        const response = await fetch(
          `/api/prompt-studio/builds/${encodeURIComponent(run!)}?session=${encodeURIComponent(session)}&stage=0`,
          { signal: controller.signal, cache: "no-store" },
        );
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Build connection unavailable.");
        const feed = BuildFeedSchema.parse(body);
        if (feed.runId !== run) throw new Error("Build does not match.");
        setState({
          key,
          connection: pollingBuildConnection(run, session, feed.allowedPreviewOrigins),
        });
      } catch (e) {
        if (!controller.signal.aborted)
          setState({
            key,
            error: e instanceof Error ? e.message : "Build connection unavailable.",
          });
      }
    }
    void connect();
    return () => controller.abort();
  }, [key, run, session]);
  if (!run) return <PromptStudio />;
  if (state?.key !== key)
    return (
      <p role="status" className="p-8">
        Connecting to your build…
      </p>
    );
  if (state.error)
    return (
      <p role="alert" className="p-8">
        {state.error} Your saved draft is preserved.{" "}
        <a href={`/apps/new?session=${encodeURIComponent(session ?? "")}`}>Return to draft</a>
      </p>
    );
  return (
    <>
      <p className="p-4" role="status">
        Connected to an existing build. Brief edits do not change its approved scope or start a new
        build.
      </p>
      <PromptStudio key={key} buildConnection={state.connection} />
    </>
  );
}

import { randomUUID } from "node:crypto";
import { estimateSpec, SelectionSchema, catalog } from "@buildwise/estimator";
import { creditsToUnits, usdToMicros } from "@buildwise/cost-guard";
import { guard, store, wallet } from "../../../lib/session";
import { fixture, specRevision } from "../../../fixture";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development")
    return Response.json({ error: "Local development demo only" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && !["http://127.0.0.1:3210", "http://localhost:3210"].includes(origin))
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const body = await request.json();
    let id = String(body.id),
      message = "";
    if (body.action === "lock") {
      const quote = estimateSpec({
        spec: fixture,
        specRevision,
        selection: SelectionSchema.parse(body.selection),
        billingMode: body.billingMode === "byok" ? "byok" : "managed",
      });
      id = randomUUID();
      await wallet.execute(id, {
        type: "allowance",
        id: "allowance",
        period: new Date().toISOString().slice(0, 7),
        plan: body.plan === "free" ? "free" : "builder",
      });
      await wallet.execute(id, {
        type: "quote",
        id: "quote",
        runId: id,
        specRevision,
        capUnits: creditsToUnits(quote.costCredits),
        category: "build",
      });
      store.create(id, usdToMicros(quote.modelBudgetUsd));
      message =
        "Server quote locked. Approval and sufficient wallet credits are required before starting.";
    } else {
      const current = await wallet.status(id),
        run = current.runs.find((r) => r.id === id);
      if (!run) throw new Error("Unknown demo run");
      const commandId = randomUUID();
      if (body.action === "approve") {
        if (run.phase === "awaiting_approval")
          await wallet.execute(id, {
            type: "approve",
            id: commandId,
            runId: id,
            capUnits: run.capUnits,
            actorId: "demo-owner",
          });
        const result = await wallet.execute(id, { type: "start", id: randomUUID(), runId: id });
        message = result.allowed
          ? "Credits reserved. Build authorized within the quoted cap."
          : result.reason === "insufficient_credits"
            ? "Not enough credits for this quote. Choose a smaller scope or a funded plan."
            : "This run cannot start in its current state.";
      } else if (body.action === "turn" || body.action === "fail") {
        const started = await wallet.execute(id, {
          type: "beginAttempt",
          id: commandId,
          runId: id,
          attemptId: commandId,
        });
        if (!started.allowed)
          message =
            "Attempt paused. Resolve pending usage or approve a bounded retry before continuing.";
        else {
          const reservation = await guard.execute(id, {
            type: "reserve",
            id: commandId,
            taskId: "demo-attempt",
            maxMicros: 900000,
          });
          if (!reservation.allowed) {
            await wallet.execute(id, {
              type: "reportAttempt",
              id: randomUUID(),
              runId: id,
              attemptId: commandId,
              success: false,
              failureFingerprint: "provider_budget",
            });
            message = "Provider budget prevented the call. No spending occurred.";
          } else {
            const call = await guard.execute(id, { type: "start", id: commandId });
            if (!call.allowed) throw new Error("Call already claimed");
            await guard.execute(id, {
              type: "reconcile",
              id: commandId,
              actualMicros: 650000,
              inputTokens: 80000,
              outputTokens: 28333,
              pricingVersion: "demo-simulated-usage",
            });
            const result = await wallet.execute(id, {
              type: "reportAttempt",
              id: randomUUID(),
              runId: id,
              attemptId: commandId,
              success: body.action === "turn",
              ...(body.action === "fail" ? { failureFingerprint: "same-validation-error" } : {}),
            });
            message = `Simulated provider usage: 65 credits. Run: ${result.runs[0]?.phase}.`;
          }
        }
      } else if (body.action === "resume") {
        await wallet.execute(id, {
          type: "resume",
          id: commandId,
          runId: id,
          actorId: "demo-owner",
          extraAttempts: 1,
        });
        message = "One extra attempt approved within the existing credit and provider caps.";
      } else if (body.action === "complete" || body.action === "platform_failure") {
        await wallet.execute(id, {
          type: "finish",
          id: commandId,
          runId: id,
          outcome: body.action === "complete" ? "success" : "platform_failure",
          chargeUnits: body.action === "complete" ? run.capUnits : 0,
          evidenceRef: "demo-confirmed-platform-evidence",
        });
        await guard.execute(id, { type: "stop", id: randomUUID() });
        message =
          body.action === "complete"
            ? "Simulated completion charged the agreed quote."
            : "Confirmed simulated platform failure: held customer credits returned. Provider expense is preserved.";
      } else if (body.action === "refund") {
        await wallet.execute(id, {
          type: "refund",
          id: commandId,
          runId: id,
          cause: "platform",
          evidenceRef: "demo-staff-confirmation",
          actorId: "demo-staff",
        });
        message =
          "Simulated staff refund recorded once. Original charge and provider expense remain in the audit history.";
      } else throw new Error("Unknown action");
    }
    return Response.json({
      id,
      status: await guard.status(id),
      wallet: await wallet.status(id),
      message,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}
export async function GET() {
  return Response.json({ features: catalog(fixture), specRevision });
}

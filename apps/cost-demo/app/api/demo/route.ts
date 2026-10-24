import { randomUUID } from "node:crypto";
import { estimate, SelectionSchema, catalog } from "@buildwise/estimator";
import { usdToMicros } from "@buildwise/cost-guard";
import { guard, store } from "../../../lib/session";
import { fixture, specRevision } from "../../../fixture";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development")
    return Response.json({ error: "Local development demo only" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && !["http://127.0.0.1:3210", "http://localhost:3210"].includes(origin))
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const body = await request.json();
    if (body.action === "lock") {
      const quote = estimate({
        spec: fixture,
        specRevision,
        selection: SelectionSchema.parse(body.selection),
      });
      const id = randomUUID();
      store.create(id, usdToMicros(quote.modelBudgetUsd));
      return Response.json({ id, quote, status: await guard.status(id) });
    }
    const id = String(body.id);
    if (body.action === "turn") {
      const callId = randomUUID(),
        maxMicros = 900000;
      const reservation = await guard.execute(id, {
        type: "reserve",
        id: callId,
        taskId: "simulated-generation",
        maxMicros,
      });
      if (!reservation.allowed)
        return Response.json({
          status: reservation,
          message: "Paused before the next model call. No spending occurred.",
        });
      const started = await guard.execute(id, { type: "start", id: callId });
      if (!started.allowed)
        return Response.json({ status: started, message: "Call was not started." });
      const status = await guard.execute(id, {
        type: "reconcile",
        id: callId,
        actualMicros: 650000,
        inputTokens: 80000,
        outputTokens: 28333,
        pricingVersion: "demo-simulated-usage",
      });
      return Response.json({
        status,
        message: "Simulated call used $0.65; $0.25 of the reservation was released.",
      });
    }
    if (body.action === "approve") {
      const current = await guard.status(id);
      return Response.json({
        status: await guard.execute(id, {
          type: "approve",
          id: randomUUID(),
          actorId: "00000000-0000-4000-8000-000000000001",
          newCapMicros: current.capMicros + 1000000,
        }),
        message: "Demo approval recorded: cap increased by exactly $1.00.",
      });
    }
    if (body.action === "stop")
      return Response.json({
        status: await guard.execute(id, { type: "stop", id: randomUUID() }),
        message: "Stopped. This demo does not issue refunds.",
      });
    if (body.action === "concurrent") {
      const outcomes = await Promise.all(
        [1, 2].map((i) =>
          guard.execute(id, {
            type: "reserve",
            id: randomUUID(),
            taskId: `parallel-${i}`,
            maxMicros: 1500000,
          }),
        ),
      );
      return Response.json({
        status: await guard.status(id),
        message: `${outcomes.filter((o) => o.allowed).length} of 2 concurrent $1.50 reservations authorized. Pending reservations remain held.`,
      });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
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

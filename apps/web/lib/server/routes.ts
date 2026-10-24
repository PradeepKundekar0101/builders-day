import "server-only";
import { NextResponse } from "next/server";
import { serverEnv } from "./env";
import { bearerMatches, errorResponse, isSameOrigin } from "./http";
import { sessionUser, type SessionUser } from "./session-user";

type Params = Record<string, string>;
type Context<P extends Params> = { params: Promise<P> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids in our URLs are UUIDs; anything else cannot exist, so answer 404 before touching the database. */
async function validParams<P extends Params>(context: Context<P>): Promise<P | null> {
  const params = await context.params;
  return Object.values(params).every((value) => UUID.test(value)) ? params : null;
}

const notFound = () =>
  NextResponse.json({ error: "not_found", message: "Not found." }, { status: 404 });

/** Route handler for signed-in users; mutating requests must come from our own pages. */
export function userRoute<P extends Params>(
  handler: (request: Request, user: SessionUser, params: P) => Promise<Response>,
  options: { staffOnly?: boolean } = {},
) {
  return async (request: Request, context: Context<P>) => {
    try {
      if (request.method !== "GET" && !isSameOrigin(request)) {
        return NextResponse.json(
          { error: "forbidden", message: "Cross-site request refused." },
          { status: 403 },
        );
      }
      const user = await sessionUser();
      if (!user) {
        return NextResponse.json(
          { error: "unauthorized", message: "Sign in first." },
          { status: 401 },
        );
      }
      if (options.staffOnly && !user.staff) return notFound();
      const params = await validParams(context);
      if (!params) return notFound();
      return await handler(request, user, params);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** Route handler for the intake agent, authenticated by the shared bearer token. */
export function agentRoute<P extends Params>(
  handler: (request: Request, params: P) => Promise<Response>,
) {
  return async (request: Request, context: Context<P>) => {
    try {
      if (!bearerMatches(request.headers.get("authorization"), serverEnv().agentApiToken)) {
        return NextResponse.json(
          { error: "unauthorized", message: "Bad agent token." },
          { status: 401 },
        );
      }
      const params = await validParams(context);
      if (!params) return notFound();
      return await handler(request, params);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

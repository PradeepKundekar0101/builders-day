import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { IntakeError, type IntakeErrorCode } from "./intake/service";

const STATUS: Record<IntakeErrorCode, number> = {
  invalid_idea: 400,
  invalid_selection: 400,
  not_found: 404,
  question_limit: 409,
  wrong_state: 409,
  invalid_spec: 422,
};

/** Turns a thrown error into a JSON response that never exposes internals. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof IntakeError) {
    return NextResponse.json(
      {
        error: error.code,
        message: error.message,
        ...(error.issues ? { issues: error.issues } : {}),
      },
      { status: STATUS[error.code] },
    );
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "bad_request", message: "The request is invalid." },
      { status: 400 },
    );
  }
  console.error(error);
  return NextResponse.json(
    { error: "internal", message: "Something went wrong. Try again." },
    { status: 500 },
  );
}

/** Constant-time check of an `Authorization: Bearer <token>` header. */
export function bearerMatches(header: string | null, token: string): boolean {
  const presented = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Browsers send Origin on every POST, PATCH and DELETE; another site's form cannot fake ours. */
export function isSameOrigin(request: Request): boolean {
  return request.headers.get("origin") === new URL(request.url).origin;
}

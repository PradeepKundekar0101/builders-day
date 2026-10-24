export function paymentError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const status =
    message === "UNAUTHENTICATED"
      ? 401
      : message === "INVALID_ORIGIN"
        ? 403
        : message === "NOT_FOUND"
          ? 404
          : message === "PAYMENTS_UNAVAILABLE"
            ? 503
            : 400;
  return Response.json(
    {
      error:
        status === 401
          ? "Please sign in to buy credits."
          : status === 503
            ? "Payments are not available yet. Please try again later."
            : "We could not confirm this request. If you paid, do not pay again. Check payment status shortly.",
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function PageLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div aria-hidden="true" className="h-8 w-48 animate-pulse rounded-md bg-rule/60" />
      <div aria-hidden="true" className="mt-6 h-32 animate-pulse rounded-xl bg-rule/40" />
    </div>
  );
}

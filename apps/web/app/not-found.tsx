import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-20 text-center sm:px-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Page not found</h1>
      <p className="mt-3 text-slate">
        The link may be wrong, or this page belongs to someone else.
      </p>
      <Link
        href="/apps"
        className="mt-8 inline-flex h-11 items-center rounded-lg bg-go px-5 font-semibold text-white hover:bg-go-hover"
      >
        Go to My apps
      </Link>
    </div>
  );
}

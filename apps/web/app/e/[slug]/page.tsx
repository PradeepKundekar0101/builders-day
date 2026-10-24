import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { hoursText, usd } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Shared = {
  name: string;
  summary: string;
  cost_usd: number;
  low_usd: number;
  high_usd: number;
  hours: number;
};

async function load(slug: string): Promise<Shared | null> {
  if (!/^[\w-]{6,64}$/.test(slug)) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("shared_estimate", { p_slug: slug });
  return (data as Shared | null) ?? null;
}

export const metadata: Metadata = {
  title: "Shared estimate - Buildwise",
  robots: { index: false },
};

export default function SharedEstimatePage({ params }: PageProps<"/e/[slug]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <SharedEstimate params={params} />
    </Suspense>
  );
}

async function SharedEstimate({ params }: Pick<PageProps<"/e/[slug]">, "params">) {
  const shared = await load((await params).slug);
  if (!shared) notFound();

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
      <div className="rounded-xl border border-rule bg-surface p-6 shadow-[0_1px_0_var(--color-rule),0_12px_32px_-16px_rgb(19_32_58/0.25)]">
        <p className="text-sm text-slate">Buildwise estimate</p>
        <h1 className="mt-1 text-2xl font-bold">{shared.name}</h1>
        <p className="mt-1 text-slate">{shared.summary}</p>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-dashed border-rule pt-5">
          <div>
            <p className="text-sm text-slate">Estimated price (approximate)</p>
            <p className="mt-1 text-4xl font-extrabold">
              <span className="bg-marker px-1">{usd(shared.cost_usd)}</span>
            </p>
          </div>
          <p className="text-right text-sm text-slate">
            {hoursText(shared.hours)}
            <br />
            range {usd(shared.low_usd)} to {usd(shared.high_usd)}
          </p>
        </div>
      </div>
      <p className="mt-6 text-center text-slate">
        Have an idea of your own?{" "}
        <Link href="/new" className="font-semibold text-go underline-offset-4 hover:underline">
          Price it in a minute
        </Link>
      </p>
    </div>
  );
}

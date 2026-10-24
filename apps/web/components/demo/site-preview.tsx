"use client";

import type { CSSProperties } from "react";
import type { Plan } from "@/lib/demo/plan";
import { accentFor, SAMPLE } from "./sample-data";

const singular = (name: string) => name.replace(/ies$/, "y").replace(/s$/, "");

/** The "built" app: a realistic page rendered from the plan. A mock, not generated code. */
export function SitePreview({
  plan,
  page,
  onNavigate,
  revealed,
}: {
  plan: Plan;
  page: string;
  onNavigate: (page: string) => void;
  /** How many pages exist yet while the build runs. */
  revealed: number;
}) {
  const accent = accentFor(plan.name);
  const pages = plan.pages.slice(0, revealed);
  const style = { "--accent": accent } as CSSProperties;
  const first = plan.idea
    .split(/(?<=[.!?])\s/)[0]!
    .replace(
      /^\s*(?:i\s+(?:want|need|would like)\s+)?(?:to\s+)?(?:build|create|make|develop|design)\s+/i,
      "",
    )
    .replace(/^an?\s+/i, "");
  const tagline = first.charAt(0).toUpperCase() + first.slice(1);
  const highlights = [
    ...plan.entities.map((entity) => ({
      title: entity,
      body: `Browse and manage ${entity.toLowerCase()}`,
    })),
    ...(plan.features.some((f) => f.key === "auth")
      ? [{ title: "Your account", body: "Sign in with a one-time email link" }]
      : []),
    ...(plan.features.some((f) => f.key === "payments")
      ? [{ title: "Pay online", body: "Secure checkout with Pine Labs" }]
      : []),
  ].slice(0, 3);

  return (
    <div style={style} className="flex min-h-full flex-col bg-white font-sans text-[#111827]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e7eb] px-5 py-3">
        <span className="flex items-center gap-2 font-bold">
          <span className="h-6 w-6 rounded-md" style={{ background: accent }} aria-hidden="true" />
          {plan.name}
        </span>
        <nav aria-label="Preview pages" className="flex flex-wrap gap-1 text-sm">
          {pages.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onNavigate(name)}
              className={`rounded-md px-2.5 py-1 ${name === page ? "font-semibold text-white" : "text-[#4b5563] hover:bg-[#f3f4f6]"}`}
              style={name === page ? { background: accent } : undefined}
            >
              {name}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 px-5 py-6">
        {page === "Home" && (
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: accent }}>
              Welcome
            </p>
            <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{plan.name}</h1>
            <p className="mt-2 max-w-xl text-[#4b5563]">{tagline}</p>
            <button
              type="button"
              onClick={() => onNavigate(plan.entities[0] ?? "Home")}
              className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ background: accent }}
            >
              Get started
            </button>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {highlights.map((item) => (
                <div key={item.title} className="rounded-lg border border-[#e5e7eb] p-3">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs text-[#6b7280]">{item.body}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {plan.entities.includes(page) && (
          <section>
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-xl font-bold">{page}</h1>
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
                style={{ background: accent }}
              >
                + New {singular(page).toLowerCase()}
              </button>
            </div>
            <div className="mt-4 overflow-x-auto rounded-lg border border-[#e5e7eb]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f9fafb] text-[#6b7280]">
                  <tr>
                    {(SAMPLE[page] ?? SAMPLE.Notes!).columns.map((column) => (
                      <th key={column} className="px-3 py-2 font-medium">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(SAMPLE[page] ?? SAMPLE.Notes!).rows.map((row) => (
                    <tr key={row.join()} className="border-t border-[#f3f4f6]">
                      {row.map((cell, i) => (
                        <td key={i} className="px-3 py-2">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {page === "Sign in" && (
          <section className="mx-auto max-w-xs">
            <h1 className="text-xl font-bold">Sign in to {plan.name}</h1>
            <label className="mt-4 block text-sm font-medium">
              Email
              <input
                readOnly
                value="you@example.com"
                className="mt-1 h-10 w-full rounded-lg border border-[#d1d5db] px-3"
              />
            </label>
            <button
              type="button"
              className="mt-3 h-10 w-full rounded-lg text-sm font-semibold text-white"
              style={{ background: accent }}
            >
              Email me a sign-in link
            </button>
          </section>
        )}

        {page === "Checkout" && (
          <section className="mx-auto max-w-sm">
            <h1 className="text-xl font-bold">Checkout</h1>
            <div className="mt-4 rounded-lg border border-[#e5e7eb] p-4 text-sm">
              <p className="flex justify-between">
                <span>This week&apos;s order</span>
                <span>₹840</span>
              </p>
              <p className="mt-1 flex justify-between text-[#6b7280]">
                <span>Delivery</span>
                <span>₹40</span>
              </p>
              <p className="mt-3 flex justify-between border-t border-[#f3f4f6] pt-3 font-semibold">
                <span>Total</span>
                <span>₹880</span>
              </p>
            </div>
            <button
              type="button"
              className="mt-3 h-10 w-full rounded-lg text-sm font-semibold text-white"
              style={{ background: accent }}
            >
              Pay ₹880 with Pine Labs
            </button>
            <p className="mt-2 text-center text-xs text-[#6b7280]">Test mode · no money moves</p>
          </section>
        )}

        {page === "Dashboard" && (
          <section>
            <h1 className="text-xl font-bold">Dashboard</h1>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ["This week", "128"],
                ["Revenue", "₹42,300"],
                ["Repeat rate", "64%"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-[#e5e7eb] p-3">
                  <p className="text-xs text-[#6b7280]">{label}</p>
                  <p className="mt-1 text-xl font-bold">{value}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

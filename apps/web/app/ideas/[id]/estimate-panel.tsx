"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { estimate, FEATURES_V1, inputFromSelection, type Selection } from "@buildwise/estimator";
import type { IntegrationKind, Spec } from "@buildwise/shared";
import { hoursText, humanize, usd } from "@/lib/format";
import { publicEnv } from "@/lib/public-env";
import type { QuoteRecord } from "@/lib/server/intake/repo";

const SAVE_DELAY_MS = 400;

type Toggle = {
  id: string;
  label: string;
  detail: string;
  core: boolean;
  on: boolean;
  flip: (selection: Selection) => Selection;
};

const without = <T,>(list: T[], item: T) => list.filter((value) => value !== item);

function toggles(spec: Spec, selection: Selection): { heading: string; items: Toggle[] }[] {
  const flipName = (key: "pages" | "entities", name: string) => (s: Selection) => ({
    ...s,
    [key]: s[key].includes(name) ? without(s[key], name) : [...s[key], name],
  });
  const flipIntegration = (kind: IntegrationKind) => (s: Selection) => ({
    ...s,
    integrations: s.integrations.includes(kind)
      ? without(s.integrations, kind)
      : [...s.integrations, kind],
  });

  const groups = [
    {
      heading: "Pages",
      items: spec.pages.map((page) => ({
        id: `page-${page.name}`,
        label: page.name,
        detail: page.purpose,
        core: page.mustHave,
        on: selection.pages.includes(page.name),
        flip: flipName("pages", page.name),
      })),
    },
    {
      heading: "Data",
      items: spec.entities.map((entity) => ({
        id: `entity-${entity.name}`,
        label: humanize(entity.name),
        detail: `Form and list for ${entity.fields.map((f) => humanize(f.name).toLowerCase()).join(", ")}`,
        core: entity.mustHave,
        on: selection.entities.includes(entity.name),
        flip: flipName("entities", entity.name),
      })),
    },
    {
      heading: "Extras",
      items: [
        ...(spec.auth.enabled
          ? [
              {
                id: "auth",
                label: FEATURES_V1.auth.label,
                detail: "People sign in and see only their own records",
                core: true,
                on: selection.auth,
                flip: (s: Selection) => ({ ...s, auth: !s.auth }),
              },
            ]
          : []),
        ...spec.integrations.map((integration) => ({
          id: `integration-${integration.kind}`,
          label: FEATURES_V1[integration.kind].label,
          detail: integration.notes ?? "",
          core: integration.mustHave,
          on: selection.integrations.includes(integration.kind),
          flip: flipIntegration(integration.kind),
        })),
      ],
    },
  ];
  return groups.filter((group) => group.items.length > 0);
}

export function EstimatePanel({ spec, quote }: { spec: Spec; quote: QuoteRecord }) {
  const [selection, setSelection] = useState<Selection>(quote.selection);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const result = useMemo(() => estimate(inputFromSelection(spec, selection)), [spec, selection]);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  function change(next: Selection) {
    setSelection(next);
    setSaveState("saving");
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(async () => {
      const response = await fetch(`/api/quotes/${quote.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selection: next }),
      }).catch(() => null);
      setSaveState(response?.ok ? "saved" : "error");
    }, SAVE_DELAY_MS);
  }

  return (
    <section aria-labelledby="estimate-title">
      <div className="rounded-xl border border-rule bg-surface p-6 shadow-[0_1px_0_var(--color-rule),0_12px_32px_-16px_rgb(19_32_58/0.25)]">
        <h2 id="estimate-title" className="text-xl font-bold">
          {spec.name}
        </h2>
        <p className="mt-1 text-slate">{spec.summary}</p>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div aria-live="polite">
            <p className="text-sm text-slate">Estimated price (approximate)</p>
            <p className="mt-1 text-4xl font-extrabold" data-testid="price">
              <span className="bg-marker px-1 [box-decoration-break:clone]">
                {usd(result.costUsd)}
              </span>
            </p>
          </div>
          <p className="text-right text-sm text-slate">
            {hoursText(result.hours)}
            <br />
            range {usd(result.lowUsd)} to {usd(result.highUsd)}
          </p>
        </div>

        <dl className="mt-6 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 border-t border-dashed border-rule pt-4 text-sm">
          {result.drivers.map((driver) => (
            <div key={driver.key} className="contents">
              <dt className="text-slate">{driver.label}</dt>
              <dd className="text-right tabular-nums">{usd(driver.usd)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-8 flex items-baseline justify-between gap-4">
        <h3 className="text-lg font-bold">What we would build</h3>
        <p className="text-sm text-slate" role="status">
          {saveState === "saving"
            ? "Saving"
            : saveState === "error"
              ? "Not saved, try again"
              : "Saved"}
        </p>
      </div>
      <p className="mt-1 text-sm text-slate">
        Switch extras off to fit your budget. The price updates as you go.
      </p>

      {toggles(spec, selection).map((group) => (
        <fieldset key={group.heading} className="mt-6">
          <legend className="text-sm font-semibold uppercase tracking-wide text-slate">
            {group.heading}
          </legend>
          <ul className="mt-2 divide-y divide-rule rounded-xl border border-rule bg-surface">
            {group.items.map((item) => (
              <li key={item.id}>
                <label className="flex cursor-pointer items-start gap-3 p-4 hover:bg-paper">
                  <input
                    type="checkbox"
                    checked={item.on}
                    onChange={() => change(item.flip(selection))}
                    className="mt-1 h-5 w-5 shrink-0 accent-go"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {item.label}
                      {item.core && (
                        <span className="rounded bg-paper px-1.5 py-0.5 text-xs font-medium text-slate">
                          Core
                        </span>
                      )}
                    </span>
                    {item.detail && (
                      <span className="mt-0.5 block text-sm text-slate">{item.detail}</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ))}

      <ShareLink slug={quote.shareSlug} />
    </section>
  );
}

function ShareLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${publicEnv.siteUrl}/e/${slug}`;

  async function copy() {
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mt-8 rounded-xl border border-dashed border-rule p-4">
      <p className="text-sm font-medium">Share this estimate</p>
      <p className="mt-0.5 text-sm text-slate">
        The link shows the name and the price, not your idea or answers.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          readOnly
          aria-label="Share link"
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-lg border border-rule bg-surface px-3 text-sm"
        />
        <button
          type="button"
          onClick={copy}
          className="h-10 shrink-0 rounded-lg border border-rule bg-surface px-4 text-sm font-semibold hover:border-ink"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

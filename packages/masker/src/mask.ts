import { DETECTORS, type Kind } from "./detectors";

/** Placeholder to original value. Stored encrypted server-side, never sent to a model. */
export type MaskMap = Record<string, string>;

const PLACEHOLDER = /\{\{(SECRET|PII_[A-Z]+)_(\d+)\}\}/g;

/** Replaces secrets and personal data with stable placeholders like {{PII_EMAIL_1}}. */
export function mask(text: string, existing: MaskMap = {}): { text: string; map: MaskMap } {
  const map: MaskMap = { ...existing };
  const byValue = new Map(Object.entries(map).map(([placeholder, value]) => [value, placeholder]));
  const counters = new Map<Kind, number>();
  for (const placeholder of Object.keys(map)) {
    const [, kind, n] = /\{\{(.+)_(\d+)\}\}/.exec(placeholder) ?? [];
    if (kind && n) counters.set(kind as Kind, Math.max(counters.get(kind as Kind) ?? 0, Number(n)));
  }

  const placeholderFor = (kind: Kind, value: string) => {
    const known = byValue.get(value);
    if (known) return known;
    const n = (counters.get(kind) ?? 0) + 1;
    counters.set(kind, n);
    const placeholder = `{{${kind}_${n}}}`;
    map[placeholder] = value;
    byValue.set(value, placeholder);
    return placeholder;
  };

  let result = text;
  for (const detector of DETECTORS) {
    result = result.replace(detector.pattern, (match) =>
      detector.valid && !detector.valid(match) ? match : placeholderFor(detector.kind, match),
    );
  }
  return { text: result, map };
}

export function unmask(text: string, map: MaskMap): string {
  return text.replace(PLACEHOLDER, (placeholder) => map[placeholder] ?? placeholder);
}

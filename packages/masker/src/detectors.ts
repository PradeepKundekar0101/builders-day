import { luhnValid, verhoeffValid } from "./checksums";

export type Kind = "SECRET" | "PII_CARD" | "PII_AADHAAR" | "PII_PHONE" | "PII_EMAIL";

export type Detector = {
  kind: Kind;
  pattern: RegExp;
  /** Extra check on the matched text, for patterns that would otherwise catch ordinary numbers. */
  valid?: (match: string) => boolean;
};

const digitsOnly = (value: string) => value.replace(/\D/g, "");

/** Order matters: earlier detectors claim text before later, looser ones see it. */
export const DETECTORS: Detector[] = [
  { kind: "SECRET", pattern: /\beyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g },
  { kind: "SECRET", pattern: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { kind: "SECRET", pattern: /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { kind: "SECRET", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "SECRET", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}/g },
  { kind: "SECRET", pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}/g },
  { kind: "SECRET", pattern: /\bxox[abpr]-[A-Za-z0-9-]{10,}/g },
  { kind: "SECRET", pattern: /\bAIza[0-9A-Za-z_-]{35}/g },
  {
    kind: "SECRET",
    pattern:
      /(?<=\b(?:api[_-]?key|secret|token|password|passwd|access[_-]?key)\s*[:=]\s*["']?)[^\s"'{}]{12,}/gi,
  },
  {
    kind: "PII_CARD",
    pattern: /(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/g,
    valid: (match) => luhnValid(digitsOnly(match)),
  },
  {
    kind: "PII_AADHAAR",
    pattern: /(?<![\d-])[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}(?![\d-])/g,
    valid: (match) => verhoeffValid(digitsOnly(match)),
  },
  { kind: "PII_PHONE", pattern: /(?<![\w+])(?:\+91[ -]?)?[6-9]\d{4}[ -]?\d{5}(?!\d)/g },
  { kind: "PII_EMAIL", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
];

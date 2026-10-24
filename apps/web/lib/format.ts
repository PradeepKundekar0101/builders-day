const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const usd = (value: number) => dollars.format(value);

export function hoursText(hours: number): string {
  if (hours <= 0) return "no build time";
  if (hours < 1) return "under an hour";
  const low = Math.floor(hours);
  const high = Math.ceil(hours);
  if (low === high) return `about ${low} ${low === 1 ? "hour" : "hours"}`;
  return `about ${low} to ${high} hours`;
}

/** snake_case identifier to a sentence-case label. */
export function humanize(name: string): string {
  const words = name.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

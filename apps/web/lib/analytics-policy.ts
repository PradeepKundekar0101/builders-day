/** Keep auth codes, tokens, prompts and personal data out of analytics URLs. */
export function analyticsUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

export function sanitizeAnalyticsProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (
      /token|password|email|authorization|cookie|prompt|\$search|\$hash|utm_|gclid|fbclid|msclkid/i.test(
        key,
      )
    )
      continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = sanitizeAnalyticsProperties(value as Record<string, unknown>);
    } else if (typeof value === "string" && /url|referrer|href/i.test(key)) {
      result[key] = analyticsUrl(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function isAnalyticsHost(hostname: string, configuredHosts: string): boolean {
  return configuredHosts
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean)
    .includes(hostname);
}

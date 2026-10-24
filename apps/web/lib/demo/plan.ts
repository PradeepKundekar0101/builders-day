/** Mock planner for the /demo flow: plain words in, a priced plan out. Deterministic, no AI. */

export type FeatureKey =
  "pages" | "data" | "auth" | "payments" | "uploads" | "email" | "ai" | "admin";

export type PlanFeature = { key: FeatureKey; label: string; hours: number; usd: number };

export type Plan = {
  name: string;
  idea: string;
  pages: string[];
  entities: string[];
  features: PlanFeature[];
  deployUsd: number;
  costUsd: number;
  lowUsd: number;
  highUsd: number;
  hours: number;
};

/** Same pricing as the real estimator: margin 2 x tokens x $6 per million, plus $1 deploy. */
const USD_PER_TOKEN = 2 * (6 / 1_000_000);
const DEPLOY_USD = 1;
const RANGE = 0.3;

const EXTRAS: { key: FeatureKey; label: string; tokens: number; hours: number; words: RegExp }[] = [
  {
    key: "auth",
    label: "Sign-in and accounts",
    tokens: 40_000,
    hours: 0.5,
    words: /\b(sign[ -]?in|log ?in|account|members?)\b/i,
  },
  {
    key: "payments",
    label: "Online payments",
    tokens: 80_000,
    hours: 1,
    words: /\b(pay|payments?|checkout|subscri\w*|book and pay)\b/i,
  },
  {
    key: "uploads",
    label: "Photo and file uploads",
    tokens: 35_000,
    hours: 0.5,
    words: /\b(upload|photos?|images?|files?|documents?)\b/i,
  },
  {
    key: "email",
    label: "Email notifications",
    tokens: 30_000,
    hours: 0.5,
    words: /\b(e-?mails?|notif\w*|remind\w*)\b/i,
  },
  {
    key: "ai",
    label: "AI assistant",
    tokens: 50_000,
    hours: 0.75,
    words: /\b(ai|recommend\w*|summar\w*|chat ?bot|assistant)\b/i,
  },
  {
    key: "admin",
    label: "Admin dashboard",
    tokens: 70_000,
    hours: 1,
    words: /\b(admin|dashboard|reports?|analytics)\b/i,
  },
];

const NOUNS: [RegExp, string][] = [
  [/\borders?\b/i, "Orders"],
  [/\b(meals?|menus?)\b/i, "Meals"],
  [/\b(bookings?|reserv\w*|appointments?)\b/i, "Bookings"],
  [/\b(classes|class|sessions?|events?)\b/i, "Classes"],
  [/\b(products?|listings?|items?)\b/i, "Products"],
  [/\b(clients?|customers?)\b/i, "Clients"],
  [/\bprojects?\b/i, "Projects"],
  [/\bdesigns?\b/i, "Designs"],
  [/\b(tasks?|to-?dos?)\b/i, "Tasks"],
  [/\b(invoices?|bills?)\b/i, "Invoices"],
  [/\b(notes?|journal|entries)\b/i, "Notes"],
];

const round = (value: number) => Math.round(value * 100) / 100;
const titleCase = (words: string) =>
  words
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();

function appName(raw: string): string {
  const idea = raw.replace(
    /^\s*(?:i\s+(?:want|need|would like)\s+)?(?:to\s+)?(?:build|create|make|develop|design)\s+/i,
    "",
  );
  const match =
    /^\s*(?:an?|the)?\s*(?:simple\s+)?([a-z][a-z\s-]{2,40}?)\s+(?:for|where|that|to|which|so|with)\b/i.exec(
      idea,
    );
  const words = (match?.[1] ?? idea.split(/[.,]/)[0] ?? "My app")
    .split(/\s+/)
    .slice(0, 4)
    .join(" ");
  return titleCase(words);
}

export function planFromIdea(idea: string): Plan {
  // Customers and clients are people, not the main data, when something else is mentioned.
  const nouns = NOUNS.filter(([words]) => words.test(idea)).map(([, name]) => name);
  const things = nouns.filter((noun) => noun !== "Clients");
  const entities = (things.length ? things : nouns.length ? nouns : ["Notes"]).slice(0, 3);
  const extras = EXTRAS.filter((extra) => extra.words.test(idea));

  const pages = [
    "Home",
    ...entities,
    ...(extras.some((e) => e.key === "auth") ? ["Sign in"] : []),
    ...(extras.some((e) => e.key === "payments") ? ["Checkout"] : []),
    ...(extras.some((e) => e.key === "admin") ? ["Dashboard"] : []),
  ];

  const features: PlanFeature[] = [
    {
      key: "pages",
      label: `${pages.length} pages`,
      hours: pages.length * 0.25,
      usd: round(pages.length * 15_000 * USD_PER_TOKEN),
    },
    {
      key: "data",
      label: `${entities.length} data ${entities.length === 1 ? "type" : "types"} with forms and lists`,
      hours: entities.length * 0.75,
      usd: round(entities.length * 60_000 * USD_PER_TOKEN),
    },
    ...extras.map((extra) => ({
      key: extra.key,
      label: extra.label,
      hours: extra.hours,
      usd: round(extra.tokens * USD_PER_TOKEN),
    })),
  ];

  const costUsd = round(features.reduce((sum, f) => sum + f.usd, 0) + DEPLOY_USD);
  return {
    name: appName(idea),
    idea,
    pages,
    entities,
    features,
    deployUsd: DEPLOY_USD,
    costUsd,
    lowUsd: round(costUsd * (1 - RANGE)),
    highUsd: round(costUsd * (1 + RANGE)),
    hours: features.reduce((sum, f) => sum + f.hours, 0),
  };
}

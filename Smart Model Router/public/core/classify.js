// Heuristic task analysis: job category, effort (1-5), impact (1-5), PII.
// Deterministic and dependency-free so it runs in ~1 ms in the browser or on
// the server. The server can optionally replace the category/effort/impact
// with an LLM classification (see lib/llm-classifier.js) and keep the rest.

const CATEGORY_RULES = {
  commerce: [
    [
      /\b(payment|payments|pay ?out|checkout|refund|chargeback|invoice|billing|subscription|upi|wallet|emi)\b/i,
      3,
    ],
    [
      /\b(pine ?labs|plural|razorpay|stripe|paypal|cashfree|payu|gateway|pci|card ?(number|data)|3ds|tokeni[sz]ation)\b/i,
      3,
    ],
    [
      /\b(e-?commerce|cart|order(s)?|sku|inventory|catalog(ue)?|storefront|shopify|coupon|discount|pricing page|merchant)\b/i,
      2,
    ],
    [/\b(webhook|settlement|reconcil\w*|ledger|transaction(s)?)\b/i, 1.5],
  ],
  dev: [
    [
      /\b(build|implement|code|coding|refactor|debug|bug|fix|function|component|endpoint|api|backend|frontend|full[- ]?stack)\b/i,
      1.5,
    ],
    [
      /\b(react|next\.?js|node|python|typescript|javascript|sql schema|database|docker|kubernetes|vercel|supabase|firebase|auth)\b/i,
      2,
    ],
    [
      /\b(app|website|web app|dashboard|feature|deploy|test(s)?|unit test|ci|migration|repo|pull request|stack trace|error:)\b/i,
      1.2,
    ],
    [/\b(architecture|multi[- ]?tenant|microservices?|sync|schema design|system design)\b/i, 2],
    [/```|=>|\bfunction\s*\(|\bconst\s+\w+\s*=|\bdef\s+\w+\(|\bimport\s+\w+/, 2.5],
  ],
  research: [
    [
      /\b(research|compare|comparison|analy[sz]e|analysis|evaluate|investigate|survey|benchmark|pros and cons|trade-?offs?)\b/i,
      2,
    ],
    [
      /\b(market|competitor(s)?|landscape|trend(s)?|report|literature|sources|citations?|study|studies|why does|how does)\b/i,
      1.5,
    ],
    [
      /\b(explain|summari[sz]e (this|the) (paper|report|article)|deep dive|what are the best)\b/i,
      1.2,
    ],
  ],
  creative: [
    [
      /\b(write|draft|copy|copywriting|tagline|slogan|headline|story|poem|script|lyrics|blog|caption|tweet|post)\b/i,
      1.5,
    ],
    [
      /\b(brand|tone|voice|name(s)? for|naming|creative|catchy|pitch|landing page copy|ad(s)?|campaign|storytelling|ux writing|microcopy)\b/i,
      2,
    ],
    [/\b(design|logo|moodboard|persona|narrative|email to|newsletter)\b/i, 1],
  ],
  data: [
    [
      /\b(extract|parse|classify|categori[sz]e|label|tag|structure|normali[sz]e|dedupe|clean (up )?(the )?data)\b/i,
      2,
    ],
    [
      /\b(json|csv|xml|yaml|table|spreadsheet|excel|sql query|regex|schema|fields?|columns?|rows?)\b/i,
      1.5,
    ],
    [/\b(entities|sentiment|intent|key ?points|metadata)\b/i, 1.5],
  ],
  grunt: [
    [
      /\b(rename|reformat|format|convert|translate|lowercase|uppercase|sort|alphabeti[sz]e|indent|lint|prettify|boilerplate|stub|scaffold)\b/i,
      2.5,
    ],
    [
      /\b(fix (the )?typos?|spell ?check|bullet ?points|list of|turn (this|these) into|replace all|find and replace|add comments|docstrings?|jsdoc)\b/i,
      2.5,
    ],
    [/\b(bulk|batch|repetitive|every file|all (the )?files|each (row|item|line))\b/i, 1.5],
  ],
  chat: [
    [/^(hi|hello|hey|thanks|thank you|ok|cool)\b/i, 3],
    [/^(what|who|when|where|is|can|does|do)\b.{0,80}\?$/i, 1.5],
  ],
};

const EFFORT_UP = [
  [
    /\b(end[- ]to[- ]end|from scratch|entire|whole|full|complete|production[- ]?(ready|grade)|system|architecture|multi[- ]?(step|tenant|agent))\b/i,
    1,
    "Large scope wording",
  ],
  [
    /\b(integrate|integration|migrate|migration|orchestrat\w*|pipeline|workflow|scal(e|able|ing)|distributed|real[- ]?time)\b/i,
    0.7,
    "Integration or system work",
  ],
  [
    /\b(and then|after that|also|additionally|step \d|phase \d)\b/i,
    0.4,
    "Multiple steps requested",
  ],
  [/\b(build|create|implement|develop|refactor|redesign)\b/i, 0.6, "Builds or changes something"],
  [/(,[^,]+){2,}|\band\b.*\band\b|\bwith\b.*\band\b/i, 0.5, "Several deliverables"],
  [
    /\b(design|plan|strategy|research|deep|thorough|comprehensive|detailed)\b/i,
    0.5,
    "Asks for depth",
  ],
];
const EFFORT_DOWN = [
  [
    /\b(quick|simple|small|tiny|just|only|one[- ]liner|short|brief|a few words)\b/i,
    -0.8,
    "Asks for something small",
  ],
  [
    /\b(rename|reformat|format|convert|typo|sort|lowercase|uppercase|translate this)\b/i,
    -0.8,
    "Mechanical transformation",
  ],
];

const IMPACT_RULES = [
  [
    /\b(payment|payments|checkout|refund|money|bank|card|upi|wallet|pci|invoice|settlement|payout|pine ?labs)\b/i,
    2,
    "Moves money",
  ],
  [
    /\b(auth|authentication|login|password|token|secret|api key|encryption|permission(s)?|rbac|oauth|security|vulnerab\w*)\b/i,
    1.5,
    "Touches security or access",
  ],
  [
    /\b(production|prod|live|deploy|release|customers?|users'? data|migration|delete|drop table|database)\b/i,
    1,
    "Affects production or user data",
  ],
  [
    /\b(legal|contract|compliance|gdpr|dpdp|hipaa|medical|health|tax|kyc|aml)\b/i,
    1.5,
    "Regulated domain",
  ],
  [/\b(investor|board|launch|public|press)\b/i, 0.5, "High-visibility output"],
];

const PII_RULES = [
  ["email", /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/],
  ["phone", /(?:\+?\d{1,3}[\s-]?)?\b\d{10}\b|\+\d{1,3}[\s-]\d{3,5}[\s-]\d{3,5}[\s-]?\d{0,5}/],
  ["card number", /\b(?:\d[ -]?){13,19}\b/],
  ["Aadhaar", /\b\d{4}\s\d{4}\s\d{4}\b/],
  ["PAN", /\b[A-Z]{5}\d{4}[A-Z]\b/],
  ["API key", /\b(sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|hf_[A-Za-z0-9]{20,})\b/],
];

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

export function classify(text, { contextTokens = 0 } = {}) {
  const t = (text || "").trim();
  const words = t ? t.split(/\s+/).length : 0;

  // Category scores
  const scores = {};
  const hits = {};
  for (const [cat, rules] of Object.entries(CATEGORY_RULES)) {
    let s = 0;
    for (const [re, w] of rules) {
      const m = t.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"));
      if (m) {
        s += w * Math.min(m.length, 3);
        (hits[cat] ||= []).push(...m.slice(0, 3).map((x) => x.trim().toLowerCase()));
      }
    }
    scores[cat] = s;
  }
  // Payment words also look like dev words; when both fire, commerce is the more specific job.
  if (scores.commerce >= 4.5) scores.commerce += 1.5;
  // Grunt verbs on top of code are still grunt work.
  if (scores.grunt >= 2.5 && scores.dev > 0) scores.grunt += 1;
  if (words <= 6 && Object.values(scores).every((v) => v < 2)) scores.chat += 2;

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((a, [, v]) => a + v, 0);
  let [category, top] = ranked[0];
  if (top === 0) {
    category = "chat";
    top = 1;
  }
  const confidence = total ? clamp(top / total, 0.34, 0.98) : 0.4;
  const secondary =
    ranked[1] && ranked[1][1] > 0 && ranked[1][1] >= top * 0.45 ? ranked[1][0] : null;

  // Effort
  const effortSignals = [];
  let effort = 1.2 + clamp(Math.log2(Math.max(words, 1)) / 3.5, 0, 2.2);
  if (words > 120) effortSignals.push(`${words}-word brief`);
  for (const [re, w, why] of [...EFFORT_UP, ...EFFORT_DOWN])
    if (re.test(t)) {
      effort += w;
      effortSignals.push(why);
    }
  const bullets = (t.match(/^\s*([-*•]|\d+[.)])\s+/gm) || []).length;
  if (bullets >= 3) {
    effort += Math.min(bullets / 4, 1.2);
    effortSignals.push(`${bullets} listed requirements`);
  }
  const ctx = contextTokens + estimateTokens(t);
  if (ctx > 50_000) {
    effort += 1;
    effortSignals.push(`${Math.round(ctx / 1000)}K tokens of context`);
  }
  if (category === "grunt") effort -= 0.6;
  if (category === "chat") effort -= 0.6;
  effort = clamp(Math.round(effort), 1, 5);

  // Impact
  const impactSignals = [];
  let impact = 1;
  for (const [re, w, why] of IMPACT_RULES)
    if (re.test(t)) {
      impact += w;
      impactSignals.push(why);
    }
  if (category === "commerce") impact = Math.max(impact, 4);
  impact = clamp(Math.round(impact), 1, 5);

  // PII
  const piiKinds = PII_RULES.filter(([, re]) => re.test(t)).map(([k]) => k);

  return {
    category,
    confidence: +confidence.toFixed(2),
    secondary,
    scores: Object.fromEntries(ranked.map(([k, v]) => [k, +v.toFixed(2)])),
    keywords: [...new Set(hits[category] || [])].slice(0, 6),
    effort,
    effortSignals: effortSignals.length ? effortSignals : ["Short, focused ask"],
    impact,
    impactSignals: impactSignals.length
      ? impactSignals
      : ["No money, security or production risk found"],
    pii: { found: piiKinds.length > 0, kinds: piiKinds },
    tokens: ctx,
    words,
    classifier: "heuristic",
  };
}

export const EFFORT_LABELS = ["", "Trivial", "Light", "Moderate", "Heavy", "Deep"];
export const IMPACT_LABELS = ["", "Low", "Contained", "Notable", "High", "Critical"];

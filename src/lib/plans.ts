/*
 * ── Ported from the website, whole ───────────────────────────────────────────
 *
 * This file replaces a hand-cut subset the app carried while only the
 * registration step needed it. Keeping two versions of the price list is the
 * one failure this module exists to prevent, so the app now reads the same
 * object the website does, including the feature matrix the plan screens and
 * the locked-feature screen render from.
 *
 * It has no imports, by the website's own design, which is what makes the
 * straight copy safe.
 */

/**
 * Membership tiers — the single source of truth.
 *
 * Every price, limit and feature row in the product comes from this file: the
 * pricing cards, the comparison matrix, the quota meters, and the server
 * guards in `entitlements.ts`.
 *
 * That is deliberate and it is the whole design. A card that advertises
 * "30 scans a month" while the server enforces something else is the same
 * class of error as a fabricated price — and the only reliable way to prevent
 * it is to make the marketing copy and the enforcement literally the same
 * object. If you change a number here, both move together or neither does.
 *
 * No server imports, so client components can read it directly.
 *
 * ── On what these tiers sell ─────────────────────────────────────────────────
 *
 * Tiers differ by *limits on features that already exist*, never by features
 * that would have to be invented. Three entries in the written pricing spec
 * named things this codebase does not have, and each is mapped onto a real
 * limit rather than printed on a card we could not honour:
 *
 *   "Direct access to agronomists via chat"  → the existing AI assistant with
 *     the cap removed. Labelled as AI throughout; nothing here implies a human
 *     is answering, because that is a promise the product cannot keep.
 *
 *   "Historical analytics (year-over-year)"  → nothing in the repo computes
 *     year-over-year. It became `historyDays`: how far back the scans,
 *     expenses and irrigation events already stored remain visible.
 *
 *   "Hyperlocal weather + crop-specific pest alerts" → already built, already
 *     delivered to everyone, and deliberately NOT gated. See HAZARDS_UNGATED.
 */

export type PlanId = "free" | "pro" | "elite";
export type Cycle = "monthly" | "annual";

/** A per-calendar-month allowance, or no ceiling at all. */
export type Quota = number | "unlimited";

export const UNLIMITED = "unlimited" as const;

export function isUnlimited(q: Quota): q is typeof UNLIMITED {
  return q === UNLIMITED;
}

/**
 * The things a tier can meter.
 *
 * `liveLookups` covers all three TinyFish surfaces together — live mandi,
 * input-price comparison and scheme refresh — because they spend the same
 * wallet. Metering them separately would let one Pro farmer run twenty browser
 * runs on each and cost more in credits than ₹149 covers.
 */
export type QuotaKey = "diseaseScans" | "assistantQueries" | "liveLookups" | "historyDays";

/** What a quota is counted under in `feature_usage`. */
export type UsageFeature = "disease_scan" | "assistant_query" | "live_lookup";

export const USAGE_FEATURES: UsageFeature[] = [
  "disease_scan",
  "assistant_query",
  "live_lookup",
];

/** Which quota backs each counted feature. */
export const QUOTA_FOR_FEATURE: Record<UsageFeature, QuotaKey> = {
  disease_scan: "diseaseScans",
  assistant_query: "assistantQueries",
  live_lookup: "liveLookups",
};

/**
 * Every capability the matrix can describe.
 *
 * Adding one here and nowhere else is a compile error at the call sites that
 * must decide what it does, which is the intent.
 */
export type FeatureKey =
  | "diseaseScans"
  | "assistant"
  | "fields"
  | "mandiPrices"
  | "schemeMatch"
  | "newsAndStores"
  | "soilPh"
  | "hazardAlerts"
  | "irrigation"
  | "expenses"
  | "liveMandi"
  | "inputPrices"
  | "schemeRefresh"
  | "history"
  | "support";

export type PlanFeature = {
  key: FeatureKey;
  /** i18n key for the row label, never a literal — this renders in nine languages. */
  labelKey: string;
  /**
   * What this tier gets. `true`/`false` render as a tick or a dash; a string is
   * an i18n key for a short value like "30 a month" or "12 months".
   */
  value: boolean | string;
  /** Shown on the card's benefit list. Everything shows in the full matrix. */
  onCard?: boolean;
};

export type Plan = {
  id: PlanId;
  nameKey: string;
  taglineKey: string;
  /** Who this is for, from the pricing spec. Shown under the name. */
  audienceKey: string;
  priceMonthly: number;
  priceAnnual: number;
  /** Pro is the one we expect most farmers to want. */
  popular?: boolean;
  limits: {
    diseaseScans: Quota;
    assistantQueries: Quota;
    /** A hard count, never unlimited — fields are rows a farmer creates. */
    fields: number;
    liveLookups: Quota;
    historyDays: Quota;
  };
  features: PlanFeature[];
};

/**
 * Safety information is never gated.
 *
 * The hazard pipeline (NDMA SACHET → `hazard_events` → matched farmers) carries
 * flood, cyclone and thunderstorm warnings from IMD and CWC. Those appear in
 * the pricing spec as an Elite benefit, and they are not implemented as one
 * here. A farmer who has not paid ₹299 is exactly as much in the path of a
 * flood as one who has, and a warning withheld for non-payment is not a
 * monetisation decision anybody should have to defend.
 */
export const HAZARDS_UNGATED = true;

/** Cheapest first. Also defines `rank`, so order is meaningful, not cosmetic. */
export const PLAN_ORDER: PlanId[] = ["free", "pro", "elite"];

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    nameKey: "plans.free.name",
    taglineKey: "plans.free.tagline",
    audienceKey: "plans.free.audience",
    priceMonthly: 0,
    priceAnnual: 0,
    limits: {
      diseaseScans: 3,
      assistantQueries: 20,
      fields: 2,
      liveLookups: 0,
      historyDays: 30,
    },
    features: [
      { key: "fields", labelKey: "plans.f.fields", value: "plans.v.fields2", onCard: true },
      { key: "diseaseScans", labelKey: "plans.f.scans", value: "plans.v.scans3", onCard: true },
      { key: "assistant", labelKey: "plans.f.assistant", value: "plans.v.queries20", onCard: true },
      { key: "mandiPrices", labelKey: "plans.f.mandiPrices", value: true, onCard: true },
      { key: "schemeMatch", labelKey: "plans.f.schemeMatch", value: true, onCard: true },
      { key: "hazardAlerts", labelKey: "plans.f.hazardAlerts", value: true, onCard: true },
      { key: "soilPh", labelKey: "plans.f.soilPh", value: true },
      { key: "newsAndStores", labelKey: "plans.f.newsAndStores", value: true },
      { key: "history", labelKey: "plans.f.history", value: "plans.v.history30d" },
      { key: "irrigation", labelKey: "plans.f.irrigation", value: false },
      { key: "expenses", labelKey: "plans.f.expenses", value: false },
      { key: "liveMandi", labelKey: "plans.f.liveMandi", value: false },
      { key: "inputPrices", labelKey: "plans.f.inputPrices", value: false },
      { key: "schemeRefresh", labelKey: "plans.f.schemeRefresh", value: false },
      { key: "support", labelKey: "plans.f.support", value: false },
    ],
  },

  pro: {
    id: "pro",
    nameKey: "plans.pro.name",
    taglineKey: "plans.pro.tagline",
    audienceKey: "plans.pro.audience",
    priceMonthly: 149,
    priceAnnual: 1609,
    popular: true,
    limits: {
      diseaseScans: 30,
      assistantQueries: 300,
      fields: 5,
      liveLookups: 20,
      historyDays: 365,
    },
    features: [
      { key: "fields", labelKey: "plans.f.fields", value: "plans.v.fields5", onCard: true },
      { key: "diseaseScans", labelKey: "plans.f.scans", value: "plans.v.scans30", onCard: true },
      { key: "assistant", labelKey: "plans.f.assistant", value: "plans.v.queries300", onCard: true },
      { key: "irrigation", labelKey: "plans.f.irrigation", value: true, onCard: true },
      { key: "expenses", labelKey: "plans.f.expenses", value: true, onCard: true },
      { key: "liveMandi", labelKey: "plans.f.liveMandi", value: "plans.v.lookups20", onCard: true },
      { key: "support", labelKey: "plans.f.support", value: true, onCard: true },
      { key: "mandiPrices", labelKey: "plans.f.mandiPrices", value: true },
      { key: "schemeMatch", labelKey: "plans.f.schemeMatch", value: true },
      { key: "hazardAlerts", labelKey: "plans.f.hazardAlerts", value: true },
      { key: "soilPh", labelKey: "plans.f.soilPh", value: true },
      { key: "newsAndStores", labelKey: "plans.f.newsAndStores", value: true },
      { key: "inputPrices", labelKey: "plans.f.inputPrices", value: "plans.v.sharesLookups" },
      { key: "schemeRefresh", labelKey: "plans.f.schemeRefresh", value: "plans.v.sharesLookups" },
      { key: "history", labelKey: "plans.f.history", value: "plans.v.history12m" },
    ],
  },

  elite: {
    id: "elite",
    nameKey: "plans.elite.name",
    taglineKey: "plans.elite.tagline",
    audienceKey: "plans.elite.audience",
    priceMonthly: 299,
    priceAnnual: 3229,
    limits: {
      diseaseScans: UNLIMITED,
      assistantQueries: UNLIMITED,
      fields: 20,
      liveLookups: UNLIMITED,
      historyDays: UNLIMITED,
    },
    features: [
      { key: "fields", labelKey: "plans.f.fields", value: "plans.v.fields20", onCard: true },
      { key: "diseaseScans", labelKey: "plans.f.scans", value: "plans.v.unlimited", onCard: true },
      { key: "assistant", labelKey: "plans.f.assistant", value: "plans.v.unlimited", onCard: true },
      { key: "liveMandi", labelKey: "plans.f.liveMandi", value: "plans.v.unlimited", onCard: true },
      { key: "history", labelKey: "plans.f.history", value: "plans.v.historyAll", onCard: true },
      { key: "irrigation", labelKey: "plans.f.irrigation", value: true, onCard: true },
      { key: "expenses", labelKey: "plans.f.expenses", value: true, onCard: true },
      { key: "support", labelKey: "plans.f.support", value: true, onCard: true },
      { key: "mandiPrices", labelKey: "plans.f.mandiPrices", value: true },
      { key: "schemeMatch", labelKey: "plans.f.schemeMatch", value: true },
      { key: "hazardAlerts", labelKey: "plans.f.hazardAlerts", value: true },
      { key: "soilPh", labelKey: "plans.f.soilPh", value: true },
      { key: "newsAndStores", labelKey: "plans.f.newsAndStores", value: true },
      { key: "inputPrices", labelKey: "plans.f.inputPrices", value: "plans.v.unlimited" },
      { key: "schemeRefresh", labelKey: "plans.f.schemeRefresh", value: "plans.v.unlimited" },
    ],
  },
};

/** Row order for the comparison matrix, so every tier's column lines up. */
export const MATRIX_ROWS: FeatureKey[] = [
  "fields",
  "diseaseScans",
  "assistant",
  "mandiPrices",
  "liveMandi",
  "inputPrices",
  "schemeMatch",
  "schemeRefresh",
  "irrigation",
  "expenses",
  "soilPh",
  "hazardAlerts",
  "newsAndStores",
  "history",
  "support",
];

export function planOf(id: string | null | undefined): PlanId {
  return id === "pro" || id === "elite" ? id : "free";
}

/** Position in PLAN_ORDER, so tiers can be compared with `>=`. */
export function rank(p: PlanId): number {
  return PLAN_ORDER.indexOf(p);
}

/** Whether `plan` is at least `min` — the tier gate, in one place. */
export function atLeast(plan: PlanId, min: PlanId): boolean {
  return rank(plan) >= rank(min);
}

export function limitOf(plan: PlanId, q: QuotaKey): Quota {
  return PLANS[plan].limits[q];
}

export function fieldLimit(plan: PlanId): number {
  return PLANS[plan].limits.fields;
}

export function featureOf(plan: PlanId, key: FeatureKey): PlanFeature | undefined {
  return PLANS[plan].features.find((f) => f.key === key);
}

/** True when a tier includes a capability at all (any non-false value). */
export function allows(plan: PlanId, key: FeatureKey): boolean {
  return featureOf(plan, key)?.value !== false;
}

/** The cheapest tier that includes a capability — what an upgrade prompt names. */
export function cheapestPlanWith(key: FeatureKey): PlanId {
  return PLAN_ORDER.find((p) => allows(p, key)) ?? "elite";
}

/** The cheapest tier that can hold this many fields. */
export function cheapestPlanForFields(count: number): PlanId | null {
  return PLAN_ORDER.find((p) => fieldLimit(p) >= count) ?? null;
}

export function priceFor(plan: Plan, cycle: Cycle): number {
  return cycle === "annual" ? plan.priceAnnual : plan.priceMonthly;
}

/**
 * What twelve months would cost at the monthly rate.
 *
 * The struck-through figure beside the annual price. Derived rather than typed
 * in, so it cannot drift from the price printed next to it.
 */
export function annualAtMonthlyRate(plan: Plan): number {
  return plan.priceMonthly * 12;
}

/**
 * Months saved by paying annually, rounded down.
 *
 * ₹1,609 against ₹149 x 12 = ₹1,788 saves ₹179, which is 1.2 months — so this
 * returns 1, not the "2 months free" the original spec claimed. The badge
 * renders from this number, so it states what the prices actually do.
 */
export function annualSavingMonths(plan: Plan): number {
  if (plan.priceMonthly <= 0) return 0;
  const saved = annualAtMonthlyRate(plan) - plan.priceAnnual;
  return Math.max(0, Math.floor(saved / plan.priceMonthly));
}

/** Rupees saved per year by paying annually. */
export function annualSavingRupees(plan: Plan): number {
  if (plan.priceMonthly <= 0) return 0;
  return Math.max(0, annualAtMonthlyRate(plan) - plan.priceAnnual);
}

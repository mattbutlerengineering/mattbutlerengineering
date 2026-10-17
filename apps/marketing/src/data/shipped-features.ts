import committedSnapshot from "./shipped-features.json";

/**
 * "Shipped by the factory" story data. The snapshot is generated from GitHub
 * REST data, committed, and imported at build time — never fetched at runtime.
 */
export interface ShippedPr {
  readonly number: number;
  readonly title: string;
  readonly mergedAt: string;
  readonly mergeCommit: string;
  readonly reviewVerdict: "pass" | "flag" | null;
  readonly ciGate: "success" | "failure" | null;
}

export interface ShippedChild {
  readonly issue: number;
  readonly title: string;
  readonly prs: readonly ShippedPr[];
}

export interface ShippedFeature {
  readonly slug: string;
  readonly title: string;
  readonly trackingIssue: number;
  readonly proposalIssue: number | null;
  readonly proposalEvidence: string | null;
  readonly proposedAt: string | null;
  readonly firstMergedAt: string;
  readonly lastMergedAt: string;
  readonly wallClockHours: number;
  /** Site-relative path to the live feature, if there is one. */
  readonly liveUrl: string | null;
  readonly children: readonly ShippedChild[];
}

export interface ShippedFeaturesSnapshot {
  readonly generatedAt: string;
  readonly features: readonly ShippedFeature[];
}

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === "string";
const isDate = (value: unknown): value is string =>
  isString(value) && !Number.isNaN(Date.parse(value));
const isIssueNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;
const isNullable = (value: unknown, check: (input: unknown) => boolean): boolean =>
  value === null || check(value);

function isShippedPr(value: unknown): value is ShippedPr {
  if (!isObj(value)) return false;
  return (
    isIssueNumber(value.number) &&
    isString(value.title) &&
    isDate(value.mergedAt) &&
    isString(value.mergeCommit) &&
    (value.reviewVerdict === null ||
      value.reviewVerdict === "pass" ||
      value.reviewVerdict === "flag") &&
    (value.ciGate === null || value.ciGate === "success" || value.ciGate === "failure")
  );
}

function isShippedChild(value: unknown): value is ShippedChild {
  if (!isObj(value)) return false;
  return (
    isIssueNumber(value.issue) &&
    isString(value.title) &&
    Array.isArray(value.prs) &&
    value.prs.every(isShippedPr)
  );
}

function isShippedFeature(value: unknown): value is ShippedFeature {
  if (!isObj(value)) return false;
  return (
    isString(value.slug) &&
    value.slug.length > 0 &&
    isString(value.title) &&
    isIssueNumber(value.trackingIssue) &&
    isNullable(value.proposalIssue, isIssueNumber) &&
    isNullable(value.proposalEvidence, isString) &&
    isNullable(value.proposedAt, isDate) &&
    isDate(value.firstMergedAt) &&
    isDate(value.lastMergedAt) &&
    typeof value.wallClockHours === "number" &&
    Number.isFinite(value.wallClockHours) &&
    isNullable(
      value.liveUrl,
      (url) => isString(url) && url.startsWith("/") && !url.startsWith("//")
    ) &&
    Array.isArray(value.children) &&
    value.children.every(isShippedChild)
  );
}

/** Runtime guard for a snapshot that crossed a file boundary. */
export function isShippedFeaturesSnapshot(value: unknown): value is ShippedFeaturesSnapshot {
  return (
    isObj(value) &&
    isDate(value.generatedAt) &&
    Array.isArray(value.features) &&
    value.features.every(isShippedFeature)
  );
}

/**
 * Valid features, newest first by `lastMergedAt` (ties: higher `trackingIssue`
 * first). A malformed snapshot yields `[]` rather than throwing.
 */
export function selectShippedFeatures(raw: unknown): readonly ShippedFeature[] {
  if (!isShippedFeaturesSnapshot(raw)) return [];
  return [...raw.features].sort(
    (a, b) =>
      Date.parse(b.lastMergedAt) - Date.parse(a.lastMergedAt) || b.trackingIssue - a.trackingIssue
  );
}

/** Validated, sorted features from the committed snapshot. */
export const SHIPPED_FEATURES: readonly ShippedFeature[] = selectShippedFeatures(committedSnapshot);

export function findShippedFeature(slug: string): ShippedFeature | undefined {
  return SHIPPED_FEATURES.find((feature) => feature.slug === slug);
}

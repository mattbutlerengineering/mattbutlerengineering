/**
 * Runtime half of the plain-props rule (ADR-032). The types stop a careless caller; this stops a
 * caller that is not type-checked from handing the remote a token, a router object or a React
 * element. Unknown keys are rejected, which is what keeps a router object out.
 */

import { READINESS_STATUSES, SIDENAV_CONTRACT, type SideNavProps } from "./types.js";

export class SideNavContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SideNavContractError";
  }
}

const TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
  "contract",
  "pathname",
  "locale",
  "direction",
  "flags",
  "readiness",
  "isMobileOpen",
  "onAction",
  "onMobileClose",
  "onRenderError",
]);
const FLAG_KEYS: ReadonlySet<string> = new Set(["isAdmin"]);
const READINESS_KEYS: ReadonlySet<string> = new Set(["status", "steps"]);

const TOKEN_KEY = /token|secret|bearer|authorization|credential/i;
/** Three base64url segments, the first starting `eyJ` (a JSON header): a JWT. */
const JWT_SHAPE = /^eyJ[\w-]+\.[\w-]+\.[\w-]*$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isReactElement = (value: unknown): boolean => isRecord(value) && "$$typeof" in value;

function fail(message: string): never {
  throw new SideNavContractError(message);
}

function checkKeys(where: string, value: Record<string, unknown>, allowed: ReadonlySet<string>) {
  for (const key of Object.keys(value)) {
    if (TOKEN_KEY.test(key)) fail(`${where}.${key}: a token can not cross the seam`);
    if (!allowed.has(key)) fail(`${where}.${key}: not part of the contract (plain props only)`);
    if (isReactElement(value[key])) fail(`${where}.${key}: a React element can not cross the seam`);
  }
}

function checkString(where: string, value: unknown): string {
  if (typeof value !== "string") return fail(`${where}: expected a string`);
  if (JWT_SHAPE.test(value)) fail(`${where}: looks like a token, which can not cross the seam`);
  return value;
}

export function assertSideNavProps(value: unknown): asserts value is SideNavProps {
  if (!isRecord(value)) return fail("props: expected an object");
  checkKeys("props", value, TOP_LEVEL_KEYS);

  if (value["contract"] !== SIDENAV_CONTRACT) {
    fail(`contract: expected ${String(SIDENAV_CONTRACT)}, got ${String(value["contract"])}`);
  }
  checkString("pathname", value["pathname"]);
  checkString("locale", value["locale"]);
  if (value["direction"] !== "ltr" && value["direction"] !== "rtl") {
    fail("direction: expected ltr or rtl");
  }

  const flags = value["flags"];
  if (!isRecord(flags)) return fail("flags: expected an object");
  checkKeys("flags", flags, FLAG_KEYS);
  if (typeof flags["isAdmin"] !== "boolean") fail("flags.isAdmin: expected a boolean");

  const readiness = value["readiness"];
  if (!isRecord(readiness)) return fail("readiness: expected an object");
  checkKeys("readiness", readiness, READINESS_KEYS);
  const status = readiness["status"];
  const steps = readiness["steps"];
  if (!READINESS_STATUSES.some((known) => known === status)) {
    fail("readiness.status: not a known status");
  }
  if (!Array.isArray(steps) || !steps.every((step) => typeof step === "string")) {
    fail("readiness.steps: expected an array of strings");
  }

  if (typeof value["isMobileOpen"] !== "boolean") fail("isMobileOpen: expected a boolean");
  for (const callback of ["onAction", "onMobileClose"]) {
    if (typeof value[callback] !== "function") fail(`${callback}: expected a function`);
  }
  if (value["onRenderError"] !== undefined && typeof value["onRenderError"] !== "function") {
    fail("onRenderError: expected a function");
  }
}

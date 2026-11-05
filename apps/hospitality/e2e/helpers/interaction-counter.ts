import type { Locator, Page } from "@playwright/test";

/**
 * Interaction counter (architecture.md decision f): one interaction is one Playwright Locator
 * action the scenario issues: click, fill, check, uncheck, press. A time picked from a combobox
 * is two (open, then choose). goto, expect and waitFor are not counted. The same wrapper counts
 * every path on one fixture, so the counts compare with each other and with the recorded
 * baselines. Agent stand-in evidence only; it is not a timed walkthrough.
 */

const COUNTED_ACTIONS: ReadonlySet<string> = new Set([
  "click",
  "fill",
  "check",
  "uncheck",
  "press",
]);

/** Page and Locator members that return a Locator, so its actions are counted too. */
const LOCATOR_RETURNING: ReadonlySet<string> = new Set([
  "getByRole",
  "getByText",
  "getByLabel",
  "getByPlaceholder",
  "getByTestId",
  "getByAltText",
  "getByTitle",
  "locator",
  "first",
  "last",
  "nth",
  "filter",
  "and",
  "or",
]);

export interface InteractionCounter {
  /** Use this in place of the test's `page`. */
  readonly page: Page;
  /** Interactions counted so far. */
  readonly count: () => number;
}

export function countInteractions(page: Page): InteractionCounter {
  let interactions = 0;

  const wrap = <T extends Page | Locator>(target: T): T =>
    new Proxy(target, {
      get(_, prop) {
        const member: unknown = Reflect.get(target, prop, target);
        if (typeof member !== "function" || typeof prop !== "string") return member;
        return (...args: unknown[]) => {
          if (COUNTED_ACTIONS.has(prop)) interactions += 1;
          const result: unknown = member.apply(target, args);
          return LOCATOR_RETURNING.has(prop) ? wrap(result as Locator) : result;
        };
      },
    });

  return { page: wrap(page), count: () => interactions };
}

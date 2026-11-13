import type { Locator, Page } from "@playwright/test";

/**
 * First-paint counter (PRD 15): how many actionable controls a Manager sees on a page's main
 * content area outside one region (the week panel). Buttons, links, comboboxes, menu buttons,
 * tabs, radio and segmented options, checkboxes and selects count; the app shell (sidebar, top
 * nav, breadcrumb, skip link) is outside `<main id="main-content">` and never counts, and neither
 * does anything inside `region`. A control counts when it is rendered with a real box and is not
 * `aria-hidden`, so a visually hidden input behind a styled radio is not counted twice.
 *
 * `region` is `null` to count the whole of `<main>`, the form included.
 *
 * Call it after the role settles and the page has painted its layer (a counted `expect` on the
 * layer's heading first); it reads the DOM once and does not wait.
 */

export interface FirstPaintCount {
  readonly count: number;
  /** One "role: name" per counted control, in document order, for a readable failure. */
  readonly controls: readonly string[];
}

const ACTIONABLE = [
  "button",
  "a[href]",
  "select",
  "input:not([type=hidden])",
  "[role=button]",
  "[role=link]",
  "[role=combobox]",
  "[role=menuitem]",
  "[role=radio]",
  "[role=tab]",
  "[role=switch]",
  "[role=checkbox]",
  "summary",
].join(",");

/** The breadcrumb row the layout renders at the top of `<main>` (`DashboardLayout` `breadcrumbBar`). */
const SHELL_ROW = '[class*="breadcrumbBar"]';

export async function countFirstPaintControls(
  page: Page,
  region: Locator | null
): Promise<FirstPaintCount> {
  const regionHandle = region ? await region.elementHandle() : null;
  return page.evaluate(
    ({ selector, shell, outside }) => {
      const main = document.querySelector("main#main-content");
      if (!main) throw new Error("first paint: no <main id=main-content> on the page");
      const seen = new Set<Element>();
      const controls: string[] = [];
      for (const el of main.querySelectorAll(selector)) {
        if (outside?.contains(el)) continue;
        if (el.closest("[aria-hidden=true], [inert]")) continue;
        // The shell's own row inside <main>: breadcrumb, system health badge, paused pill.
        if (el.closest(shell)) continue;
        if (el.matches(":disabled")) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 1 || rect.height <= 1) continue;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") continue;
        if (seen.has(el)) continue;
        seen.add(el);
        const name =
          el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().replace(/\s+/g, " ");
        controls.push(`${el.getAttribute("role") ?? el.tagName.toLowerCase()}: ${name}`);
      }
      return { count: controls.length, controls };
    },
    { selector: ACTIONABLE, shell: SHELL_ROW, outside: regionHandle }
  );
}

/**
 * The week panel (form and footer) on the Schedules layer: the thing the page is for, so PRD 15
 * does not count what is inside it. The page marks it `data-testid="week-panel"`.
 */
export function weekPanel(page: Page): Locator {
  return page.getByTestId("week-panel");
}

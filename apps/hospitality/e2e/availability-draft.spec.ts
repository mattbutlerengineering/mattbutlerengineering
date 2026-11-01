import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./fixtures.js";
import { mockAvailability, type AvailabilityMock } from "./availability-draft-mock.js";
import { localDay } from "./local-day.js";

/**
 * Day drafts (docs/features/venue-availability/ux.md F2 steps 5-6, F-MS). A draft must survive a
 * failed background reload; Copy, the nudge and Undo must not save beside an open editor, which
 * would make the editor's own save a 409; a drag across today must not move the grid under the
 * pointer; and a multi-date drawer must describe the selection, not its first date. The mock
 * keeps the config version the way the server does, so a self-conflict shows up as a 409.
 * Every test runs at a desktop and a phone size.
 */

const SIZES = [
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
] as const;

const DRAFT_ERROR = "Couldn’t check for newer hours";
const FINISH_FIRST = "Save or discard your changes to this day first.";
const WAIT_FOR_RELOAD = "Edit once the newest hours have loaded.";

function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function plusDays(iso: string, days: number): string {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The 15th of next month: one "Next" reaches it and it is never in the past. */
function midNextMonth(): string {
  const [year, month] = localDay().split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 15)).toISOString().slice(0, 10);
}

/** The first Monday on or after the 8th of next month, and the Friday of that week. */
function nextMonthMondayAndFriday(): { monday: string; friday: string } {
  let d = plusDays(midNextMonth(), -7); // the 8th
  while (utc(d).getUTCDay() !== 1) d = plusDays(d, 1);
  return { monday: d, friday: plusDays(d, 4) };
}

const longDate = (iso: string) =>
  utc(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

const cell = (page: Page, iso: string) => page.locator(`[data-date="${iso}"]`);
const status = (page: Page) => page.locator('[role="status"][aria-live="polite"]').first();

async function open(page: Page) {
  await page.clock.setFixedTime(new Date(`${localDay()}T12:00:00`));
  await page.goto("availability");
  await expect(page.locator("[data-date]").first()).toBeVisible();
}

async function openNextMonthDay(page: Page, iso: string): Promise<Locator> {
  await open(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await cell(page, iso).click();
  const drawer = page.getByRole("dialog").first();
  await expect(drawer.getByRole("button", { name: "Edit Dinner" })).toBeVisible();
  return drawer;
}

/** A date's own hours, as the config stores them; `rules` of the mock take these. */
function ownHours(iso: string) {
  return {
    id: `own-${iso}`,
    kind: "special_hours",
    targetKind: "venue",
    startsOn: iso,
    endsOn: iso,
    payload: {
      version: 1,
      services: [
        {
          venueServiceId: "vs-dinner",
          opensAt: 1080,
          lastSeatingAt: 1320,
          closesAt: 1400,
          seating: { version: 1, interval: 15 },
          bookingTypes: ["online", "phone"],
        },
      ],
    },
  };
}

/** The hours drawer of the first row on the Special dates tab. */
async function openSpecialDateRow(page: Page, navigate = true): Promise<Locator> {
  if (navigate) {
    await open(page);
    await page.getByRole("radio", { name: "Special dates" }).click({ force: true });
  }
  await page.getByRole("button", { name: /^Edit/ }).first().click();
  const drawer = page.getByRole("dialog").first();
  await expect(drawer.getByRole("button", { name: "Edit Dinner" })).toBeVisible();
  return drawer;
}

async function copyToMonday(page: Page, drawer: Locator) {
  await drawer.getByRole("button", { name: "Copy to other days…" }).click();
  const copy = page.getByRole("dialog", { name: /Copy .* to other days/ });
  await copy.getByText("Mon", { exact: true }).click();
  await copy.getByRole("button", { name: /^Copy to \d+ dates?$/ }).click();
  await expect(copy).toBeHidden();
}

/** Edit is held, says why, and a click at it opens nothing. */
async function expectEditHeld(drawer: Locator) {
  const edit = drawer.getByRole("button", { name: "Edit Dinner" });
  await expect(edit).toHaveAttribute("aria-disabled", "true");
  await expect(edit).toHaveAccessibleDescription(WAIT_FOR_RELOAD);
  // Not a pointer click: the drawer may still be sliding in, and only the handler is under test.
  await edit.dispatchEvent("click");
  await expect(drawer.getByRole("button", { name: "Remove Dinner" })).toHaveCount(0);
}

const saves = (mock: AvailabilityMock) => mock.puts.map((p) => `${p.expected} -> ${p.status}`);

const centre = async (loc: Locator) => {
  await loc.scrollIntoViewIfNeeded();
  const b = (await loc.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

async function removeDinner(drawer: Locator) {
  await drawer.getByRole("button", { name: "Edit Dinner" }).click();
  await drawer.getByRole("button", { name: "Remove Dinner" }).click();
}

for (const size of SIZES) {
  test.describe(`availability day drafts at ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test("a draft survives a failed reload, and a refused Overwrite explains itself in the dialog", async ({
      mockedPage,
    }) => {
      const mock = await mockAvailability(mockedPage);
      const drawer = await openNextMonthDay(mockedPage, midNextMonth());
      await removeDinner(drawer);

      // Someone else saved first; the reload that follows the refusal fails.
      mock.colleague();
      mock.failReads = true;
      await drawer.getByRole("button", { name: "Save 1 date" }).click();
      const conflict = mockedPage.getByRole("dialog", {
        name: "Someone changed availability first",
      });
      await expect(conflict).toBeVisible();
      await expect.poll(() => mock.configReads).toBeGreaterThan(1);

      // The draft is still there under the dialog, with the failed reload named above it.
      await expect(mockedPage.getByText(DRAFT_ERROR)).toBeAttached();
      await expect(drawer.getByRole("button", { name: "Save 1 date" })).toBeAttached();

      // Overwrite re-reads the version first; that read fails, and the dialog says so itself.
      await conflict.getByRole("button", { name: "Overwrite" }).click();
      await expect(conflict.getByRole("alert")).toBeVisible();
      await expect(conflict).toBeVisible();

      // A real click: the dialog stacks above the drawer, so its buttons are reachable.
      mock.failReads = false;
      await conflict.getByRole("button", { name: "Discard mine" }).click();
      await expect(conflict).toBeHidden();
    });

    test("a refresh error offers Retry, and clears once the reload succeeds", async ({
      mockedPage,
    }) => {
      const mock = await mockAvailability(mockedPage);
      const drawer = await openNextMonthDay(mockedPage, midNextMonth());

      // Copy saves, but the reload after it fails.
      mock.failReads = true;
      await drawer.getByRole("button", { name: "Copy to other days…" }).click();
      const copy = mockedPage.getByRole("dialog", { name: /Copy .* to other days/ });
      await copy.getByText("Mon", { exact: true }).click();
      await copy.getByRole("button", { name: /^Copy to \d+ dates?$/ }).click();
      await expect(copy).toBeHidden();
      const alert = drawer.getByRole("alert").filter({ hasText: DRAFT_ERROR });
      await expect(alert).toBeVisible();

      mock.failReads = false;
      await alert.getByRole("button", { name: "Retry" }).click();
      await expect(alert).toBeHidden();
    });

    test("Copy waits for an editor that is open but has no change yet, so the save is not a 409", async ({
      mockedPage,
    }) => {
      const mock = await mockAvailability(mockedPage);
      const drawer = await openNextMonthDay(mockedPage, midNextMonth());

      await drawer.getByRole("button", { name: "Edit Dinner" }).click();
      const copy = drawer.getByRole("button", { name: "Copy to other days…" });
      await expect(copy).toHaveAttribute("aria-disabled", "true");
      const reason = drawer.getByText(FINISH_FIRST);
      await expect(reason).toBeVisible();
      await expect(copy).toHaveAttribute("aria-describedby", (await reason.getAttribute("id"))!);
      // Reachable from the keyboard, unlike a natively disabled button.
      await copy.focus();
      await expect(copy).toBeFocused();
      await copy.click({ force: true });
      await expect(mockedPage.getByRole("dialog", { name: /Copy .* to other days/ })).toHaveCount(
        0
      );

      await drawer.getByRole("button", { name: "Remove Dinner" }).click();
      await drawer.getByRole("button", { name: "Save 1 date" }).click();
      await expect(mockedPage.getByRole("dialog")).toHaveCount(0);
      expect(mock.puts.map((p) => p.status)).toEqual([200]);
    });

    test("a failed reload after Copy holds Edit until Retry brings the version, so the save is not a 409", async ({
      mockedPage,
    }) => {
      const mock = await mockAvailability(mockedPage);
      const drawer = await openNextMonthDay(mockedPage, midNextMonth());

      mock.failReads = true;
      await copyToMonday(mockedPage, drawer);
      const alert = drawer.getByRole("alert").filter({ hasText: DRAFT_ERROR });
      await expect(alert).toBeVisible();
      await expectEditHeld(drawer);

      mock.failReads = false;
      await alert.getByRole("button", { name: "Retry" }).click();
      await expect(alert).toBeHidden();
      await expect(drawer.getByText(WAIT_FOR_RELOAD)).toHaveCount(0);

      await removeDinner(drawer);
      await drawer.getByRole("button", { name: "Save 1 date" }).click();
      await expect(mockedPage.getByRole("dialog")).toHaveCount(0);
      expect(saves(mock)).toEqual(["7 -> 200", "8 -> 200"]);
    });

    test("a slow reload after Copy holds Edit until it lands, so the save is not a 409", async ({
      mockedPage,
    }) => {
      const mock = await mockAvailability(mockedPage);
      const drawer = await openNextMonthDay(mockedPage, midNextMonth());

      mock.holdReads();
      await copyToMonday(mockedPage, drawer);
      await expectEditHeld(drawer);

      mock.releaseReads();
      await removeDinner(drawer);
      await drawer.getByRole("button", { name: "Save 1 date" }).click();
      await expect(mockedPage.getByRole("dialog")).toHaveCount(0);
      expect(saves(mock)).toEqual(["7 -> 200", "8 -> 200"]);
    });

    test("a slow reload after the schedule nudge holds Edit until it lands, so the save is not a 409", async ({
      mockedPage,
    }) => {
      const { friday } = nextMonthMondayAndFriday();
      const mock = await mockAvailability(mockedPage, {
        rules: [7, 14, 21].map((back) => ownHours(plusDays(friday, -back))),
      });
      const drawer = await openNextMonthDay(mockedPage, friday);

      mock.holdReads();
      await drawer.getByRole("button", { name: "Make a Friday schedule" }).click();
      await expect.poll(() => mock.puts.length).toBe(1);
      await expectEditHeld(drawer);

      mock.releaseReads();
      await removeDinner(drawer);
      await drawer.getByRole("button", { name: "Save 1 date" }).click();
      await expect(mockedPage.getByRole("dialog")).toHaveCount(0);
      expect(saves(mock)).toEqual(["7 -> 200", "8 -> 200"]);
    });

    test("a colleague's save during a draft still conflicts, also after the Manager's own Copy", async ({
      mockedPage,
    }) => {
      const mock = await mockAvailability(mockedPage);
      const drawer = await openNextMonthDay(mockedPage, midNextMonth());
      await copyToMonday(mockedPage, drawer);
      await removeDinner(drawer);

      mock.colleague();
      await drawer.getByRole("button", { name: "Save 1 date" }).click();
      await expect(
        mockedPage.getByRole("dialog", { name: "Someone changed availability first" })
      ).toBeVisible();
      expect(saves(mock)).toEqual(["7 -> 200", "8 -> 409"]);
    });

    test("a slow reload after Undo holds Edit until it lands, so the Manager's own Undo is no conflict", async ({
      mockedPage,
    }) => {
      const mock = await mockAvailability(mockedPage);
      const drawer = await openNextMonthDay(mockedPage, midNextMonth());
      await copyToMonday(mockedPage, drawer);
      await expect(drawer.getByText(WAIT_FOR_RELOAD)).toHaveCount(0);

      mock.holdReads();
      await mockedPage
        .getByRole("region", { name: "Notifications" })
        .getByRole("button", { name: "Undo" })
        .click();
      await expect.poll(() => mock.reverts).toBe(1);
      await expectEditHeld(drawer);

      mock.releaseReads();
      await removeDinner(drawer);
      await drawer.getByRole("button", { name: "Save 1 date" }).click();
      await expect(mockedPage.getByRole("dialog")).toHaveCount(0);
      expect(saves(mock)).toEqual(["7 -> 200", "9 -> 200"]);
    });

    test("a read older than the Manager's save holds Edit with a way to reload, not a lockout", async ({
      mockedPage,
    }) => {
      const mock = await mockAvailability(mockedPage);
      const drawer = await openNextMonthDay(mockedPage, midNextMonth());

      mock.readVersion = 7;
      await copyToMonday(mockedPage, drawer);
      await expect(drawer.getByRole("alert")).toHaveCount(0);
      await expectEditHeld(drawer);

      mock.readVersion = null;
      await drawer.getByRole("button", { name: "Reload hours" }).click();
      await removeDinner(drawer);
      await drawer.getByRole("button", { name: "Save 1 date" }).click();
      await expect(mockedPage.getByRole("dialog")).toHaveCount(0);
      expect(saves(mock)).toEqual(["7 -> 200", "8 -> 200"]);
    });

    test("Special dates: a failed reload offers Retry, survives closing the drawer, and the save is not a 409", async ({
      mockedPage,
    }) => {
      const mock = await mockAvailability(mockedPage, {
        rules: [ownHours(midNextMonth())],
      });
      let drawer = await openSpecialDateRow(mockedPage);

      mock.failReads = true;
      await copyToMonday(mockedPage, drawer);
      const alert = () => drawer.getByRole("alert").filter({ hasText: DRAFT_ERROR });
      await expect(alert()).toBeVisible();
      await expectEditHeld(drawer);

      await mockedPage.keyboard.press("Escape");
      await expect(mockedPage.getByRole("dialog")).toHaveCount(0);
      drawer = await openSpecialDateRow(mockedPage, false);
      await expect(alert()).toBeVisible();
      await expectEditHeld(drawer);

      mock.failReads = false;
      await alert().getByRole("button", { name: "Retry" }).click();
      await expect(alert()).toBeHidden();
      await removeDinner(drawer);
      await drawer.getByRole("button", { name: /^Save/ }).click();
      await expect(mockedPage.getByRole("dialog")).toHaveCount(0);
      expect(saves(mock)).toEqual(["7 -> 200", "8 -> 200"]);
    });

    test("Special dates: closing during a slow reload does not forget it, so the save is not a 409", async ({
      mockedPage,
    }) => {
      const mock = await mockAvailability(mockedPage, {
        rules: [ownHours(midNextMonth())],
      });
      let drawer = await openSpecialDateRow(mockedPage);

      mock.holdReads();
      await copyToMonday(mockedPage, drawer);
      await mockedPage.keyboard.press("Escape");
      await expect(mockedPage.getByRole("dialog")).toHaveCount(0);
      drawer = await openSpecialDateRow(mockedPage, false);
      await expectEditHeld(drawer);

      mock.releaseReads();
      await removeDinner(drawer);
      await drawer.getByRole("button", { name: /^Save/ }).click();
      await expect(mockedPage.getByRole("dialog")).toHaveCount(0);
      expect(saves(mock)).toEqual(["7 -> 200", "8 -> 200"]);
    });

    test("Undo waits for an open editor and says so, and the draft then saves without a 409", async ({
      mockedPage,
    }) => {
      const mock = await mockAvailability(mockedPage);
      const first = midNextMonth();
      let drawer = await openNextMonthDay(mockedPage, first);
      await removeDinner(drawer);
      await drawer.getByRole("button", { name: "Save 1 date" }).click();
      await expect(mockedPage.getByRole("dialog")).toHaveCount(0);
      const undo = mockedPage
        .getByRole("region", { name: "Notifications" })
        .getByRole("button", { name: "Undo" });
      await expect(undo).toBeVisible();

      await cell(mockedPage, plusDays(first, 1)).click();
      drawer = mockedPage.getByRole("dialog").first();
      await drawer.getByRole("button", { name: "Edit Dinner" }).click();
      await undo.click({ force: true });
      await expect(mockedPage.getByText("Discard your changes first, then undo.")).toBeVisible();
      expect(mock.reverts).toBe(0);

      await drawer.getByRole("button", { name: "Remove Dinner" }).click();
      await drawer.getByRole("button", { name: "Save 1 date" }).click();
      await expect(mockedPage.getByRole("dialog")).toHaveCount(0);
      expect(mock.puts.map((p) => p.status)).toEqual([200, 200]);
    });

    test("a drag across today holds the selection bar back, so the grid stays under the pointer", async ({
      mockedPage,
    }) => {
      await mockAvailability(mockedPage);
      await open(mockedPage);
      const today = localDay();
      // Three consecutive days from today on, as the page lists them; a phone lists no past days.
      let ahead = (
        await mockedPage
          .locator("[data-date]")
          .evaluateAll((els) => els.map((e) => e.getAttribute("data-date") as string))
      ).filter((d) => d >= today);
      if (ahead.length < 3) {
        await mockedPage.getByRole("button", { name: "Next", exact: true }).click();
        ahead = (
          await mockedPage
            .locator("[data-date]")
            .evaluateAll((els) => els.map((e) => e.getAttribute("data-date") as string))
        ).filter((d) => d.startsWith(plusDays(today, 28).slice(0, 7)));
      }
      const [first, second, third] = ahead as [string, string, string];
      const past = cell(mockedPage, plusDays(today, -1));
      const start = ahead[0] === today && (await past.count()) > 0 ? past : cell(mockedPage, first);

      const centre = async (loc: Locator) => {
        await loc.scrollIntoViewIfNeeded();
        const b = (await loc.boundingBox())!;
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      };
      // Against the page, not the viewport: scrolling a row into view is not the grid moving.
      const topOfThird = () =>
        cell(mockedPage, third).evaluate(
          (el) =>
            el.getBoundingClientRect().top +
            window.scrollY +
            (document.querySelector("main")?.scrollTop ?? 0)
        );
      const before = await topOfThird();
      await mockedPage.evaluate(() => {
        const w = window as unknown as { __seq: string[] };
        w.__seq = [];
        const read = () => {
          const text =
            document.querySelector('[role="status"][aria-live="polite"]')?.textContent ?? "";
          if (w.__seq.at(-1) !== text) w.__seq.push(text);
        };
        read();
        new MutationObserver(read).observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
        });
      });
      const seq = () => mockedPage.evaluate(() => (window as unknown as { __seq: string[] }).__seq);

      const a = await centre(start);
      await mockedPage.mouse.move(a.x, a.y);
      await mockedPage.mouse.down();
      const b = await centre(cell(mockedPage, second));
      await mockedPage.mouse.move(b.x, b.y, { steps: 4 });
      const c = await centre(cell(mockedPage, third));
      await mockedPage.mouse.move(c.x, c.y, { steps: 4 });
      await mockedPage.waitForTimeout(700);

      // Held: nothing was announced, nothing moved, and the pointer is still on the last day.
      expect(await seq()).toEqual([""]);
      expect(await topOfThird()).toBe(before);
      expect(
        await mockedPage.evaluate(
          ([x, y]) =>
            document.elementFromPoint(x!, y!)?.closest("[data-date]")?.getAttribute("data-date"),
          [c.x, c.y]
        )
      ).toBe(third);

      await mockedPage.mouse.up();
      await expect(status(mockedPage)).toHaveText("3 dates selected");
      // One announcement for the whole drag, not one per cell crossed.
      expect(await seq()).toEqual(["", "3 dates selected"]);
      void today;
    });

    test("a date with its own hours picked beside a regular one: the drawer claims no count, and Keep theirs writes one date", async ({
      mockedPage,
    }) => {
      const { friday } = nextMonthMondayAndFriday();
      const thursday = plusDays(friday, -1);
      const mock = await mockAvailability(mockedPage, { rules: [ownHours(thursday)] });
      await open(mockedPage);
      await mockedPage.getByRole("button", { name: "Next", exact: true }).click();
      await cell(mockedPage, thursday).click({ modifiers: ["ControlOrMeta"] });
      await cell(mockedPage, friday).click({ modifiers: ["ControlOrMeta"] });
      await mockedPage.getByRole("button", { name: "Edit hours" }).click();

      const drawer = mockedPage.getByRole("dialog", { name: "2 dates selected" });
      await expect(drawer).toContainText(`The rows below are from ${longDate(thursday)}.`);
      await expect(drawer).not.toContainText("selected dates.");
      await removeDinner(drawer);
      await drawer.getByRole("button", { name: "Save 1 date" }).click();
      await expect(mockedPage.getByRole("dialog")).toHaveCount(0);
      expect(mock.bodies[0]?.changes?.upsert?.dateRules?.map((r) => r.startsOn)).toEqual([friday]);
    });

    test("a drag whose mouseup was lost does not leave the selection bar hidden", async ({
      mockedPage,
    }) => {
      await mockAvailability(mockedPage);
      await open(mockedPage);
      await mockedPage.getByRole("button", { name: "Next", exact: true }).click();
      const first = midNextMonth();

      const a = await centre(cell(mockedPage, first));
      await mockedPage.mouse.move(a.x, a.y);
      await mockedPage.mouse.down();
      const b = await centre(cell(mockedPage, plusDays(first, 1)));
      await mockedPage.mouse.move(b.x, b.y, { steps: 3 });
      // The window never hears of this release.
      await mockedPage.evaluate(() =>
        window.addEventListener("mouseup", (e) => e.stopImmediatePropagation(), {
          capture: true,
          once: true,
        })
      );
      await mockedPage.mouse.up();

      await cell(mockedPage, plusDays(first, 2)).click();
      await expect(mockedPage.getByRole("dialog")).toHaveCount(1);
      await mockedPage.keyboard.press("Escape");
      await expect(mockedPage.getByRole("dialog")).toHaveCount(0);
      await cell(mockedPage, plusDays(first, 3)).click({ modifiers: ["ControlOrMeta"] });
      await cell(mockedPage, plusDays(first, 4)).click({ modifiers: ["ControlOrMeta"] });
      await expect(status(mockedPage)).toHaveText("2 dates selected");
      await expect(mockedPage.getByRole("button", { name: "Edit hours" })).toBeVisible();
    });

    test("a drag begun with a selection showing leaves the bar, and so the grid, where it is", async ({
      mockedPage,
    }) => {
      await mockAvailability(mockedPage);
      await open(mockedPage);
      await mockedPage.getByRole("button", { name: "Next", exact: true }).click();
      const first = midNextMonth();
      await cell(mockedPage, first).click({ modifiers: ["ControlOrMeta"] });
      await cell(mockedPage, plusDays(first, 1)).click({ modifiers: ["ControlOrMeta"] });
      await expect(status(mockedPage)).toHaveText("2 dates selected");

      const start = cell(mockedPage, plusDays(first, 2));
      const end = cell(mockedPage, plusDays(first, 3));
      const b = await centre(end);
      const a = await centre(start);
      const before = (await end.boundingBox())!.y;
      await mockedPage.mouse.move(a.x, a.y);
      await mockedPage.mouse.down();
      await mockedPage.mouse.move(b.x, b.y, { steps: 3 });
      await mockedPage.waitForTimeout(200);
      expect((await end.boundingBox())!.y).toBe(before);
      await expect(status(mockedPage)).toHaveText("2 dates selected");
      await mockedPage.mouse.up();
      await expect(status(mockedPage)).toHaveText("2 dates selected");
      expect((await end.boundingBox())!.y).toBe(before);
    });

    test("a selection of a closed Monday and an open Friday shows Friday's hours and says they differ", async ({
      mockedPage,
    }) => {
      await mockAvailability(mockedPage, { weekdays: [0, 2, 3, 4, 5, 6] });
      const { monday, friday } = nextMonthMondayAndFriday();
      await open(mockedPage);
      await mockedPage.getByRole("button", { name: "Next", exact: true }).click();
      await cell(mockedPage, monday).click({ modifiers: ["ControlOrMeta"] });
      await cell(mockedPage, friday).click({ modifiers: ["ControlOrMeta"] });
      await mockedPage.getByRole("button", { name: "Edit hours" }).click();

      const drawer = mockedPage.getByRole("dialog", { name: "2 dates selected" });
      await expect(drawer).toContainText("These dates have different hours.");
      await expect(drawer).toContainText(`The rows below are from ${longDate(friday)}.`);
      await expect(drawer).not.toContainText("Saving replaces");
      await removeDinner(drawer);
      await expect(mockedPage.locator("[data-draft-dot]")).toHaveCount(2);

      await drawer.getByRole("button", { name: "Cancel" }).click();
      await expect(
        mockedPage.getByRole("dialog", { name: "Discard changes to the 2 selected dates?" })
      ).toBeVisible();
    });
  });
}

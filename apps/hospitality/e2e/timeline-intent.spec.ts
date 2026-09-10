import { test, expect } from "./fixtures.js";

// The Walk-in intent (architecture § Decisions, ux.md Flow 1): three ways in — the URL itself,
// ⌘K "Walk-in guest", the Dashboard's Walk-in — and each ends the same way: the "Seat walk-in"
// dialog open, focus inside it, and `walkin=true` gone from the URL once the dialog closes.

const WALK_IN_DIALOG = "Seat walk-in";

test.describe("Timeline URL intent: ?walkin=true opens the Seat walk-in dialog", () => {
  test("/timeline?walkin=true opens the dialog with focus inside; Escape closes it, focuses Walk-in and strips the param", async ({
    mockedPage,
  }) => {
    await mockedPage.goto("timeline?walkin=true");

    const dialog = mockedPage.getByRole("dialog", { name: WALK_IN_DIALOG, exact: true });
    await expect(dialog).toBeVisible();
    // The dialog's trap took focus; nothing is left on the page behind it.
    await expect(dialog.locator(":focus")).toHaveCount(1);

    await mockedPage.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // A URL-opened dialog has no opener to restore, so the page lands focus where a click-open
    // would have — the Walk-in button (ux.md Decision (d)).
    await expect(mockedPage.getByRole("button", { name: "Walk-in", exact: true })).toBeFocused();
    // Back or a reload must not replay the intent.
    await expect(mockedPage).not.toHaveURL(/[?&]walkin=/);
  });

  test("⌘K, 'walk', ⏎ lands on /timeline?walkin=true with the dialog open and focus inside", async ({
    mockedPage,
  }) => {
    await mockedPage.goto("timeline");
    await expect(mockedPage.getByRole("heading", { name: "Timeline", exact: true })).toBeVisible();

    // rialto CommandPalette: role="dialog" "Command palette", role="combobox" "Search commands".
    // Opened via the shortcut, not the sidebar hint button, for the reason reservations.spec.ts
    // records: the palette's return-focus would yank focus back out of the dialog's trap.
    await mockedPage.keyboard.press("ControlOrMeta+k");
    const palette = mockedPage.getByRole("dialog", { name: "Command palette", exact: true });
    await expect(palette).toBeVisible();
    await palette.getByRole("combobox", { name: "Search commands", exact: true }).fill("walk");
    await expect(palette.getByRole("option", { name: "Walk-in guest", exact: true })).toBeVisible();
    await mockedPage.keyboard.press("Enter");

    await expect(mockedPage).toHaveURL(/\/hospitality\/timeline\?(?:[^#]*&)?walkin=true(?:&|$)/);
    const dialog = mockedPage.getByRole("dialog", { name: WALK_IN_DIALOG, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(":focus")).toHaveCount(1);
  });

  test("Dashboard → Walk-in reaches the open dialog in one activation, focus inside", async ({
    mockedPage,
  }) => {
    await mockedPage.goto("dashboard");
    await mockedPage.getByRole("button", { name: "Walk-in", exact: true }).click();

    await expect(mockedPage).toHaveURL(/\/hospitality\/timeline\?(?:[^#]*&)?walkin=true(?:&|$)/);
    const dialog = mockedPage.getByRole("dialog", { name: WALK_IN_DIALOG, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(":focus")).toHaveCount(1);
  });
});

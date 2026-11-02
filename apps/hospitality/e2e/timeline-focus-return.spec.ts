import { test, expect } from "./fixtures.js";
import { localDay } from "./local-day.js";

// #8046: Seat now over Bob's open details surface opens the walk-in's surface. Escape on it must
// land focus on the walk-in's block, the party whose surface was just closed, never Bob's.
const VIEWPORTS = [
  { label: "phone", size: { width: 375, height: 812 }, surface: "Reservation Details" },
  { label: "tablet", size: { width: 900, height: 1100 }, surface: "Bob Smith" },
];

for (const { label, size, surface } of VIEWPORTS) {
  test(`Escape after Seat now lands on the walk-in's block at ${label} width (#8046)`, async ({
    mockedPage,
  }) => {
    await mockedPage.setViewportSize(size);
    await mockedPage.clock.setFixedTime(new Date(`${localDay()}T19:30:00`));
    await mockedPage.goto("timeline");
    await mockedPage.getByTestId("reservation-block-res_e2e_002").click();
    await expect(mockedPage.getByRole("dialog", { name: surface })).toBeVisible();

    await mockedPage.keyboard.press("ControlOrMeta+k");
    await mockedPage
      .getByRole("dialog", { name: "Command palette", exact: true })
      .getByRole("combobox", { name: "Search commands", exact: true })
      .fill("walk");
    await mockedPage.keyboard.press("Enter");
    const walkIn = mockedPage.getByRole("dialog", { name: "Seat walk-in" });
    await walkIn.getByRole("button", { name: "Seat now" }).click();
    await expect(walkIn).toHaveCount(0);
    await expect(mockedPage.locator('[role="dialog"][aria-modal="true"] :focus')).toHaveCount(1);

    await mockedPage.keyboard.press("Escape");

    await expect(mockedPage.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0);
    // Past the closed surface's own focus restore, which would otherwise undo an earlier landing.
    await mockedPage.waitForTimeout(500);
    await expect(
      mockedPage.locator('[data-testid^="reservation-block-res_e2e_walkin_"]')
    ).toBeFocused();
    await expect(mockedPage.getByTestId("reservation-block-res_e2e_002")).not.toBeFocused();
  });
}

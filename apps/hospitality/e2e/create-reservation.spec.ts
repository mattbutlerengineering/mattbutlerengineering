import { test, expect } from "./fixtures.js";

test.describe("CF-4: Reservation edit flow", () => {
  test("opens reservation detail sidebar", async ({ mockedPage }) => {
    await mockedPage.goto("/timeline");

    // Click a reservation block
    const reservationBlock = mockedPage.getByTestId(/^reservation-block-/).first();
    await expect(reservationBlock).toBeVisible();
    await reservationBlock.click();

    // Detail sidebar opens
    const sidebar = mockedPage.getByTestId("reservation-detail-sidebar");
    await expect(sidebar).toBeVisible();

    // Shows reservation info
    await expect(sidebar.getByText(/guest|party/i)).toBeVisible();
  });

  test("opens edit drawer and shows current values", async ({ mockedPage }) => {
    await mockedPage.goto("/timeline");

    // Click a reservation block
    const reservationBlock = mockedPage.getByTestId(/^reservation-block-/).first();
    await reservationBlock.click();

    const sidebar = mockedPage.getByTestId("reservation-detail-sidebar");
    await expect(sidebar).toBeVisible();

    // Click "Edit"
    await sidebar.getByRole("button", { name: /edit/i }).click();

    // EditReservationDrawer opens
    const drawer = mockedPage.getByTestId("edit-reservation-drawer");
    await expect(drawer).toBeVisible();

    // Party size field is editable
    const partySizeInput = drawer.getByLabel(/party size/i);
    await expect(partySizeInput).toBeVisible();
    await expect(partySizeInput).not.toBeDisabled();
  });

  test("saves edited party size and verifies update", async ({ mockedPage }) => {
    await mockedPage.goto("/timeline");

    // Click a reservation block
    const reservationBlock = mockedPage.getByTestId(/^reservation-block-/).first();
    await reservationBlock.click();

    const sidebar = mockedPage.getByTestId("reservation-detail-sidebar");
    await sidebar.getByRole("button", { name: /edit/i }).click();

    const drawer = mockedPage.getByTestId("edit-reservation-drawer");
    await expect(drawer).toBeVisible();

    // Change party size to a different value
    const partySizeInput = drawer.getByLabel(/party size/i);
    const newValue = "6";
    await partySizeInput.fill(newValue);

    // Click "Save"
    await drawer.getByRole("button", { name: /save/i }).click();

    // Drawer closes
    await expect(drawer).not.toBeVisible();

    // Reservation block updates with new party size
    // Verify sidebar reflects the change
    await expect(sidebar.getByText(newValue)).toBeVisible();
  });

  test("cancels edit without saving", async ({ mockedPage }) => {
    await mockedPage.goto("/timeline");

    const reservationBlock = mockedPage.getByTestId(/^reservation-block-/).first();
    await reservationBlock.click();

    const sidebar = mockedPage.getByTestId("reservation-detail-sidebar");
    await sidebar.getByRole("button", { name: /edit/i }).click();

    const drawer = mockedPage.getByTestId("edit-reservation-drawer");
    await expect(drawer).toBeVisible();

    // Click cancel
    await drawer.getByRole("button", { name: /cancel/i }).click();

    // Drawer closes without saving
    await expect(drawer).not.toBeVisible();
  });
});

/**
 * Axe coverage for the TimePicker state the fixture matrix cannot reach: the
 * matrix renders one closed field. This covers the list opened from the
 * keyboard, with focus on the current time.
 */
import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { TimePicker } from "../../components/TimePicker/TimePicker";

const noop = () => {};
const user = userEvent.setup();
// jsdom cannot compute contrast; token-contrast.test.ts covers it.
const check = () => axe(document.body, { rules: { "color-contrast": { enabled: false } } });

describe("Accessibility — TimePicker states", () => {
  it("list opened with ArrowDown, focus on the current time", async () => {
    // The list is portaled to document.body, so axe scans the whole page and
    // the field needs the landmark a real page gives it.
    render(
      <main>
        <TimePicker label="Time" value="09:00" onChange={noop} locale="en-US" step={60} />
      </main>
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText("Time"));

    await user.keyboard("{ArrowDown}");

    await waitFor(() => expect(document.activeElement).toHaveAttribute("data-time", "09:00"));
    expect(await check()).toHaveNoViolations();
  });
});

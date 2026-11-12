/**
 * Axe coverage for the DatePicker states the fixture matrix cannot reach: the
 * matrix renders one closed, read-only field. These cover the editable field,
 * its problem, and the open calendar with focus on a day.
 */
import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { render as renderInto, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { DatePicker } from "../../components/DatePicker/DatePicker";

const noop = () => {};
const user = userEvent.setup();
// The calendar is portaled to document.body, so axe scans the whole page and
// the field needs the landmark a real page gives it.
const render = (ui: ReactElement) => renderInto(<main>{ui}</main>);
// jsdom cannot compute contrast; token-contrast.test.ts covers it.
const check = () => axe(document.body, { rules: { "color-contrast": { enabled: false } } });

describe("Accessibility — DatePicker states", () => {
  it("editable field, empty", async () => {
    render(<DatePicker label="Date" value={null} onChange={noop} locale="en-US" editable />);
    expect(await check()).toHaveNoViolations();
  });

  it("editable field showing a problem", async () => {
    render(<DatePicker label="Date" value={null} onChange={noop} locale="en-US" editable />);
    const field = screen.getByLabelText("Date");
    await user.type(field, "not a date{Enter}");

    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("Enter a date");
    expect(await check()).toHaveNoViolations();
  });

  it("editable field with the calendar open and focus on a day", async () => {
    render(<DatePicker label="Date" value="2024-06-10" onChange={noop} locale="en-US" editable />);
    await user.click(screen.getByLabelText("Date"));
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(document.activeElement).toHaveAttribute("data-date", "2024-06-10"));
    expect(await check()).toHaveNoViolations();
  });

  it("read-only field with the calendar open and focus on a day", async () => {
    render(<DatePicker label="Date" value="2024-06-10" onChange={noop} locale="en-US" />);
    await user.click(screen.getByLabelText("Date"));
    await waitFor(() => expect(document.activeElement).toHaveAttribute("data-date", "2024-06-10"));
    expect(await check()).toHaveNoViolations();
  });
});

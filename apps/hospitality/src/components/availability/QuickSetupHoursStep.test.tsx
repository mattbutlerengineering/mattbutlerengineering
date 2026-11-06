import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const tablesRead = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useTables.js", () => ({
  useTables: (params: unknown) => {
    tablesRead(params);
    return { data: undefined, isLoading: false, error: null, refetch: vi.fn() };
  },
}));

import { QuickSetupHoursStep } from "./QuickSetupHoursStep.js";
import { demoDraft } from "./quick-setup-demo.fixture.js";
import { draftToLegacyHours } from "./quick-setup-draft.js";

describe("QuickSetupHoursStep", () => {
  it("renders the new controls and the strip's local mode, with no venue to ask", () => {
    render(<QuickSetupHoursStep draft={demoDraft()} onChange={vi.fn()} />);
    // Every demo service has its own days.
    expect(screen.getAllByRole("button", { name: "Use the shared days" })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "Different hours on some days" })).toHaveLength(3);

    const strip = screen.getByRole("complementary", { name: "Guest preview" });
    expect(within(strip).getByText("From the hours you typed")).toBeInTheDocument();
    expect(within(strip).queryByLabelText("Party")).not.toBeInTheDocument();
    expect(within(strip).getByRole("listitem", { name: /^Monday:/ })).toHaveTextContent("Lunch");
    expect(within(strip).getByRole("listitem", { name: /^Monday:/ })).not.toHaveTextContent(
      /Dinner \d/
    );
    expect(within(strip).queryByText("Updated")).not.toBeInTheDocument();
    // The tables read is switched off: the wizard's venue does not exist yet.
    expect(tablesRead).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("sends each weekday's earliest open to latest close for a varied week", () => {
    const hours = draftToLegacyHours(demoDraft());
    expect(hours.monday).toEqual({ open: "11:30", close: "15:00" });
    expect(hours.tuesday).toEqual({ open: "11:30", close: "23:00" });
    expect(hours.friday).toEqual({ open: "11:30", close: "00:00" });
    expect(hours.saturday).toEqual({ open: "10:00", close: "00:00" });
    expect(hours.sunday).toEqual({ open: "10:00", close: "23:00" });
  });
});

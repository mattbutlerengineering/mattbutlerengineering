import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Seating } from "@mbe/types";

vi.mock("../../../contexts/VenueContext.js", () => ({
  useVenue: () => ({
    selectedVenue: { id: "venue-1", ianaTimezone: "America/Los_Angeles", currencyCode: "USD" },
  }),
}));

import {
  ServiceFields,
  type ServiceFieldsProps,
  type ServiceFieldsValue,
} from "./ServiceFields.js";
import { serviceFieldId } from "./TimesRow.js";

const FIXED: Seating = { version: 1, fixed: [1080, 1200] };

const value = (extra: Partial<ServiceFieldsValue> = {}): ServiceFieldsValue => ({
  opens: "17:00",
  lastSeating: "21:00",
  closes: "22:00",
  lastSeatingLinked: false,
  seating: { version: 1, interval: 15 },
  bookingTypes: ["online", "phone"],
  ...extra,
});

function fields(props: Partial<ServiceFieldsProps> = {}) {
  const onChange = vi.fn();
  render(<ServiceFields value={value()} onChange={onChange} idScope="row" {...props} />);
  return onChange;
}

const choose = (select: string, option: string) => {
  fireEvent.click(screen.getByRole("combobox", { name: select }));
  fireEvent.click(screen.getByRole("option", { name: option }));
};

describe("ServiceFields", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("shows the three times and both options from plain values", () => {
    fields();
    expect(screen.getByLabelText("Opens")).toHaveValue("5:00 PM");
    expect(screen.getByLabelText("Last seating")).toHaveValue("9:00 PM");
    expect(screen.getByLabelText("Closes")).toHaveValue("10:00 PM");
    expect(screen.getByRole("combobox", { name: "Seat every" })).toHaveTextContent("15 min");
    expect(screen.getByRole("combobox", { name: "Booked by" })).toHaveTextContent("Online + phone");
  });

  it("gives each field the id its scope names", () => {
    fields();
    expect(screen.getByLabelText("Opens")).toHaveAttribute("id", serviceFieldId("row", "opens"));
    expect(screen.getByLabelText("Closes")).toHaveAttribute("id", "row-closes");
  });

  it("Seat every answers the next values with the new interval and the same booking types", () => {
    const start = value();
    const onChange = fields({ value: start });
    choose("Seat every", "30 min");
    const next: ServiceFieldsValue = onChange.mock.calls[0]![0];
    expect(next.seating).toEqual({ version: 1, interval: 30 });
    expect(next.bookingTypes).toBe(start.bookingTypes);
  });

  it("Booked by answers the next values with the new types and the same seating", () => {
    const start = value();
    const onChange = fields({ value: start });
    choose("Booked by", "Walk-in only");
    const next: ServiceFieldsValue = onChange.mock.calls[0]![0];
    expect(next.bookingTypes).toEqual([]);
    expect(next.seating).toBe(start.seating);
  });

  it("offers a stored interval that is not one of the usual ones", () => {
    fields({ value: value({ seating: { version: 1, interval: 45 } }) });
    expect(screen.getByRole("combobox", { name: "Seat every" })).toHaveTextContent("45 min");
  });

  it("shows fixed seating times as text and hands them back untouched", () => {
    const onChange = fields({ value: value({ seating: FIXED }) });
    expect(screen.getByText("Fixed seating times: 6:00 PM and 8:00 PM")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Seat every" })).not.toBeInTheDocument();
    choose("Booked by", "Phone only");
    expect(onChange.mock.calls[0]![0].seating).toBe(FIXED);
  });

  it("reads booking types in either order", () => {
    fields({ value: value({ bookingTypes: ["phone", "online"] }) });
    expect(screen.getByRole("combobox", { name: "Booked by" })).toHaveTextContent("Online + phone");
  });

  it("says the last seating a linked service follows", () => {
    fields({ value: value({ lastSeating: "21:15", lastSeatingLinked: true }) });
    expect(screen.getByText("Last seating 9:15 PM, 45 min before close")).toBeInTheDocument();
  });

  it("says a close on the next day, naming the weekday when the hours are for one date", () => {
    const late = value({ closes: "01:00", lastSeating: "00:15" });
    const { unmount } = render(<ServiceFields value={late} onChange={vi.fn()} idScope="a" />);
    expect(screen.getByText("Closes 1:00 AM the next day")).toBeInTheDocument();
    unmount();
    render(<ServiceFields value={late} onChange={vi.fn()} idScope="b" date="2026-10-30" />);
    expect(screen.getByText("Closes 1:00 AM the next day (Saturday)")).toBeInTheDocument();
  });

  it("shows the problems it is given under their fields, and validates nothing itself", () => {
    fields({
      value: value({ closes: null }),
      problems: { closes: <span role="alert">Add a closing time</span> },
    });
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual(["Add a closing time"]);
  });

  it("puts the form's own controls between the times and the options", () => {
    fields({ children: <button type="button">Different days</button> });
    const own = screen.getByRole("button", { name: "Different days" });
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(screen.getByLabelText("Closes"), own)).toBe(true);
    expect(follows(own, screen.getByRole("combobox", { name: "Seat every" }))).toBe(true);
  });

  it("collapsed: the options wait behind More options", () => {
    fields({ options: "collapsed" });
    const more = screen.getByRole("button", { name: "More options" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("combobox", { name: "Booked by" })).not.toBeInTheDocument();
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(more.getAttribute("aria-controls") ?? "")).toContainElement(
      screen.getByRole("combobox", { name: "Booked by" })
    );
  });

  it("hidden: neither the options nor More options", () => {
    fields({ options: "hidden" });
    expect(screen.queryByRole("button", { name: "More options" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Booked by" })).not.toBeInTheDocument();
  });
});

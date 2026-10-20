import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReservationBlock } from "./ReservationBlock.js";
import { makeReservation } from "./readOnly.fixtures";

const style = { left: 100, width: 200 };

describe("ReservationBlock default render is unchanged by readOnly support", () => {
  it("renders the same DOM when readOnly is not set", () => {
    const { container } = render(
      <ReservationBlock reservation={makeReservation()} style={style} isSeated />
    );
    expect(container.innerHTML).toMatchInlineSnapshot(
      `"<button type="button" data-testid="reservation-block-res-1" class="block statusConfirmed  " style="left: 100px; width: 200px;" title="Jane Doe - 4 guests at 11:00 AM" aria-label="Jane Doe, party of 4, 11:00 AM, confirmed, seated" aria-pressed="false"><div class="content"><div class="guestName" data-truncate="true"><span class="_led_v5do8_1 _xs_v5do8_22 _success_v5do8_44 seatedLed" role="presentation" aria-hidden="true"></span><span>Jane Doe</span></div><div class="details" data-truncate="true">4 · 11:00 AM</div></div></button>"`
    );
  });
});

describe("ReservationBlock readOnly", () => {
  it("renders a div, not a button, and keeps the visible content", () => {
    const { container } = render(
      <ReservationBlock reservation={makeReservation()} style={style} readOnly />
    );
    expect(screen.queryByRole("button")).toBeNull();
    const block = screen.getByTestId("reservation-block-res-1");
    expect(block.tagName).toBe("DIV");
    expect(block).toHaveStyle({ left: "100px", width: "200px" });
    expect(container.textContent).toContain("Jane Doe");
  });

  it("keeps the same classes as the interactive block", () => {
    const { container: a } = render(
      <ReservationBlock reservation={makeReservation()} style={style} isSelected />
    );
    const { container: b } = render(
      <ReservationBlock reservation={makeReservation()} style={style} isSelected readOnly />
    );
    expect(b.firstElementChild?.className).toBe(a.firstElementChild?.className);
  });

  it("calls no handler on click", () => {
    const onClick = vi.fn();
    render(
      <ReservationBlock reservation={makeReservation()} style={style} readOnly onClick={onClick} />
    );
    fireEvent.click(screen.getByTestId("reservation-block-res-1"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("is not focusable and is not announced as pressed", () => {
    render(<ReservationBlock reservation={makeReservation()} style={style} readOnly />);
    const block = screen.getByTestId("reservation-block-res-1");
    expect(block).not.toHaveAttribute("tabindex");
    expect(block).not.toHaveAttribute("aria-pressed");
  });

  it("still reads out guest, party and status for assistive tech", () => {
    render(<ReservationBlock reservation={makeReservation()} style={style} readOnly />);
    const block = screen.getByTestId("reservation-block-res-1");
    expect(block).toHaveAttribute("role", "group");
    expect(block.getAttribute("aria-label")).toContain("Jane Doe");
  });
});

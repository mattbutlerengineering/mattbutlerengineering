import { describe, it, expect } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useFocusAfter, type FocusTarget } from "./useFocusAfter.js";
import { PageHeader } from "../components/PageHeader.js";

interface HarnessProps {
  readonly showBlock?: boolean;
  readonly showLate?: boolean;
  readonly request: FocusTarget | null;
}

/** A page-shaped component: the hook lives here, targets render (or not) below it. */
function Harness({ showBlock = false, showLate = false, request }: HarnessProps) {
  const { focusAfter } = useFocusAfter();
  return (
    <>
      <PageHeader title="Timeline" />
      <button onClick={() => request && focusAfter(request)}>request</button>
      <button>elsewhere</button>
      {showBlock && (
        <div tabIndex={-1} data-testid="reservation-block-1">
          block
        </div>
      )}
      {showLate && (
        <div tabIndex={-1} data-testid="late-block">
          late
        </div>
      )}
    </>
  );
}

describe("useFocusAfter", () => {
  it("focuses a testId target once it renders, and only once", () => {
    const request: FocusTarget = { kind: "testId", testId: "reservation-block-1" };
    const { rerender } = render(<Harness request={request} />);

    fireEvent.click(screen.getByText("request"));
    expect(screen.queryByTestId("reservation-block-1")).toBeNull();
    expect(document.activeElement).toBe(document.body);

    rerender(<Harness request={request} showBlock />);
    expect(document.activeElement).toBe(screen.getByTestId("reservation-block-1"));

    act(() => screen.getByText("elsewhere").focus());
    rerender(<Harness request={request} showBlock />);
    expect(document.activeElement).toBe(screen.getByText("elsewhere")); // not re-focused
  });

  it("focuses an element target immediately after commit", () => {
    const { rerender } = render(<Harness request={null} showBlock />);
    const block = screen.getByTestId("reservation-block-1");

    rerender(<Harness request={{ kind: "element", element: block }} showBlock />);
    fireEvent.click(screen.getByText("request"));

    expect(document.activeElement).toBe(block);
  });

  it("focuses the PageHeader h1 for a pageHeading target — the h1 carries tabIndex=-1", () => {
    render(<Harness request={{ kind: "pageHeading" }} />);
    const heading = screen.getByRole("heading", { level: 1, name: "Timeline" });
    expect(heading).toHaveAttribute("tabindex", "-1");

    fireEvent.click(screen.getByText("request"));

    expect(document.activeElement).toBe(heading);
  });

  it("keeps an unresolved target until it is replaced, then drops it (B3.2 seam)", () => {
    const { rerender } = render(<Harness request={{ kind: "testId", testId: "late-block" }} />);
    fireEvent.click(screen.getByText("request")); // nothing to focus yet — kept pending
    expect(document.activeElement).toBe(document.body);

    const elsewhere = screen.getByText("elsewhere");
    rerender(<Harness request={{ kind: "element", element: elsewhere }} />);
    fireEvent.click(screen.getByText("request")); // replaces the pending testId target
    expect(document.activeElement).toBe(elsewhere);

    rerender(<Harness request={null} showLate />); // the late block finally renders
    expect(document.activeElement).toBe(elsewhere); // the dropped target is not honoured
  });

  it("does not throw for a testId containing quotes", () => {
    render(<Harness request={{ kind: "testId", testId: 'weird"id' }} />);

    expect(() => fireEvent.click(screen.getByText("request"))).not.toThrow();
  });
});

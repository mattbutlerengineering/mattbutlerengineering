import { useState } from "react";
import { describe, it, expect } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  UNLESS_COVERED,
  isCoveredByDialog,
  useFocusAfter,
  type FocusTarget,
} from "./useFocusAfter.js";
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

  it("focuses the first enabled control inside a firstIn container, skipping a dismiss control", () => {
    render(
      <>
        <Harness request={{ kind: "firstIn", testId: "surface" }} />
        <div data-testid="surface">
          <button data-focus-trap-skip-initial="true">Close</button>
          <button disabled>Off</button>
          <button>Edit</button>
        </div>
      </>
    );

    fireEvent.click(screen.getByText("request"));

    expect(document.activeElement).toBe(screen.getByText("Edit"));
  });

  it("does not throw for a testId containing quotes", () => {
    render(<Harness request={{ kind: "testId", testId: 'weird"id' }} />);

    expect(() => fireEvent.click(screen.getByText("request"))).not.toThrow();
  });
});

describe("focusAfter with unlessCovered (#8031)", () => {
  function CoveredHarness({ covered }: { readonly covered: boolean }) {
    const { focusAfter } = useFocusAfter();
    return (
      <>
        <button onClick={() => focusAfter({ kind: "testId", testId: "target" }, UNLESS_COVERED)}>
          request
        </button>
        <button data-testid="target">target</button>
        {covered && <div role="dialog" aria-modal="true" />}
      </>
    );
  }

  it("focuses the target when nothing covers it", () => {
    render(<CoveredHarness covered={false} />);
    fireEvent.click(screen.getByText("request"));
    expect(document.activeElement).toBe(screen.getByTestId("target"));
  });

  it("drops the request when a dialog covers the target", () => {
    const { rerender } = render(<CoveredHarness covered />);
    fireEvent.click(screen.getByText("request"));
    expect(document.activeElement).not.toBe(screen.getByTestId("target"));

    // Dropped, not pending: the dialog closing later does not pull focus behind where it went.
    rerender(<CoveredHarness covered={false} />);
    expect(document.activeElement).not.toBe(screen.getByTestId("target"));
  });

  it("judges after the commit, so the dialog that closes with the request does not count", () => {
    function Closing() {
      const { focusAfter } = useFocusAfter();
      const [open, setOpen] = useState(true);
      return (
        <>
          <button
            onClick={() => {
              setOpen(false);
              focusAfter({ kind: "testId", testId: "target" }, UNLESS_COVERED);
            }}
          >
            request
          </button>
          <button data-testid="target">target</button>
          {open && <div role="dialog" aria-modal="true" />}
        </>
      );
    }
    render(<Closing />);
    fireEvent.click(screen.getByText("request"));
    expect(document.activeElement).toBe(screen.getByTestId("target"));
  });
});

describe("isCoveredByDialog (#8029)", () => {
  const modal = (children: React.ReactNode, inert = false) => (
    <div inert={inert}>
      <div role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );

  it("is false with no modal open", () => {
    render(<button>control</button>);
    expect(isCoveredByDialog(screen.getByText("control"))).toBe(false);
  });

  it("is false for a control inside the only modal", () => {
    render(modal(<button>control</button>));
    expect(isCoveredByDialog(screen.getByText("control"))).toBe(false);
  });

  it("is true for a control inside a modal under another modal", () => {
    render(
      <>
        {modal(<button>control</button>)}
        {modal(<button>on top</button>)}
      </>
    );
    expect(isCoveredByDialog(screen.getByText("control"))).toBe(true);
  });

  it("is true for a control outside an open modal, and for one not rendered", () => {
    render(
      <>
        <button>control</button>
        {modal(<button>on top</button>)}
      </>
    );
    expect(isCoveredByDialog(screen.getByText("control"))).toBe(true);
    expect(isCoveredByDialog(null)).toBe(true);
  });

  it("ignores a modal on its way out, inside an inert subtree", () => {
    render(
      <>
        <button>control</button>
        {modal(<button>leaving</button>, true)}
      </>
    );
    expect(isCoveredByDialog(screen.getByText("control"))).toBe(false);
  });
});

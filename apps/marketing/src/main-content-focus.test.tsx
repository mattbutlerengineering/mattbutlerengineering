import { describe, it, expect } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { useMainContentFocus } from "./main-content-focus.js";

function Probe({
  pathname,
  hash = "",
  loading = false,
}: {
  pathname: string;
  hash?: string;
  loading?: boolean;
}) {
  useMainContentFocus(pathname, hash);
  return (
    <main id="main-content" tabIndex={-1}>
      {loading ? <div data-route-fallback="" /> : <a href="/inside">Inside</a>}
    </main>
  );
}

function main(): HTMLElement {
  const element = document.getElementById("main-content");
  if (!element) throw new Error("missing main");
  return element;
}

describe("useMainContentFocus", () => {
  it("does not focus main on the initial load", () => {
    render(<Probe pathname="/" />);
    expect(main()).not.toHaveFocus();
  });

  it("does not focus main when the path changes without a user navigation", () => {
    const { rerender } = render(<Probe pathname="/weekly" />);
    rerender(<Probe pathname="/" />);
    expect(main()).not.toHaveFocus();
  });

  it("focuses main after a click navigates to a page that is already ready", () => {
    const { rerender } = render(<Probe pathname="/" />);
    fireEvent.click(document.body);
    rerender(<Probe pathname="/metrics" />);
    expect(main()).toHaveFocus();
  });

  it("waits out the route fallback so focus is not parked on an empty main", async () => {
    const { rerender } = render(<Probe pathname="/" />);
    fireEvent.click(document.body);
    rerender(<Probe pathname="/metrics" loading />);
    expect(main()).not.toHaveFocus();

    rerender(<Probe pathname="/metrics" />);
    await waitFor(() => expect(main()).toHaveFocus());
  });

  it("leaves a hash target for the browser to focus", () => {
    const { rerender } = render(<Probe pathname="/" />);
    fireEvent.click(document.body);
    rerender(<Probe pathname="/metrics" hash="#main-content" />);
    expect(main()).not.toHaveFocus();
  });

  it("focuses main after a browser history navigation", () => {
    const { rerender } = render(<Probe pathname="/metrics" />);
    window.dispatchEvent(new PopStateEvent("popstate"));
    rerender(<Probe pathname="/" />);
    expect(main()).toHaveFocus();
  });
});

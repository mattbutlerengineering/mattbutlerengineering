import { describe, it, expect, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { BASE_TITLE, DocumentTitle } from "./document-title.js";

describe("DocumentTitle", () => {
  afterEach(() => {
    document.title = BASE_TITLE;
  });

  it("sets a titled document title while mounted", () => {
    render(<DocumentTitle title="Sign in demo" />);
    expect(document.title).toBe("Sign in demo — Rialto");
  });

  it("restores the base title on unmount", () => {
    const { unmount } = render(<DocumentTitle title="Sign in demo" />);
    unmount();
    expect(document.title).toBe(BASE_TITLE);
  });

  it("follows a changed title", () => {
    const { rerender } = render(<DocumentTitle title="Drivers demo" />);
    rerender(<DocumentTitle title="New driver demo" />);
    expect(document.title).toBe("New driver demo — Rialto");
  });

  it("renders nothing", () => {
    const { container } = render(<DocumentTitle title="x" />);
    expect(container).toBeEmptyDOMElement();
  });
});

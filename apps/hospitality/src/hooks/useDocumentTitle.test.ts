// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDocumentTitle } from "./useDocumentTitle.js";

describe("useDocumentTitle", () => {
  beforeEach(() => {
    document.title = "initial";
  });

  it("sets document.title to the given value", () => {
    renderHook(() => useDocumentTitle("Timeline · Hospitality"));

    expect(document.title).toBe("Timeline · Hospitality");
  });

  it("updates document.title when the value changes across renders", () => {
    const { rerender } = renderHook(({ title }) => useDocumentTitle(title), {
      initialProps: { title: "Timeline · Hospitality" },
    });
    expect(document.title).toBe("Timeline · Hospitality");

    rerender({ title: "Guests · Hospitality" });

    expect(document.title).toBe("Guests · Hospitality");
  });
});

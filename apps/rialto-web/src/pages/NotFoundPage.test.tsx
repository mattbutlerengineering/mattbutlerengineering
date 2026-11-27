import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { HOME_TITLE } from "../data/route-head-data.js";
import { RouteHead } from "../route-head.js";
import { NotFoundPage } from "./NotFoundPage";

function robots(): string | null {
  return document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null;
}

function renderUnknown() {
  return render(
    <MemoryRouter basename="/rialto" initialEntries={["/rialto/no-such-page"]}>
      <Routes>
        <Route element={<RouteHead />}>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("NotFoundPage", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.title = HOME_TITLE;
  });

  it("says the page was not found instead of rendering the home page", () => {
    renderUnknown();
    expect(screen.getByRole("heading", { level: 1, name: /page not found/i })).toBeTruthy();
  });

  it("titles the tab differently from the home title", () => {
    renderUnknown();
    expect(document.title).toBe("Page not found — Rialto");
    expect(document.title).not.toBe(HOME_TITLE);
  });

  it("links back to the Rialto home", () => {
    renderUnknown();
    expect(screen.getByRole("link", { name: /rialto home/i }).getAttribute("href")).toBe("/rialto");
  });

  it("renders no landmark or second h1 of its own (the showcase shell supplies <main>)", () => {
    renderUnknown();
    expect(screen.queryByRole("main")).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("does not use undefined tokens", () => {
    const { container } = renderUnknown();
    expect(container.innerHTML).not.toMatch(/--rialto-(weight-semibold|color-brand)/);
  });

  it("is noindex, nofollow while mounted and restores the shell's robots tag", () => {
    document.head.innerHTML = '<meta name="robots" content="index, follow" />';
    const { unmount } = renderUnknown();
    expect(robots()).toBe("noindex, nofollow");
    unmount();
    expect(robots()).toBe("index, follow");
  });
});

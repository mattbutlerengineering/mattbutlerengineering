import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { HOME_TITLE } from "../data/route-head-data.js";
import { NAV_SECTIONS } from "../data/nav-sections.js";
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

  it("links back to the component index and the Rialto home", () => {
    renderUnknown();
    const first = NAV_SECTIONS[0]?.items[0]?.path ?? "/";
    expect(screen.getByRole("link", { name: /browse components/i }).getAttribute("href")).toBe(
      `/rialto${first}`
    );
    expect(screen.getByRole("link", { name: /rialto home/i }).getAttribute("href")).toBe("/rialto");
  });

  it("is noindex, nofollow while mounted and restores the shell's robots tag", () => {
    document.head.innerHTML = '<meta name="robots" content="index, follow" />';
    const { unmount } = renderUnknown();
    expect(robots()).toBe("noindex, nofollow");
    unmount();
    expect(robots()).toBe("index, follow");
  });
});

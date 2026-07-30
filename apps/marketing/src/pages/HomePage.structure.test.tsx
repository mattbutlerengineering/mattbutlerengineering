import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RialtoProvider, ToastProvider } from "@mattbutlerengineering/rialto";
import { HomePage } from "./HomePage.js";

// Integration-level checks that render the real Rialto primitives (not mocks)
// so heading tags, the external CTA anchor, and the weekly-CTA Card are the
// actual DOM the browser ships. `HomePage.test.tsx` covers the mocked
// section-composition contract.
function renderHomePage() {
  return render(
    <RialtoProvider vibe="presenting">
      <ToastProvider>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </ToastProvider>
    </RialtoProvider>
  );
}

describe("HomePage heading hierarchy", () => {
  it("renders exactly one h1", () => {
    renderHomePage();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("renders every top-level section as a real h2", () => {
    renderHomePage();
    const h2Text = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent?.trim());
    expect(h2Text).toEqual(
      expect.arrayContaining(["Projects", "Tech Stack", "About", "Contact", "Stay Current"])
    );
  });

  it("has no heading-order jumps (each level is at most one deeper than the last)", () => {
    renderHomePage();
    const levels = screen.getAllByRole("heading").map((heading) => Number(heading.tagName[1]));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeLessThanOrEqual(levels[i - 1]! + 1);
    }
  });
});

describe("HomePage hero", () => {
  it("leads with the evidence-first h1", () => {
    renderHomePage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This site ships itself.");
  });

  it("exposes the repo CTA that opens safely in a new tab", () => {
    renderHomePage();
    const cta = screen.getByRole("link", { name: /read the code/i });
    expect(cta.getAttribute("href")).toContain("github.com/mattbutlerengineering");
    expect(cta).toHaveAttribute("target", "_blank");
    expect(cta.getAttribute("rel")).toContain("noopener");
    expect(cta.getAttribute("aria-label")).toMatch(/opens in new tab/i);
  });

  it("sends the secondary CTA to the live metrics dashboard", () => {
    renderHomePage();
    expect(screen.getByRole("link", { name: /live metrics/i })).toHaveAttribute("href", "/metrics");
  });
});

describe("HomePage weekly CTA", () => {
  it("renders the weekly CTA as a Rialto Card, not bespoke section markup", () => {
    renderHomePage();
    const weekly = screen.getByTestId("weekly-cta");
    expect(weekly.tagName).toBe("DIV");
    expect(weekly.className).toMatch(/card/i);
    expect(document.querySelector(".weeklyCta")).toBeNull();
    expect(
      within(weekly).getByRole("heading", { level: 2, name: /stay current/i })
    ).toBeInTheDocument();
    expect(within(weekly).getByRole("link", { name: /view weekly reads/i })).toBeInTheDocument();
  });
});

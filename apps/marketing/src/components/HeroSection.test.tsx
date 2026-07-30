import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RialtoProvider } from "@mattbutlerengineering/rialto";
import { HeroSection } from "./HeroSection.js";

const SUBTITLE =
  "A production monorepo run by one engineer and a fleet of coding agents — design system, booking platform, CI, infrastructure. The dashboards are live. Look around.";

// Renders the real Rialto primitives (not mocks) so the heading tag, the
// external CTA anchor, and the decorative canvas are the actual shipped DOM.
function renderHero() {
  return render(
    <RialtoProvider vibe="presenting">
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>
    </RialtoProvider>
  );
}

describe("HeroSection copy", () => {
  it("leads with the evidence-first h1", () => {
    renderHero();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This site ships itself.");
  });

  it("renders the subtitle and no eyebrow above the title", () => {
    const { container } = renderHero();
    const paragraphs = [...container.querySelectorAll("p")].map((p) => p.textContent?.trim());
    expect(paragraphs).toEqual([SUBTITLE]);
  });
});

describe("HeroSection actions", () => {
  it("offers exactly two CTAs: read the code, then live metrics", () => {
    renderHero();
    const ctaNames = screen.getAllByRole("link").map((link) => link.textContent?.trim());
    expect(ctaNames).toEqual(["Read the code", "Live metrics"]);
  });

  it("points the primary CTA at the repo and opens it safely in a new tab", () => {
    renderHero();
    const cta = screen.getByRole("link", { name: /read the code/i });
    expect(cta).toHaveAttribute(
      "href",
      "https://github.com/mattbutlerengineering/mattbutlerengineering"
    );
    expect(cta).toHaveAttribute("target", "_blank");
    expect(cta.getAttribute("rel")).toContain("noopener");
    expect(cta.getAttribute("rel")).toContain("noreferrer");
    expect(cta.getAttribute("aria-label")).toMatch(/opens in new tab/i);
  });

  it("routes the secondary CTA to the internal metrics dashboard", () => {
    renderHero();
    expect(screen.getByRole("link", { name: /live metrics/i })).toHaveAttribute("href", "/metrics");
  });

  it("drops the retired scroll buttons and the LinkedIn CTA", () => {
    renderHero();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/linkedin/i)).toBeNull();
  });
});

describe("HeroSection backdrop", () => {
  it("layers a decorative SilkFlow canvas that screen readers ignore", () => {
    const { container } = renderHero();
    const silk = container.querySelector("canvas, [data-silk-poster]");
    expect(silk).not.toBeNull();
    expect(silk?.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});

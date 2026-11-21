import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrivacyPage } from "./PrivacyPage.js";

describe("PrivacyPage", () => {
  it("wraps its content in a single main landmark (axe landmark-one-main and region, #7188)", () => {
    render(<PrivacyPage />);
    const main = screen.getByRole("main");
    expect(main).toContainElement(screen.getByRole("heading", { level: 1 }));
  });

  it("describes the cookie categories the banner actually offers, and no analytics cookies", () => {
    render(<PrivacyPage />);
    const text = screen.getByRole("main").textContent ?? "";
    expect(text).toMatch(/Functional/);
    expect(text).toMatch(/Marketing/);
    expect(text).not.toMatch(/via analytics cookies/i);
    expect(text).not.toMatch(/Analytics and functional cookies/);
  });

  it("documents the cookie-free edge request log and the error reports the site does keep", () => {
    render(<PrivacyPage />);
    const text = screen.getByRole("main").textContent ?? "";
    expect(text).toMatch(/request log/i);
    expect(text).toMatch(/Sentry/);
  });

  // The browser SDK keeps its default session tracking (`integrations: []` in
  // @mbe/sentry/react), so every page load reports a visit, not only failures.
  it("says every visit reaches the error tracker, and does not claim no personal data is collected", () => {
    render(<PrivacyPage />);
    const text = (screen.getByRole("main").textContent ?? "").replace(/\s+/g, " ");
    expect(text).toMatch(/each page you open tells our error tracker a visit started/i);
    expect(text).not.toMatch(/do not collect personally identifiable information/i);
    expect(text).toMatch(/Apart from the IP address an error report can carry/);
  });

  it("discloses that Google Fonts receives the visitor's IP address", () => {
    render(<PrivacyPage />);
    const text = (screen.getByRole("main").textContent ?? "").replace(/\s+/g, " ");
    expect(text).toMatch(/Google Fonts/);
    expect(text).toMatch(/Google Fonts[^.]*IP address/);
  });

  it("names the demo avatar host and says the visit ping can carry the IP address too", () => {
    render(<PrivacyPage />);
    const text = (screen.getByRole("main").textContent ?? "").replace(/\s+/g, " ");
    expect(text).toMatch(/pravatar\.cc/);
    expect(text).toMatch(/Apart from the IP address that an error report or visit ping can carry/);
  });
});

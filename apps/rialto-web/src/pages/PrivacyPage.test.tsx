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
});

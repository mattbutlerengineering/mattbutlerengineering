import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrivacyPage } from "./PrivacyPage.js";

describe("PrivacyPage", () => {
  it("wraps its content in a single main landmark (axe landmark-one-main and region, #7188)", () => {
    render(<PrivacyPage />);
    const main = screen.getByRole("main");
    expect(main).toContainElement(screen.getByRole("heading", { level: 1 }));
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardPurpose } from "./DashboardPurpose";

describe("DashboardPurpose", () => {
  it("states the purpose and links to the other two dashboards", () => {
    render(<DashboardPurpose current="/metrics" />);

    expect(screen.getByText(/delivery outcomes/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AI health" }).getAttribute("href")).toBe("/ai-health");
    expect(screen.getByRole("link", { name: "ACMM" }).getAttribute("href")).toBe("/acmm");
    expect(screen.queryByRole("link", { name: "Metrics" })).toBeNull();
  });

  it.each([
    ["/ai-health", /live sensor status/i, ["Metrics", "ACMM"]],
    ["/acmm", /maturity score and its evidence/i, ["Metrics", "AI health"]],
  ] as const)("describes %s", (current, purpose, links) => {
    render(<DashboardPurpose current={current} />);
    expect(screen.getByText(purpose)).toBeInTheDocument();
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(links);
  });
});

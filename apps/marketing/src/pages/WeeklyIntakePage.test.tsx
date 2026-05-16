/* eslint-disable @typescript-eslint/no-explicit-any, mbe-local/prefer-rialto-components */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WeeklyIntakePage } from "./WeeklyIntakePage.js";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Heading: ({ children }: any) => <h2>{children}</h2>,
  Text: ({ children }: any) => <p>{children}</p>,
  Card: ({ children }: any) => <div>{children}</div>,
  Badge: ({ children }: any) => <span>{children}</span>,
  Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
  Icon: () => <div />,
}));

describe("WeeklyIntakePage", () => {
  it("renders the page heading and subtitle", () => {
    render(<WeeklyIntakePage />);
    expect(screen.getByText("Weekly Information Intake")).toBeInTheDocument();
    expect(
      screen.getByText(/Curated resources from the best weekly newsletters/i)
    ).toBeInTheDocument();
  });

  it("renders all filter buttons", () => {
    render(<WeeklyIntakePage />);
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "JS Weekly" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "React Weekly" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI Weekly" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Other" })).toBeInTheDocument();
  });

  it("shows all 5 resources by default (All filter active)", () => {
    render(<WeeklyIntakePage />);
    // Each resource card has an anchor link as its title
    const resourceLinks = screen.getAllByRole("link");
    expect(resourceLinks).toHaveLength(5);
  });

  it("filters to JS Weekly resources when that filter is clicked", async () => {
    const user = userEvent.setup();
    render(<WeeklyIntakePage />);

    await user.click(screen.getByRole("button", { name: "JS Weekly" }));

    // Only js-weekly sources: "JavaScript Weekly" and "Node Weekly"
    expect(screen.getByText("JavaScript Weekly")).toBeInTheDocument();
    expect(screen.getByText("Node Weekly")).toBeInTheDocument();
    // React Weekly source should not be visible
    expect(screen.queryByText("React Status")).not.toBeInTheDocument();
    // AI Weekly source should not be visible
    expect(screen.queryByText("AI Breakfast")).not.toBeInTheDocument();
  });

  it("filters to React Weekly resources when that filter is clicked", async () => {
    const user = userEvent.setup();
    render(<WeeklyIntakePage />);

    await user.click(screen.getByRole("button", { name: "React Weekly" }));

    expect(screen.getByText("React Status")).toBeInTheDocument();
    expect(screen.queryByText("JavaScript Weekly")).not.toBeInTheDocument();
    expect(screen.queryByText("AI Breakfast")).not.toBeInTheDocument();
    expect(screen.queryByText("Node Weekly")).not.toBeInTheDocument();
  });

  it("filters to AI Weekly resources when that filter is clicked", async () => {
    const user = userEvent.setup();
    render(<WeeklyIntakePage />);

    await user.click(screen.getByRole("button", { name: "AI Weekly" }));

    expect(screen.getByText("AI Breakfast")).toBeInTheDocument();
    expect(screen.queryByText("JavaScript Weekly")).not.toBeInTheDocument();
    expect(screen.queryByText("React Status")).not.toBeInTheDocument();
  });

  it("filters to Other resources when that filter is clicked", async () => {
    const user = userEvent.setup();
    render(<WeeklyIntakePage />);

    await user.click(screen.getByRole("button", { name: "Other" }));

    expect(screen.getByText("Frontend Focus")).toBeInTheDocument();
    expect(screen.queryByText("JavaScript Weekly")).not.toBeInTheDocument();
    expect(screen.queryByText("React Status")).not.toBeInTheDocument();
    expect(screen.queryByText("AI Breakfast")).not.toBeInTheDocument();
  });

  it("returns to showing all resources after switching back to All", async () => {
    const user = userEvent.setup();
    render(<WeeklyIntakePage />);

    await user.click(screen.getByRole("button", { name: "React Weekly" }));
    expect(screen.getAllByRole("link")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("renders each resource card with a link to the external URL", () => {
    render(<WeeklyIntakePage />);
    const jsWeeklyLink = screen.getByText("JavaScript Weekly").closest("a") as HTMLAnchorElement;
    expect(jsWeeklyLink).toHaveAttribute("href", "https://javascriptweekly.com");
    expect(jsWeeklyLink).toHaveAttribute("target", "_blank");
    expect(jsWeeklyLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders the published date as a time element", () => {
    render(<WeeklyIntakePage />);
    // All resources share the same publishedAt in the fixture data
    const timeElements = document.querySelectorAll("time");
    expect(timeElements.length).toBe(5);
    timeElements.forEach((el) => {
      expect(el).toHaveAttribute("dateTime", "2026-04-29");
    });
  });

  it("renders source badge labels for each resource", () => {
    render(<WeeklyIntakePage />);
    // Badge mock renders as <span>; filter buttons render as <button>.
    // Two js-weekly items → two <span> badges labelled "JS Weekly"
    const spans = () => [...document.querySelectorAll("span")];
    const jsWeeklyBadges = spans().filter((el) => el.textContent === "JS Weekly");
    expect(jsWeeklyBadges).toHaveLength(2);

    const reactBadges = spans().filter((el) => el.textContent === "React Weekly");
    expect(reactBadges).toHaveLength(1);

    const aiBadges = spans().filter((el) => el.textContent === "AI Weekly");
    expect(aiBadges).toHaveLength(1);
  });
});

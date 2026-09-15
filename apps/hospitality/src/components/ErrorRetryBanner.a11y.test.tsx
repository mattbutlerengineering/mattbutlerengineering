import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorRetryBanner } from "./ErrorRetryBanner.js";

/**
 * Renders the real rialto Alert / Button / Collapsible / Text (no mocks) so the roles and names a
 * screen reader gets are the ones asserted. There is no unit-level axe harness in this package
 * (`@axe-core/playwright` only runs in E2E), so the structural contract is asserted directly.
 */
describe("ErrorRetryBanner (real rialto render)", () => {
  const detail =
    "The reservations service hit a snag — nothing was changed. Try again in a moment.";
  const rawLine = "POST /api/v1/reservations/walk-in failed: 500 Internal Server Error";

  it("is one alert announcing title then detail, with Retry, Show details and Dismiss as named buttons", () => {
    render(
      <ErrorRetryBanner
        title="Walk-in not seated."
        error={detail}
        details={rawLine}
        onRetry={() => {}}
        onDismiss={() => {}}
      />
    );

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.textContent?.startsWith(`Walk-in not seated.${detail}`)).toBe(true);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show details" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    // The raw request line is behind the collapsible, not in the initial announcement.
    expect(screen.queryByText(rawLine)).toBeNull();
  });

  it("reveals the raw request line in a labelled region on demand", async () => {
    render(<ErrorRetryBanner title="Walk-in not seated." error={detail} details={rawLine} />);

    fireEvent.click(screen.getByRole("button", { name: "Show details" }));

    expect(await screen.findByText(rawLine)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show details" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByRole("region", { name: "Show details" })).toHaveTextContent(rawLine);
  });

  it("renders only the alert when Retry, details and dismiss are all absent", () => {
    render(<ErrorRetryBanner error={detail} />);

    expect(screen.getByRole("alert")).toHaveTextContent(detail);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("gives Retry a 44 px minimum under the coarse-pointer / tablet query", () => {
    render(<ErrorRetryBanner error={detail} onRetry={() => {}} />);

    // vitest maps CSS-module classes non-scoped, so the class name is the source name.
    expect(screen.getByRole("button", { name: "Retry" })).toHaveClass("retry");

    const css = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "ErrorRetryBanner.module.css"),
      "utf-8"
    );
    const coarseBlock = css.match(
      /@media \(pointer: coarse\), \(max-width: 1024px\) \{([\s\S]*?)\n\}/
    );
    expect(coarseBlock).not.toBeNull();
    expect(coarseBlock?.[1]).toMatch(/\.retry\s*\{[^}]*min-block-size:\s*44px/);
    expect(coarseBlock?.[1]).toMatch(/\.retry\s*\{[^}]*min-inline-size:\s*44px/);
  });
});

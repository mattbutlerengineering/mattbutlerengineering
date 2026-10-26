import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import { AvailabilityMigrationBanner } from "./AvailabilityMigrationBanner.js";

// jsdom cannot compute colour contrast; token contrast is covered in rialto.
const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } };

const renderBanner = (venueId = "venue-1") =>
  render(
    <main>
      <AvailabilityMigrationBanner venueId={venueId} />
    </main>
  );

describe("AvailabilityMigrationBanner", () => {
  beforeEach(() => window.localStorage.clear());

  it("tells a migrated venue its hours were carried over and nothing changed for guests", () => {
    renderBanner();
    expect(
      screen.getByText("Your hours were carried over. Nothing changed for guests.")
    ).toBeInTheDocument();
  });

  it("goes away once dismissed, and stays away for that venue only", () => {
    const first = renderBanner();
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText(/carried over/)).not.toBeInTheDocument();
    first.unmount();

    renderBanner();
    expect(screen.queryByText(/carried over/)).not.toBeInTheDocument();
    renderBanner("venue-2");
    expect(screen.getByText(/carried over/)).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    renderBanner();
    expect((await axe(document.body, AXE_OPTIONS)).violations).toEqual([]);
  });
});

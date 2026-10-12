import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { DriverLayout } from "./DriverLayout";

vi.mock("@mattbutlerengineering/rialto", () => ({
  Breadcrumb: ({ items }: { items: { label: string }[] }) => (
    <nav aria-label="Breadcrumb">{items.map((i) => i.label).join(" / ")}</nav>
  ),
}));

function renderInsideDemoShell(children: ReactNode) {
  // DemoLayout owns the page's single <main>; DriverLayout renders inside it.
  return render(
    <MemoryRouter>
      <main id="main-content">{children}</main>
    </MemoryRouter>
  );
}

describe("DriverLayout landmarks", () => {
  it("does not nest a second main landmark inside the demo shell's main", () => {
    renderInsideDemoShell(
      <DriverLayout title="Drivers" breadcrumbs={[{ label: "Drivers" }]}>
        <p>content</p>
      </DriverLayout>
    );
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RialtoProvider } from "@mattbutlerengineering/rialto";
import { ProjectsSection } from "./ProjectsSection.js";

describe("ProjectsSection demo venue entry point", () => {
  it("links to the demo venue's public booking page", () => {
    render(
      <RialtoProvider vibe="presenting">
        <ProjectsSection />
      </RialtoProvider>
    );
    const link = screen.getByRole("link", { name: /book a table at the demo restaurant/i });
    expect(link).toHaveAttribute("href", "/hospitality/book/demo-bistro");
  });
});

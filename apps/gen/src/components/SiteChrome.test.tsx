import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { SiteChrome } from "./SiteChrome.js";

interface MenuProps {
  menu?: { label: string; items: { label: string; href: string; current?: boolean }[] };
}
interface FooterProps {
  variant?: string;
  columns?: { title: string; links: { label: string; href: string }[] }[];
  copyright?: string;
}

vi.mock("@mattbutlerengineering/rialto", () => ({
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
  GlobalNav: ({ menu }: MenuProps) => (
    <nav aria-label="Global">
      <button>{menu?.label}</button>
      <ul>
        {menu?.items.map((item) => (
          <li key={item.href}>
            <a href={item.href}>{item.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  ),
  Footer: ({ variant, columns, copyright }: FooterProps) => (
    <footer data-variant={variant}>
      {columns?.map((column) => (
        <nav key={column.title} aria-label={column.title}>
          {column.links.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
      ))}
      <small>{copyright}</small>
    </footer>
  ),
}));

describe("SiteChrome", () => {
  it("gives the header the same Engineering menu as the rest of the site", () => {
    render(<SiteChrome>body</SiteChrome>);
    expect(screen.getByRole("button", { name: "Engineering" })).toBeDefined();
    const header = within(screen.getByRole("navigation", { name: "Global" }));
    for (const label of ["Metrics", "Shipped", "Status", "AI health", "ACMM", "Gen"]) {
      expect(header.getByRole("link", { name: label })).toBeDefined();
    }
  });

  it("gives the footer the project and contact columns, not a bare copyright", () => {
    render(<SiteChrome>body</SiteChrome>);
    const footer = screen.getByRole("contentinfo");
    expect(footer.getAttribute("data-variant")).toBe("rich");
    expect(screen.getByRole("navigation", { name: "Projects" })).toBeDefined();
    expect(screen.getByRole("navigation", { name: "Connect" })).toBeDefined();
    expect(footer.textContent).toContain(`${new Date().getFullYear()} Matt Butler Engineering`);
  });

  it("renders the page body between header and footer", () => {
    render(<SiteChrome>page body</SiteChrome>);
    expect(screen.getByText("page body")).toBeDefined();
  });
});

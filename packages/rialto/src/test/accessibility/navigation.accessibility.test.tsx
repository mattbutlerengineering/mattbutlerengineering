import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";

/* ── Components ─────────────────────────────── */
import { AppBar } from "../../components/AppBar/AppBar";
import { Footer } from "../../components/Footer/Footer";
import { Navbar } from "../../components/Navbar/Navbar";
import { NavigationMenu } from "../../components/NavigationMenu/NavigationMenu";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { Pagination } from "../../components/Pagination/Pagination";
import { Sidebar } from "../../components/Sidebar/Sidebar";
import { Steps } from "../../components/Steps/Steps";
import { Tree } from "../../components/Tree/Tree";

describe("Accessibility — Navigation Components", () => {
  it("AppBar", async () => {
    const { container } = render(<AppBar logo="Rialto" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Footer", async () => {
    const { container } = render(<Footer copyright="© 2024 Rialto" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Navbar", async () => {
    const { container } = render(
      <Navbar
        logo="Rialto"
        links={[
          { id: "1", label: "Home", href: "/" },
          { id: "2", label: "Products", href: "/products" },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("NavigationMenu", async () => {
    const { container } = render(
      <NavigationMenu
        items={[
          { label: "Features", href: "/features" },
          { label: "Pricing", href: "/pricing" },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("PageHeader", async () => {
    const { container } = render(
      <PageHeader
        title="Account Settings"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Settings" },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Pagination", async () => {
    const { container } = render(<Pagination page={1} totalPages={5} onChange={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Sidebar", async () => {
    const { container } = render(
      <Sidebar
        items={[
          { id: "1", label: "Dashboard", href: "/dashboard" },
          { id: "2", label: "Settings", href: "/settings" },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Steps", async () => {
    const { container } = render(
      <Steps
        currentStep={1}
        steps={[
          { label: "Step 1" },
          { label: "Step 2" },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Tree", async () => {
    const { container } = render(
      <Tree
        data={[
          { id: "1", label: "Root", children: [{ id: "2", label: "Child" }] },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  describe("rendering", () => {
    it("renders as header element", () => {
      render(<PageHeader title="Account Settings" />);
      expect(screen.getByRole("banner")).toBeInTheDocument();
    });

    it("renders title", () => {
      render(<PageHeader title="Account Settings" />);
      expect(screen.getByRole("heading", { name: "Account Settings" })).toBeInTheDocument();
    });

    it("renders breadcrumbs when provided", () => {
      render(
        <PageHeader
          title="Settings"
          breadcrumbs={[{ label: "Home", href: "/" }, { label: "Settings" }]}
        />
      );
      expect(screen.getByText("Home")).toBeInTheDocument();
      expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
    });

    it("does not render breadcrumbs when not provided", () => {
      render(<PageHeader title="Settings" />);
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    });

    it("renders actions when provided", () => {
      render(
        <PageHeader
          title="Settings"
          actions={<button>Save</button>}
        />
      );
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });

    it("renders meta content", () => {
      render(
        <PageHeader
          title="Settings"
          meta={<span>v1.2.3</span>}
        />
      );
      expect(screen.getByText("v1.2.3")).toBeInTheDocument();
    });

    it("renders children below title row", () => {
      render(
        <PageHeader title="Settings">
          <p>Extra content</p>
        </PageHeader>
      );
      expect(screen.getByText("Extra content")).toBeInTheDocument();
    });

    it("applies custom className", () => {
      const { container } = render(
        <PageHeader title="Settings" className="custom-header" />
      );
      expect(container.querySelector(".custom-header")).toBeInTheDocument();
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to header element", () => {
      const ref = { current: null as HTMLElement | null };
      render(<PageHeader ref={ref} title="Settings" />);
      expect(ref.current).toBeInstanceOf(HTMLElement);
    });
  });

  describe("accessibility", () => {
    it("passes axe", async () => {
      const { container } = render(
        <PageHeader
          title="Account Settings"
          breadcrumbs={[{ label: "Home", href: "/" }, { label: "Settings" }]}
          actions={<button>Save</button>}
        />
      );
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});

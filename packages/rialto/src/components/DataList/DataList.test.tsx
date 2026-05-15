import { render, screen } from "@testing-library/react";
import { DataList } from "./DataList";
import type { DataListItem } from "./DataList";

const items: DataListItem[] = [
  { label: "Team", value: "Red Bull Racing" },
  { label: "Engine", value: "Honda RBPT" },
  { label: "Driver", value: "Max Verstappen" },
];

describe("DataList", () => {
  describe("rendering", () => {
    it("renders a definition list", () => {
      const { container } = render(<DataList items={items} />);
      expect(container.querySelector("dl")).toBeInTheDocument();
    });

    it("renders all labels", () => {
      render(<DataList items={items} />);
      expect(screen.getByText("Team")).toBeInTheDocument();
      expect(screen.getByText("Engine")).toBeInTheDocument();
      expect(screen.getByText("Driver")).toBeInTheDocument();
    });

    it("renders all values", () => {
      render(<DataList items={items} />);
      expect(screen.getByText("Red Bull Racing")).toBeInTheDocument();
      expect(screen.getByText("Honda RBPT")).toBeInTheDocument();
      expect(screen.getByText("Max Verstappen")).toBeInTheDocument();
    });

    it("renders ReactNode values", () => {
      render(<DataList items={[{ label: "Status", value: <span>Active</span> }]} />);
      expect(screen.getByText("Active")).toBeInTheDocument();
    });

    it("renders correct number of rows", () => {
      const { container } = render(<DataList items={items} />);
      // Each item renders a dt + dd inside a div.row
      expect(container.querySelectorAll("dt")).toHaveLength(3);
      expect(container.querySelectorAll("dd")).toHaveLength(3);
    });
  });

  describe("orientation", () => {
    it("applies horizontal class by default", () => {
      const { container } = render(<DataList items={items} />);
      expect(container.querySelector("dl")?.className).toMatch(/horizontal/);
    });

    it("applies vertical class when orientation=vertical", () => {
      const { container } = render(<DataList items={items} orientation="vertical" />);
      expect(container.querySelector("dl")?.className).toMatch(/vertical/);
    });
  });

  describe("striped", () => {
    it("does not apply striped class by default", () => {
      const { container } = render(<DataList items={items} />);
      expect(container.querySelector("dl")?.className).not.toMatch(/striped/);
    });

    it("applies striped class when striped=true", () => {
      const { container } = render(<DataList items={items} striped />);
      expect(container.querySelector("dl")?.className).toMatch(/striped/);
    });
  });

  describe("className and ref", () => {
    it("applies custom className", () => {
      const { container } = render(<DataList items={items} className="my-list" />);
      expect(container.querySelector("dl")?.className).toMatch(/my-list/);
    });

    it("forwards ref to the dl element", () => {
      const ref = { current: null as HTMLDListElement | null };
      render(<DataList items={items} ref={ref} />);
      expect(ref.current).toBeInstanceOf(HTMLDListElement);
    });
  });
});

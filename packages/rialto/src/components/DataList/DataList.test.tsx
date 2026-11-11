import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import { DataList } from "./DataList";
import type { DataListItem } from "./DataList";

const cssPath = resolve(dirname(fileURLToPath(import.meta.url)), "DataList.module.css");

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

  describe("edge cases", () => {
    it("renders nothing when items is empty", () => {
      const { container } = render(<DataList items={[]} />);
      expect(container.querySelectorAll("dt")).toHaveLength(0);
      expect(container.querySelectorAll("dd")).toHaveLength(0);
    });

    it("forwards HTML attributes like id", () => {
      const { container } = render(<DataList items={items} id="spec-list" />);
      expect(container.querySelector("dl")?.id).toBe("spec-list");
    });

    it("renders a single item", () => {
      render(<DataList items={[{ label: "Solo", value: "Only" }]} />);
      expect(screen.getByText("Solo")).toBeInTheDocument();
      expect(screen.getByText("Only")).toBeInTheDocument();
    });

    it("lets an unbreakable value wrap inside the list", () => {
      // A run of Latin letters has no soft-wrap opportunity. In a column flex
      // parent (the team-review form) the list's min-content width then beats
      // the card, and the glyphs paint past the 640px edge. `anywhere` creates
      // the wrap, and min-inline-size: 0 lets the flex item use it.
      const css = readFileSync(cssPath, "utf8");
      const value = css.match(/\.value\s*\{([^}]+)\}/)?.[1] ?? "";
      const list = css.match(/\.list\s*\{([^}]+)\}/)?.[1] ?? "";
      expect(value).toMatch(/overflow-wrap:\s*anywhere/);
      expect(value).toMatch(/min-inline-size:\s*0/);
      expect(list).toMatch(/min-inline-size:\s*0/);
    });

    it("keeps a horizontal value from collapsing to zero width", () => {
      const css = readFileSync(cssPath, "utf8");
      const row = css.match(/\.horizontal \.row\s*\{([^}]+)\}/)?.[1] ?? "";
      const label = css.match(/\.horizontal \.label\s*\{([^}]+)\}/)?.[1] ?? "";
      const value = css.match(/\.horizontal \.value\s*\{([^}]+)\}/)?.[1] ?? "";
      expect(row).toMatch(/flex-wrap:\s*wrap/);
      expect(label).toMatch(/flex:\s*0 1 140px/);
      expect(label).not.toMatch(/flex-shrink:\s*0/);
      // A content-sized list (flex-start column) has no definite width to
      // resolve the flex basis against; an explicit width keeps the label at
      // 140px so the value stays beside it instead of wrapping under it.
      expect(label).toMatch(/(?<![-\w])width:\s*140px/);
      expect(value).toMatch(/flex:\s*1 1 5\.5rem/);
      expect(value).toMatch(/min-inline-size:\s*min\(5\.5rem,\s*100%\)/);
    });

    it("applies striped and vertical classes together", () => {
      const { container } = render(<DataList items={items} orientation="vertical" striped />);
      const cls = container.querySelector("dl")?.className ?? "";
      expect(cls).toMatch(/vertical/);
      expect(cls).toMatch(/striped/);
    });
  });
});

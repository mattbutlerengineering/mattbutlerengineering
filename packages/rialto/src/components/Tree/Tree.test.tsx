import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { Tree } from "./Tree";
import type { TreeNode } from "./Tree";

const treeData: TreeNode[] = [
  {
    id: "powertrain",
    label: "Powertrain",
    children: [
      { id: "ice", label: "ICE" },
      { id: "mgu-k", label: "MGU-K" },
    ],
  },
  { id: "chassis", label: "Chassis" },
  { id: "aero", label: "Aerodynamics", disabled: true },
];

describe("Tree", () => {
  describe("rendering", () => {
    it("renders with role=tree", () => {
      render(<Tree data={treeData} />);
      expect(screen.getByRole("tree")).toBeInTheDocument();
    });

    it("renders top-level nodes", () => {
      render(<Tree data={treeData} />);
      expect(
        screen.getByRole("treeitem", { name: /powertrain/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("treeitem", { name: /chassis/i })
      ).toBeInTheDocument();
    });

    it("does not render child nodes when parent is collapsed", () => {
      render(<Tree data={treeData} />);
      expect(screen.queryByRole("treeitem", { name: /ice/i })).not.toBeInTheDocument();
    });

    it("renders child nodes when parent is defaultExpanded", () => {
      render(<Tree data={treeData} defaultExpanded={["powertrain"]} />);
      expect(screen.getByRole("treeitem", { name: /ice/i })).toBeInTheDocument();
      expect(screen.getByRole("treeitem", { name: /mgu-k/i })).toBeInTheDocument();
    });

    it("marks parent with aria-expanded=false by default", () => {
      render(<Tree data={treeData} />);
      expect(
        screen.getByRole("treeitem", { name: /powertrain/i })
      ).toHaveAttribute("aria-expanded", "false");
    });

    it("marks parent with aria-expanded=true when expanded", () => {
      render(<Tree data={treeData} defaultExpanded={["powertrain"]} />);
      expect(
        screen.getByRole("treeitem", { name: /powertrain/i })
      ).toHaveAttribute("aria-expanded", "true");
    });

    it("marks disabled nodes with aria-disabled", () => {
      render(<Tree data={treeData} />);
      expect(
        screen.getByRole("treeitem", { name: /aerodynamics/i })
      ).toHaveAttribute("aria-disabled", "true");
    });
  });

  describe("interactions", () => {
    it("expands node when chevron is clicked", async () => {
      const user = userEvent.setup();
      const { container } = render(<Tree data={treeData} />);
      // The chevron span is inside the treeitem, click it directly
      const chevrons = container.querySelectorAll("[class*='toggleVisible']");
      await user.click(chevrons[0]!);
      expect(screen.getByRole("treeitem", { name: /ice/i })).toBeInTheDocument();
    });

    it("collapses expanded node when chevron is clicked again", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <Tree data={treeData} defaultExpanded={["powertrain"]} />
      );
      expect(screen.getByRole("treeitem", { name: /ice/i })).toBeInTheDocument();
      const chevrons = container.querySelectorAll("[class*='toggleVisible']");
      await user.click(chevrons[0]!);
      expect(screen.queryByRole("treeitem", { name: /ice/i })).not.toBeInTheDocument();
    });

    it("calls onSelect when node is clicked", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<Tree data={treeData} onSelect={onSelect} />);
      await user.click(screen.getByRole("treeitem", { name: /chassis/i }));
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ id: "chassis" })
      );
    });

    it("does not call onSelect for disabled nodes", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<Tree data={treeData} onSelect={onSelect} />);
      await user.click(screen.getByRole("treeitem", { name: /aerodynamics/i }));
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("marks selected node with aria-selected", async () => {
      const user = userEvent.setup();
      render(<Tree data={treeData} />);
      await user.click(screen.getByRole("treeitem", { name: /chassis/i }));
      expect(
        screen.getByRole("treeitem", { name: /chassis/i })
      ).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("keyboard navigation", () => {
    it("ArrowDown moves focus to next visible node", () => {
      render(<Tree data={treeData} />);
      const tree = screen.getByRole("tree");
      const firstItem = screen.getByRole("treeitem", { name: /powertrain/i });
      act(() => { firstItem.focus(); });
      fireEvent.keyDown(tree, { key: "ArrowDown" });
      expect(document.activeElement).toHaveAttribute("data-tree-id", "chassis");
    });

    it("ArrowRight expands a collapsed parent", () => {
      render(<Tree data={treeData} />);
      const tree = screen.getByRole("tree");
      const parentItem = screen.getByRole("treeitem", { name: /powertrain/i });
      act(() => { parentItem.focus(); });
      fireEvent.keyDown(tree, { key: "ArrowRight" });
      expect(screen.getByRole("treeitem", { name: /ice/i })).toBeInTheDocument();
    });

    it("Enter selects focused node", () => {
      const onSelect = vi.fn();
      render(<Tree data={treeData} onSelect={onSelect} />);
      const tree = screen.getByRole("tree");
      const chassisItem = screen.getByRole("treeitem", { name: /chassis/i });
      act(() => { chassisItem.focus(); });
      fireEvent.keyDown(tree, { key: "Enter" });
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ id: "chassis" })
      );
    });

    it("Home jumps to first node", () => {
      render(<Tree data={treeData} />);
      const tree = screen.getByRole("tree");
      const lastItem = screen.getByRole("treeitem", { name: /aerodynamics/i });
      act(() => { lastItem.focus(); });
      fireEvent.keyDown(tree, { key: "Home" });
      expect(document.activeElement).toHaveAttribute("data-tree-id", "powertrain");
    });

    it("End jumps to last node", () => {
      render(<Tree data={treeData} />);
      const tree = screen.getByRole("tree");
      const firstItem = screen.getByRole("treeitem", { name: /powertrain/i });
      act(() => { firstItem.focus(); });
      fireEvent.keyDown(tree, { key: "End" });
      expect(document.activeElement).toHaveAttribute("data-tree-id", "aero");
    });
  });

  describe("controlled mode", () => {
    it("respects controlled expanded prop", () => {
      const { rerender } = render(
        <Tree data={treeData} expanded={[]} onExpandedChange={() => {}} />
      );
      expect(screen.queryByRole("treeitem", { name: /ice/i })).not.toBeInTheDocument();

      rerender(
        <Tree
          data={treeData}
          expanded={["powertrain"]}
          onExpandedChange={() => {}}
        />
      );
      expect(screen.getByRole("treeitem", { name: /ice/i })).toBeInTheDocument();
    });

    it("calls onExpandedChange when chevron is clicked", async () => {
      const user = userEvent.setup();
      const onExpandedChange = vi.fn();
      const { container } = render(
        <Tree
          data={treeData}
          expanded={[]}
          onExpandedChange={onExpandedChange}
        />
      );
      const chevrons = container.querySelectorAll("[class*='toggleVisible']");
      await user.click(chevrons[0]!);
      expect(onExpandedChange).toHaveBeenCalledWith(["powertrain"]);
    });
  });

  describe("accessibility", () => {
    it("passes axe", async () => {
      const { container } = render(
        <Tree data={treeData} defaultExpanded={["powertrain"]} />
      );
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});

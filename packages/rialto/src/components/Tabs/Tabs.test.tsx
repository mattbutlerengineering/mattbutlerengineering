import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs, type Tab } from "./Tabs";

const tabs: Tab[] = [
  { id: "overview", label: "Overview", content: <p>Overview content</p> },
  { id: "details", label: "Details", content: <p>Details content</p> },
  { id: "history", label: "History", content: <p>History content</p> },
];

const tabsWithDisabled: Tab[] = [
  { id: "a", label: "Alpha", content: <p>Alpha</p> },
  { id: "b", label: "Beta", content: <p>Beta</p>, disabled: true },
  { id: "c", label: "Gamma", content: <p>Gamma</p> },
];

describe("Tabs", () => {
  describe("rendering", () => {
    it("renders a tablist", () => {
      render(<Tabs tabs={tabs} />);
      expect(screen.getByRole("tablist")).toBeInTheDocument();
    });

    it("renders all tab buttons", () => {
      render(<Tabs tabs={tabs} />);
      expect(screen.getAllByRole("tab")).toHaveLength(3);
    });

    it("renders the active panel content", () => {
      render(<Tabs tabs={tabs} defaultTab="overview" />);
      expect(screen.getByRole("tabpanel")).toBeInTheDocument();
      expect(screen.getByText("Overview content")).toBeInTheDocument();
    });

    it("defaults to the first tab when no defaultTab given", () => {
      render(<Tabs tabs={tabs} />);
      expect(screen.getByText("Overview content")).toBeInTheDocument();
    });

    it("shows the defaultTab content on mount", () => {
      render(<Tabs tabs={tabs} defaultTab="details" />);
      expect(screen.getByText("Details content")).toBeInTheDocument();
    });
  });

  describe("tab switching", () => {
    it("switches to clicked tab", async () => {
      const user = userEvent.setup();
      render(<Tabs tabs={tabs} />);
      await user.click(screen.getByRole("tab", { name: "Details" }));
      expect(screen.getByText("Details content")).toBeInTheDocument();
    });

    it("hides the previous tab content after switching", async () => {
      const user = userEvent.setup();
      render(<Tabs tabs={tabs} />);
      await user.click(screen.getByRole("tab", { name: "History" }));
      expect(screen.queryByText("Overview content")).not.toBeInTheDocument();
    });

    it("calls onTabChange when a tab is clicked", async () => {
      const user = userEvent.setup();
      const onTabChange = vi.fn();
      render(<Tabs tabs={tabs} onTabChange={onTabChange} />);
      await user.click(screen.getByRole("tab", { name: "Details" }));
      expect(onTabChange).toHaveBeenCalledWith("details");
    });

    it("marks clicked tab as aria-selected=true", async () => {
      const user = userEvent.setup();
      render(<Tabs tabs={tabs} />);
      await user.click(screen.getByRole("tab", { name: "Details" }));
      expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
    });

    it("marks previous tab as aria-selected=false after switching", async () => {
      const user = userEvent.setup();
      render(<Tabs tabs={tabs} />);
      await user.click(screen.getByRole("tab", { name: "Details" }));
      expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
        "aria-selected",
        "false"
      );
    });

    it("does not switch to a disabled tab on click", async () => {
      const user = userEvent.setup();
      render(<Tabs tabs={tabsWithDisabled} />);
      await user.click(screen.getByRole("tab", { name: "Beta" }));
      // Alpha tab should still be selected (not Beta)
      expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("aria-selected", "false");
    });
  });

  describe("keyboard navigation", () => {
    it("moves to next tab with ArrowRight", async () => {
      const user = userEvent.setup();
      render(<Tabs tabs={tabs} />);
      screen.getByRole("tab", { name: "Overview" }).focus();
      await user.keyboard("{ArrowRight}");
      expect(screen.getByRole("tab", { name: "Details" })).toHaveFocus();
      expect(screen.getByText("Details content")).toBeInTheDocument();
    });

    it("moves to previous tab with ArrowLeft", async () => {
      const user = userEvent.setup();
      render(<Tabs tabs={tabs} defaultTab="details" />);
      screen.getByRole("tab", { name: "Details" }).focus();
      await user.keyboard("{ArrowLeft}");
      expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus();
    });

    it("wraps from last to first with ArrowRight", async () => {
      const user = userEvent.setup();
      render(<Tabs tabs={tabs} defaultTab="history" />);
      screen.getByRole("tab", { name: "History" }).focus();
      await user.keyboard("{ArrowRight}");
      expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus();
    });

    it("wraps from first to last with ArrowLeft", async () => {
      const user = userEvent.setup();
      render(<Tabs tabs={tabs} />);
      screen.getByRole("tab", { name: "Overview" }).focus();
      await user.keyboard("{ArrowLeft}");
      expect(screen.getByRole("tab", { name: "History" })).toHaveFocus();
    });

    it("moves to first tab with Home key", async () => {
      const user = userEvent.setup();
      render(<Tabs tabs={tabs} defaultTab="history" />);
      screen.getByRole("tab", { name: "History" }).focus();
      await user.keyboard("{Home}");
      expect(screen.getByRole("tab", { name: "Overview" })).toHaveFocus();
    });

    it("moves to last tab with End key", async () => {
      const user = userEvent.setup();
      render(<Tabs tabs={tabs} />);
      screen.getByRole("tab", { name: "Overview" }).focus();
      await user.keyboard("{End}");
      expect(screen.getByRole("tab", { name: "History" })).toHaveFocus();
    });

    it("skips disabled tabs when navigating with ArrowRight", async () => {
      const user = userEvent.setup();
      render(<Tabs tabs={tabsWithDisabled} />);
      screen.getByRole("tab", { name: "Alpha" }).focus();
      await user.keyboard("{ArrowRight}");
      // Beta is disabled, should skip to Gamma
      expect(screen.getByRole("tab", { name: "Gamma" })).toHaveFocus();
    });
  });

  describe("ARIA attributes", () => {
    it("active tab has tabIndex=0", () => {
      render(<Tabs tabs={tabs} />);
      expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("tabIndex", "0");
    });

    it("inactive tabs have tabIndex=-1", () => {
      render(<Tabs tabs={tabs} />);
      expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("tabIndex", "-1");
    });

    it("tab panel has aria-labelledby pointing to its tab", () => {
      render(<Tabs tabs={tabs} />);
      const panel = screen.getByRole("tabpanel");
      const labelledBy = panel.getAttribute("aria-labelledby");
      expect(labelledBy).toBe("tab-overview");
    });

    it("tab button has aria-controls pointing to its panel", () => {
      render(<Tabs tabs={tabs} />);
      const tab = screen.getByRole("tab", { name: "Overview" });
      expect(tab).toHaveAttribute("aria-controls", "panel-overview");
    });
  });

  describe("ref and className forwarding", () => {
    it("forwards ref to the root div", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<Tabs ref={ref} tabs={tabs} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });

    it("forwards className to the root div", () => {
      const { container } = render(<Tabs tabs={tabs} className="my-tabs" />);
      expect(container.firstElementChild?.className).toMatch(/my-tabs/);
    });
  });
});

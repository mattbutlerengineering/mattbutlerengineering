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
      const activeTab = screen.getByRole("tab", { name: "Overview" });
      expect(panel.getAttribute("aria-labelledby")).toBe(activeTab.id);
      expect(activeTab.id).toBeTruthy();
    });

    it("tab button has aria-controls pointing to its panel", () => {
      render(<Tabs tabs={tabs} />);
      const tab = screen.getByRole("tab", { name: "Overview" });
      const panel = screen.getByRole("tabpanel");
      expect(tab.getAttribute("aria-controls")).toBe(panel.id);
      expect(panel.id).toBeTruthy();
    });

    it("generates unique ids across two instances (useId)", () => {
      const { container: a } = render(<Tabs tabs={tabs} />);
      const { container: b } = render(<Tabs tabs={tabs} />);
      const tabA = (a.querySelector('[role="tab"]') as HTMLElement).id;
      const tabB = (b.querySelector('[role="tab"]') as HTMLElement).id;
      const panelA = (a.querySelector('[role="tabpanel"]') as HTMLElement).id;
      const panelB = (b.querySelector('[role="tabpanel"]') as HTMLElement).id;
      expect(tabA).not.toBe(tabB);
      expect(panelA).not.toBe(panelB);
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

  describe("a11y iteration 4", () => {
    it("only the active tab references a panel that exists (no dangling aria-controls)", () => {
      const { container } = render(<Tabs tabs={tabs} defaultTab="details" />);
      for (const tab of screen.getAllByRole("tab")) {
        const controls = tab.getAttribute("aria-controls");
        if (tab.getAttribute("aria-selected") === "true") {
          expect(controls).toBeTruthy();
          expect(container.querySelector(`[id="${controls}"]`)).toBeInTheDocument();
        } else {
          expect(controls).toBeNull();
        }
      }
    });

    it("routes aria-label to the tablist, not the wrapper", () => {
      const { container } = render(<Tabs tabs={tabs} aria-label="Account sections" />);
      expect(screen.getByRole("tablist", { name: "Account sections" })).toBeInTheDocument();
      expect(container.firstElementChild).not.toHaveAttribute("aria-label");
    });

    it("routes aria-labelledby to the tablist", () => {
      render(
        <>
          <h2 id="heading">Settings</h2>
          <Tabs tabs={tabs} aria-labelledby="heading" />
        </>
      );
      expect(screen.getByRole("tablist", { name: "Settings" })).toBeInTheDocument();
    });

    it("keeps one tab reachable when defaultTab matches no tab", () => {
      render(<Tabs tabs={tabs} defaultTab="missing" />);
      const tabbable = screen.getAllByRole("tab").filter((t) => t.tabIndex === 0);
      expect(tabbable).toHaveLength(1);
      expect(tabbable[0]).toHaveTextContent("Overview");
    });

    it("ArrowRight from an unmatched selection moves past the fallback tab stop", async () => {
      render(<Tabs tabs={tabs} defaultTab="missing" />);
      screen.getByRole("tab", { name: "Overview" }).focus();
      await userEvent.keyboard("{ArrowRight}");
      expect(screen.getByRole("tab", { name: "Details" })).toHaveFocus();
    });

    it("ArrowLeft from an unmatched selection wraps to the last tab", async () => {
      render(<Tabs tabs={tabs} defaultTab="missing" />);
      screen.getByRole("tab", { name: "Overview" }).focus();
      await userEvent.keyboard("{ArrowLeft}");
      expect(screen.getByRole("tab", { name: "History" })).toHaveFocus();
    });
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Alert } from "../../components/Alert/Alert";
import { Banner } from "../../components/Banner/Banner";
import { Collapsible } from "../../components/Collapsible/Collapsible";
import { SegmentedControl, type Segment } from "../../components/SegmentedControl/SegmentedControl";
import { Sidebar } from "../../components/Sidebar/Sidebar";
import { Slider } from "../../components/Slider/Slider";
import { Tabs, type Tab } from "../../components/Tabs/Tabs";

// The global test setup mocks `useReducedMotion` to `true`, which short-circuits
// every motion-gated branch. This file overrides it to `false` so the *animated*
// path is exercised — the transform/opacity + `layout` code that replaced the old
// height/width/left/padding/margin animations. These assertions guard that the
// components still render and behave when their compositor transitions are live.
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("framer-motion");
  return { ...actual, useReducedMotion: () => false };
});

describe("compositor animations (animated path)", () => {
  describe("Alert", () => {
    it("renders and fires onDismiss through the transform/opacity exit", async () => {
      const user = userEvent.setup();
      const onDismiss = vi.fn();
      render(
        <Alert dismissible onDismiss={onDismiss}>
          Heads up
        </Alert>
      );
      expect(screen.getByText("Heads up")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /dismiss/i }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe("Banner", () => {
    it("renders and fires onDismiss through the transform/opacity exit", async () => {
      const user = userEvent.setup();
      const onDismiss = vi.fn();
      render(
        <Banner dismissible onDismiss={onDismiss}>
          Update available
        </Banner>
      );
      expect(screen.getByText("Update available")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /dismiss/i }));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe("Collapsible", () => {
    it("mounts and unmounts content around the layout transition", async () => {
      const user = userEvent.setup();
      render(<Collapsible trigger="Details">Body copy</Collapsible>);
      expect(screen.queryByText("Body copy")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /details/i }));
      expect(screen.getByText("Body copy")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /details/i })).toHaveAttribute(
        "aria-expanded",
        "true"
      );
    });
  });

  describe("SegmentedControl", () => {
    it("selects segments with the sliding indicator active", async () => {
      const user = userEvent.setup();
      const segments: Segment[] = [
        { id: "day", label: "Day" },
        { id: "week", label: "Week" },
      ];
      const onChange = vi.fn();
      render(<SegmentedControl segments={segments} value="day" onChange={onChange} />);
      await user.click(screen.getByRole("radio", { name: "Week" }));
      expect(onChange).toHaveBeenCalledWith("week");
    });
  });

  describe("Sidebar", () => {
    it("renders labels and toggles collapse with the width layout animation", async () => {
      const user = userEvent.setup();
      const onCollapse = vi.fn();
      render(<Sidebar items={[{ id: "home", label: "Home" }]} onCollapse={onCollapse} />);
      expect(screen.getByText("Home")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /collapse sidebar/i }));
      expect(onCollapse).toHaveBeenCalledWith(true);
    });
  });

  describe("Slider", () => {
    it("updates value via keyboard while the knob translate spring is active", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Slider label="Volume" defaultValue={50} onChange={onChange} />);
      const input = screen.getByRole("slider");
      input.focus();
      await user.keyboard("{ArrowRight}");
      expect(onChange).toHaveBeenCalledWith(51);
      expect(input).toHaveAttribute("aria-valuenow", "51");
    });
  });

  describe("Tabs", () => {
    it("switches panels with the sliding indicator active", async () => {
      const user = userEvent.setup();
      const tabs: Tab[] = [
        { id: "a", label: "Alpha", content: <p>Alpha body</p> },
        { id: "b", label: "Beta", content: <p>Beta body</p> },
      ];
      render(<Tabs tabs={tabs} />);
      expect(screen.getByText("Alpha body")).toBeInTheDocument();
      await user.click(screen.getByRole("tab", { name: "Beta" }));
      expect(screen.getByText("Beta body")).toBeInTheDocument();
    });
  });
});

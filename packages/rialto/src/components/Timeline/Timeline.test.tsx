import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Timeline, type TimelineEvent } from "./Timeline";

const events: TimelineEvent[] = [
  { title: "Race Start", timestamp: "14:00", status: "completed" },
  {
    title: "Pit Window",
    timestamp: "14:24",
    status: "active",
    description: "Undercut window open",
  },
  { title: "Safety Car", timestamp: "14:38", status: "error" },
  { title: "Finish", timestamp: "15:01", status: "upcoming" },
];

describe("Timeline", () => {
  describe("rendering", () => {
    it("renders a list container", () => {
      render(<Timeline events={events} />);
      expect(screen.getByRole("list", { name: "Timeline" })).toBeInTheDocument();
    });

    it("renders all event items", () => {
      render(<Timeline events={events} />);
      const items = screen.getAllByRole("listitem");
      expect(items).toHaveLength(4);
    });

    it("renders event titles", () => {
      render(<Timeline events={events} />);
      expect(screen.getByText("Race Start")).toBeInTheDocument();
      expect(screen.getByText("Pit Window")).toBeInTheDocument();
      expect(screen.getByText("Safety Car")).toBeInTheDocument();
      expect(screen.getByText("Finish")).toBeInTheDocument();
    });

    it("renders event description when provided", () => {
      render(<Timeline events={events} />);
      expect(screen.getByText("Undercut window open")).toBeInTheDocument();
    });

    it("does not render description element when not provided", () => {
      render(<Timeline events={[{ title: "No Desc", status: "upcoming" }]} />);
      const item = screen.getByRole("listitem");
      expect(item.querySelectorAll("[class*='description']")).toHaveLength(0);
    });

    it("renders timestamps", () => {
      render(<Timeline events={events} />);
      expect(screen.getByText("14:00")).toBeInTheDocument();
      expect(screen.getByText("14:24")).toBeInTheDocument();
    });

    it("renders empty events array gracefully", () => {
      render(<Timeline events={[]} />);
      expect(screen.getByRole("list")).toBeInTheDocument();
    });
  });

  describe("status classes", () => {
    it("applies completed class for completed status", () => {
      render(<Timeline events={[{ title: "Done", status: "completed" }]} />);
      const item = screen.getByRole("listitem");
      expect(item.className).toMatch(/completed/);
    });

    it("applies active class for active status", () => {
      render(<Timeline events={[{ title: "Active", status: "active" }]} />);
      const item = screen.getByRole("listitem");
      expect(item.className).toMatch(/active/);
    });

    it("applies error class for error status", () => {
      render(<Timeline events={[{ title: "Error", status: "error" }]} />);
      const item = screen.getByRole("listitem");
      expect(item.className).toMatch(/error/);
    });

    it("defaults to upcoming when no status specified", () => {
      render(<Timeline events={[{ title: "Upcoming" }]} />);
      const item = screen.getByRole("listitem");
      expect(item.className).not.toMatch(/completed|active|error/);
    });
  });

  describe("compact prop", () => {
    it("renders without error in compact mode", () => {
      render(<Timeline events={events} compact />);
      expect(screen.getAllByRole("listitem")).toHaveLength(4);
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to the container div", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<Timeline ref={ref} events={events} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("accessibility", () => {
    it("has no a11y violations", async () => {
      const { container } = render(<Timeline events={events} />);
      expect(
        await axe(container, { rules: { "color-contrast": { enabled: false } } })
      ).toHaveNoViolations();
    });
  });
});

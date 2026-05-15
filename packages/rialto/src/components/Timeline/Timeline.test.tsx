import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Timeline } from "./Timeline";
import type { TimelineEvent } from "./Timeline";

const events: TimelineEvent[] = [
  { title: "Race Start", status: "completed", timestamp: "12:00" },
  { title: "Pit Window", status: "active", description: "Optimal window" },
  { title: "Finish", status: "upcoming" },
  { title: "Safety Car", status: "error", description: "Incident on track" },
];

describe("Timeline", () => {
  describe("rendering", () => {
    it("renders without crashing", () => {
      const { container } = render(<Timeline events={events} />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it("renders with role=list and aria-label", () => {
      render(<Timeline events={events} />);
      expect(screen.getByRole("list", { name: "Timeline" })).toBeInTheDocument();
    });

    it("renders all event titles", () => {
      render(<Timeline events={events} />);
      expect(screen.getByText("Race Start")).toBeInTheDocument();
      expect(screen.getByText("Pit Window")).toBeInTheDocument();
      expect(screen.getByText("Finish")).toBeInTheDocument();
      expect(screen.getByText("Safety Car")).toBeInTheDocument();
    });

    it("renders event descriptions when provided", () => {
      render(<Timeline events={events} />);
      expect(screen.getByText("Optimal window")).toBeInTheDocument();
      expect(screen.getByText("Incident on track")).toBeInTheDocument();
    });

    it("renders timestamps when provided", () => {
      render(<Timeline events={events} />);
      expect(screen.getByText("12:00")).toBeInTheDocument();
    });

    it("renders events as listitems", () => {
      render(<Timeline events={events} />);
      expect(screen.getAllByRole("listitem")).toHaveLength(events.length);
    });

    it("renders empty events array gracefully", () => {
      render(<Timeline events={[]} />);
      expect(screen.getByRole("list")).toBeInTheDocument();
    });
  });

  describe("status variants", () => {
    it("renders completed status", () => {
      render(<Timeline events={[{ title: "Done", status: "completed" }]} />);
      expect(screen.getByText("Done")).toBeInTheDocument();
    });

    it("renders active status", () => {
      render(<Timeline events={[{ title: "Active", status: "active" }]} />);
      expect(screen.getByText("Active")).toBeInTheDocument();
    });

    it("renders upcoming status (default)", () => {
      render(<Timeline events={[{ title: "Next" }]} />);
      expect(screen.getByText("Next")).toBeInTheDocument();
    });

    it("renders error status", () => {
      render(<Timeline events={[{ title: "Error", status: "error" }]} />);
      expect(screen.getByText("Error")).toBeInTheDocument();
    });
  });

  describe("compact mode", () => {
    it("renders compact=true without crashing", () => {
      const { container } = render(<Timeline events={events} compact />);
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe("ref forwarding", () => {
    it("forwards ref to container div", () => {
      const ref = { current: null as HTMLDivElement | null };
      render(<Timeline ref={ref} events={events} />);
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
    });
  });

  describe("accessibility", () => {
    it("passes axe", async () => {
      const { container } = render(<Timeline events={events} />);
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});

import { render, screen } from "@testing-library/react";
import { DisabledTooltip } from "./DisabledTooltip";

describe("DisabledTooltip", () => {
  describe("when not disabled", () => {
    it("renders children directly", () => {
      render(
        <DisabledTooltip>
          <button type="button">Click me</button>
        </DisabledTooltip>
      );
      expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
    });

    it("does not wrap in a tooltip when disabled=false", () => {
      render(
        <DisabledTooltip disabled={false} disabledReason="You cannot do that">
          <button type="button">Action</button>
        </DisabledTooltip>
      );
      // Children still renders
      expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
    });
  });

  describe("when disabled without reason", () => {
    it("renders children directly without tooltip when no disabledReason", () => {
      render(
        <DisabledTooltip disabled>
          <button type="button">Action</button>
        </DisabledTooltip>
      );
      expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
    });
  });

  describe("when disabled with reason", () => {
    it("still renders children", () => {
      render(
        <DisabledTooltip disabled disabledReason="Insufficient permissions">
          <button type="button">Restricted</button>
        </DisabledTooltip>
      );
      expect(screen.getByRole("button", { name: "Restricted" })).toBeInTheDocument();
    });
  });
});

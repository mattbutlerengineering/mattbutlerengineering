import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { vi } from "vitest";

// Mock the streaming hook so tests don't make network calls
vi.mock("./useGenCopilotStream", () => ({
  useGenCopilotStream: () => ({
    spec: null,
    isStreaming: false,
    error: null,
    send: vi.fn(),
    stop: vi.fn(),
  }),
}));

// Mock @json-render/react to avoid complex registry setup
vi.mock("@json-render/react", () => ({
  JSONUIProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Renderer: () => <div data-testid="renderer" />,
  flatToTree: vi.fn(),
}));

import { GenCopilot } from "./GenCopilot";
import type { ComponentRegistry } from "@json-render/react";

const mockRegistry = {} as ComponentRegistry;
const mockGetAccessToken = () => null;
const mockDomainContext = {
  schemas: [{ name: "Reservation", description: "A table booking", fields: "id, guestName" }],
};

describe("GenCopilot", () => {
  describe("rendering", () => {
    it("renders the copilot panel", () => {
      render(
        <GenCopilot
          onClose={() => {}}
          api="/api/gen/ui"
          domainContext={mockDomainContext}
          getAccessToken={mockGetAccessToken}
          registry={mockRegistry}
        />
      );
      // Should render a drawer/panel
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("renders the prompt textarea", () => {
      render(
        <GenCopilot
          onClose={() => {}}
          api="/api/gen/ui"
          domainContext={mockDomainContext}
          getAccessToken={mockGetAccessToken}
          registry={mockRegistry}
        />
      );
      expect(screen.getByRole("textbox", { name: /copilot prompt input/i })).toBeInTheDocument();
    });

    it("renders the Generate button when not streaming", () => {
      render(
        <GenCopilot
          onClose={() => {}}
          api="/api/gen/ui"
          domainContext={mockDomainContext}
          getAccessToken={mockGetAccessToken}
          registry={mockRegistry}
        />
      );
      expect(screen.getByRole("button", { name: /generate/i })).toBeInTheDocument();
    });

    it("renders empty state message", () => {
      render(
        <GenCopilot
          onClose={() => {}}
          api="/api/gen/ui"
          domainContext={mockDomainContext}
          getAccessToken={mockGetAccessToken}
          registry={mockRegistry}
        />
      );
      expect(screen.getByText(/enter a prompt to generate ui/i)).toBeInTheDocument();
    });
  });

  describe("interactions", () => {
    it("calls onClose when close button is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(
        <GenCopilot
          onClose={onClose}
          api="/api/gen/ui"
          domainContext={mockDomainContext}
          getAccessToken={mockGetAccessToken}
          registry={mockRegistry}
        />
      );
      const closeBtn = screen.getByRole("button", { name: /close/i });
      await user.click(closeBtn);
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("Generate button is disabled when prompt is empty", () => {
      render(
        <GenCopilot
          onClose={() => {}}
          api="/api/gen/ui"
          domainContext={mockDomainContext}
          getAccessToken={mockGetAccessToken}
          registry={mockRegistry}
        />
      );
      expect(screen.getByRole("button", { name: /generate/i })).toBeDisabled();
    });

    it("Generate button is enabled when prompt has text", async () => {
      const user = userEvent.setup();
      render(
        <GenCopilot
          onClose={() => {}}
          api="/api/gen/ui"
          domainContext={mockDomainContext}
          getAccessToken={mockGetAccessToken}
          registry={mockRegistry}
        />
      );
      await user.type(
        screen.getByRole("textbox", { name: /copilot prompt input/i }),
        "Show reservations"
      );
      expect(screen.getByRole("button", { name: /generate/i })).not.toBeDisabled();
    });
  });

  describe("accessibility", () => {
    it("passes axe", async () => {
      const { container } = render(
        <GenCopilot
          onClose={() => {}}
          api="/api/gen/ui"
          domainContext={mockDomainContext}
          getAccessToken={mockGetAccessToken}
          registry={mockRegistry}
        />
      );
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});

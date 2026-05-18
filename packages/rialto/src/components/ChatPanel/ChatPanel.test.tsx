import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { vi } from "vitest";

// Mock the streaming hook so tests don't make network calls
vi.mock("./useChatStream", () => ({
  useChatStream: vi.fn(() => ({
    messages: [],
    isStreaming: false,
    error: null,
    send: vi.fn(),
    stop: vi.fn(),
  })),
}));

import { ChatPanel } from "./ChatPanel.js";
import { useChatStream } from "./useChatStream.js";

const mockGetAccessToken = () => "test-token";

describe("ChatPanel", () => {
  describe("rendering", () => {
    it("renders empty state message", () => {
      render(
        <ChatPanel onClose={() => {}} api="/api/gen/agent" getAccessToken={mockGetAccessToken} />
      );
      expect(
        screen.getByText(/ask me anything about availability, reservations, or guests/i)
      ).toBeInTheDocument();
    });

    it("renders as a dialog (drawer)", () => {
      render(
        <ChatPanel onClose={() => {}} api="/api/gen/agent" getAccessToken={mockGetAccessToken} />
      );
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("renders the send button", () => {
      render(
        <ChatPanel onClose={() => {}} api="/api/gen/agent" getAccessToken={mockGetAccessToken} />
      );
      expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
    });

    it("renders user message after send", () => {
      vi.mocked(useChatStream).mockReturnValueOnce({
        messages: [{ id: "1", role: "user", content: "Check availability" }],
        isStreaming: false,
        error: null,
        send: vi.fn(),
        stop: vi.fn(),
      });

      render(
        <ChatPanel onClose={() => {}} api="/api/gen/agent" getAccessToken={mockGetAccessToken} />
      );

      expect(screen.getByText("Check availability")).toBeInTheDocument();
    });

    it("renders assistant response", () => {
      vi.mocked(useChatStream).mockReturnValueOnce({
        messages: [
          { id: "1", role: "user", content: "Check availability" },
          { id: "2", role: "assistant", content: "I found 3 available slots." },
        ],
        isStreaming: false,
        error: null,
        send: vi.fn(),
        stop: vi.fn(),
      });

      render(
        <ChatPanel onClose={() => {}} api="/api/gen/agent" getAccessToken={mockGetAccessToken} />
      );

      expect(screen.getByText("I found 3 available slots.")).toBeInTheDocument();
    });

    it("shows loading indicator while streaming", () => {
      vi.mocked(useChatStream).mockReturnValueOnce({
        messages: [{ id: "1", role: "user", content: "Check" }],
        isStreaming: true,
        error: null,
        send: vi.fn(),
        stop: vi.fn(),
      });

      render(
        <ChatPanel onClose={() => {}} api="/api/gen/agent" getAccessToken={mockGetAccessToken} />
      );

      expect(screen.getByTestId("chat-loading-indicator")).toBeInTheDocument();
    });

    it("send button disabled while streaming", () => {
      vi.mocked(useChatStream).mockReturnValueOnce({
        messages: [],
        isStreaming: true,
        error: null,
        send: vi.fn(),
        stop: vi.fn(),
      });

      render(
        <ChatPanel onClose={() => {}} api="/api/gen/agent" getAccessToken={mockGetAccessToken} />
      );

      expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    });
  });

  describe("interactions", () => {
    it("calls onClose when close button clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      render(
        <ChatPanel onClose={onClose} api="/api/gen/agent" getAccessToken={mockGetAccessToken} />
      );

      await user.click(screen.getByRole("button", { name: /close/i }));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("calls send with input text when form submitted", async () => {
      const user = userEvent.setup();
      const mockSend = vi.fn();
      // Use mockReturnValue (not Once) so subsequent re-renders also get mockSend
      vi.mocked(useChatStream).mockReturnValue({
        messages: [],
        isStreaming: false,
        error: null,
        send: mockSend,
        stop: vi.fn(),
      });

      render(
        <ChatPanel onClose={() => {}} api="/api/gen/agent" getAccessToken={mockGetAccessToken} />
      );

      await user.type(screen.getByRole("textbox"), "check availability tonight");
      await user.click(screen.getByRole("button", { name: /send/i }));

      expect(mockSend).toHaveBeenCalledWith("check availability tonight");
    });
  });

  describe("accessibility", () => {
    it("passes axe", async () => {
      const { container } = render(
        <ChatPanel onClose={() => {}} api="/api/gen/agent" getAccessToken={mockGetAccessToken} />
      );
      const results = await axe(container, {
        rules: { "color-contrast": { enabled: false } },
      });
      expect(results).toHaveNoViolations();
    });
  });
});

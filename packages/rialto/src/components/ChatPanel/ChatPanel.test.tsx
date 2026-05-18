import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { UseChatStreamReturn } from "./useChatStream.js";

const mockSend = vi.fn();
const mockStop = vi.fn();
const mockConfirmAction = vi.fn();
const mockCancelAction = vi.fn();

let mockHookReturn: UseChatStreamReturn = {
  messages: [],
  isStreaming: false,
  error: null,
  pendingAction: null,
  send: mockSend,
  stop: mockStop,
  confirmAction: mockConfirmAction,
  cancelAction: mockCancelAction,
};

vi.mock("./useChatStream", () => ({
  useChatStream: () => mockHookReturn,
}));

import { ChatPanel } from "./ChatPanel";

const defaultProps = {
  onClose: vi.fn(),
  api: "/api/gen/agent",
  getAccessToken: () => "token",
  domainContext: {
    schemas: [{ name: "Reservation", description: "A booking", fields: "id, guestName" }],
  },
};

describe("ChatPanel", () => {
  beforeEach(() => {
    mockHookReturn = {
      messages: [],
      isStreaming: false,
      error: null,
      pendingAction: null,
      send: mockSend,
      stop: mockStop,
      confirmAction: mockConfirmAction,
      cancelAction: mockCancelAction,
    };
    vi.clearAllMocks();
  });

  it("renders a drawer with input bar", () => {
    render(<ChatPanel {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /chat input/i })).toBeInTheDocument();
  });

  it("submits message on enter and clears input", async () => {
    const user = userEvent.setup();
    render(<ChatPanel {...defaultProps} />);

    const input = screen.getByRole("textbox", { name: /chat input/i });
    await user.type(input, "what is available?{Enter}");

    expect(mockSend).toHaveBeenCalledWith("what is available?");
    expect(input).toHaveValue("");
  });

  it("does not submit empty messages", async () => {
    const user = userEvent.setup();
    render(<ChatPanel {...defaultProps} />);

    const input = screen.getByRole("textbox", { name: /chat input/i });
    await user.type(input, "{Enter}");

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ChatPanel {...defaultProps} onClose={onClose} />);

    const closeBtn = screen.getByRole("button", { name: /close/i });
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders user and assistant messages", () => {
    mockHookReturn = {
      ...mockHookReturn,
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
      ],
    };

    render(<ChatPanel {...defaultProps} />);

    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByText("hi there")).toBeInTheDocument();
  });

  it("renders element placeholders when message has elements", () => {
    mockHookReturn = {
      ...mockHookReturn,
      messages: [
        { role: "user", content: "show slots" },
        {
          role: "assistant",
          content: "Here are the slots:",
          elements: [{ id: "card-1", type: "Card", props: { title: "7pm" }, children: [] }],
        },
      ],
    };

    render(<ChatPanel {...defaultProps} />);

    expect(screen.getByText("Here are the slots:")).toBeInTheDocument();
    expect(screen.getByTestId("chat-elements")).toBeInTheDocument();
  });

  it("renders confirmation prompt when pendingAction exists", () => {
    mockHookReturn = {
      ...mockHookReturn,
      pendingAction: {
        actionId: "call-3",
        toolName: "create_reservation",
        toolInput: { guestName: "Smith", date: "2026-05-18", time: "19:00", partySize: 4 },
      },
    };

    render(<ChatPanel {...defaultProps} />);

    expect(screen.getByText(/create reservation/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("calls confirmAction when confirm button clicked", async () => {
    const user = userEvent.setup();
    mockHookReturn = {
      ...mockHookReturn,
      pendingAction: {
        actionId: "call-3",
        toolName: "create_reservation",
        toolInput: { guestName: "Smith" },
      },
    };

    render(<ChatPanel {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(mockConfirmAction).toHaveBeenCalledOnce();
  });

  it("calls cancelAction when cancel button clicked", async () => {
    const user = userEvent.setup();
    mockHookReturn = {
      ...mockHookReturn,
      pendingAction: {
        actionId: "call-3",
        toolName: "cancel_reservation",
        toolInput: { reservationId: "r1" },
      },
    };

    render(<ChatPanel {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mockCancelAction).toHaveBeenCalledOnce();
  });

  it("displays tool input details in confirmation prompt", () => {
    mockHookReturn = {
      ...mockHookReturn,
      pendingAction: {
        actionId: "call-3",
        toolName: "seat_walk_in",
        toolInput: { partySize: 3, guestName: "Jones" },
      },
    };

    render(<ChatPanel {...defaultProps} />);

    expect(screen.getByText(/partySize/)).toBeInTheDocument();
    expect(screen.getByText(/Jones/)).toBeInTheDocument();
  });

  it("passes axe", async () => {
    const { container } = render(<ChatPanel {...defaultProps} />);
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});

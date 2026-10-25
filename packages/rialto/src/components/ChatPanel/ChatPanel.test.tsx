import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { UseChatStreamReturn } from "./useChatStream.js";

const mockSend = vi.fn();
const mockStop = vi.fn();
const mockRetry = vi.fn();
const mockConfirmAction = vi.fn();
const mockCancelAction = vi.fn();

let mockHookReturn: UseChatStreamReturn = {
  messages: [],
  isStreaming: false,
  error: null,
  pendingAction: null,
  activeTool: null,
  permissionDenials: [],
  send: mockSend,
  stop: mockStop,
  retry: mockRetry,
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
  stream: async function* () {
    yield { type: "text", content: "hi" };
  },
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
      activeTool: null,
      permissionDenials: [],
      send: mockSend,
      stop: mockStop,
      retry: mockRetry,
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

  // Registry components implement json-render's ComponentRenderProps contract:
  // they read `element.props`, receive `emit`/`on` functions, and nest rendered
  // `children` — they do NOT take their props spread onto them.
  const ContractCard = ({
    element,
    children,
    emit,
    on,
  }: {
    element: { key: string; type: string; props: Record<string, unknown> };
    children?: React.ReactNode;
    emit: (event: string) => void;
    on: (event: string) => unknown;
  }) => (
    <div data-testid={`card-${element.key}`} data-emit-type={typeof emit} data-on-type={typeof on}>
      {String(element.props.title ?? "")}
      {children}
    </div>
  );

  it("invokes registry components with json-render's ComponentRenderProps contract", () => {
    const registry = { Card: ContractCard };

    mockHookReturn = {
      ...mockHookReturn,
      messages: [
        {
          role: "assistant",
          content: "Here are your slots:",
          elements: [{ id: "el-1", type: "Card", props: { title: "7pm Slot" } }],
        },
      ],
    };

    render(<ChatPanel {...defaultProps} registry={registry} />);

    const card = screen.getByTestId("card-el-1");
    expect(card).toBeInTheDocument();
    expect(screen.getByText("7pm Slot")).toBeInTheDocument();
    expect(card).toHaveAttribute("data-emit-type", "function");
    expect(card).toHaveAttribute("data-on-type", "function");
  });

  it("nests children by id instead of rendering a flat list", () => {
    const registry = { Card: ContractCard };

    mockHookReturn = {
      ...mockHookReturn,
      messages: [
        {
          role: "assistant",
          content: "",
          elements: [
            { id: "parent", type: "Card", props: { title: "Parent" }, children: ["child"] },
            { id: "child", type: "Card", props: { title: "Child" } },
          ],
        },
      ],
    };

    render(<ChatPanel {...defaultProps} registry={registry} />);

    const parent = screen.getByTestId("card-parent");
    const child = screen.getByTestId("card-child");
    expect(parent).toContainElement(child);
    // The child renders once, nested — not a second time as a top-level sibling.
    expect(screen.getAllByTestId("card-child")).toHaveLength(1);
  });

  it("renders an unknown-type parent's known children inside its placeholder", () => {
    const registry = { Card: ContractCard };

    mockHookReturn = {
      ...mockHookReturn,
      messages: [
        {
          role: "assistant",
          content: "",
          elements: [
            { id: "p", type: "NotInCatalog", props: { title: "Mystery" }, children: ["c"] },
            { id: "c", type: "Card", props: { title: "Real child" } },
          ],
        },
      ],
    };

    render(<ChatPanel {...defaultProps} registry={registry} />);

    // The child is referenced (not a root), so it must render inside the
    // unknown parent's placeholder rather than disappearing entirely.
    expect(screen.getByText("Real child")).toBeInTheDocument();
  });

  it("renders cyclic children references without recursing forever", () => {
    const registry = { Card: ContractCard };

    mockHookReturn = {
      ...mockHookReturn,
      messages: [
        {
          role: "assistant",
          content: "",
          elements: [
            { id: "a", type: "Card", props: { title: "A" }, children: ["b"] },
            { id: "b", type: "Card", props: { title: "B" }, children: ["a"] },
          ],
        },
      ],
    };

    render(<ChatPanel {...defaultProps} registry={registry} />);

    expect(screen.getAllByText("A").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("B").length).toBeGreaterThanOrEqual(1);
  });

  it("strips dangerous props from element specs", () => {
    const Spy = ({ element }: { element: { props: Record<string, unknown> } }) => (
      <div
        data-testid="spy"
        data-has-dangerous={String("dangerouslySetInnerHTML" in element.props)}
        data-has-onclick={String("onClick" in element.props)}
        data-has-ref={String("ref" in element.props)}
      >
        {String(element.props.title ?? "")}
      </div>
    );
    const registry = { Alert: Spy };

    mockHookReturn = {
      ...mockHookReturn,
      messages: [
        {
          role: "assistant",
          content: "",
          elements: [
            {
              id: "xss-1",
              type: "Alert",
              props: {
                title: "safe",
                dangerouslySetInnerHTML: { __html: "<script>alert(1)</script>" },
                onClick: "alert(2)",
                ref: "steal-ref",
              },
            },
          ],
        },
      ],
    };

    render(<ChatPanel {...defaultProps} registry={registry} />);

    const spy = screen.getByTestId("spy");
    expect(spy).toHaveAttribute("data-has-dangerous", "false");
    expect(spy).toHaveAttribute("data-has-onclick", "false");
    expect(spy).toHaveAttribute("data-has-ref", "false");
    expect(spy).toHaveTextContent("safe");
  });

  it("falls back to type label when no registry is provided", () => {
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

  it("renders the host's description of a pending action instead of raw tool input", () => {
    mockHookReturn = {
      ...mockHookReturn,
      pendingAction: {
        actionId: "a1",
        toolName: "seat_walk_in",
        toolInput: { partySize: 2, tableId: "cmti2ghiw000801b7fbufnw56", guestName: "Lee" },
      },
    };
    render(
      <ChatPanel
        {...defaultProps}
        describeAction={(action) => ({
          title: "Seat walk-in",
          details: [
            { label: "Party size", value: String(action.toolInput.partySize) },
            { label: "Table", value: "Patio 2" },
          ],
        })}
      />
    );

    expect(screen.getByText("Seat walk-in")).toBeInTheDocument();
    expect(screen.getByText(/Patio 2/)).toBeInTheDocument();
    expect(screen.queryByText(/cmti2ghiw/)).toBeNull();
  });

  it("shows a message's note under it (e.g. a cancelled action)", () => {
    mockHookReturn = {
      ...mockHookReturn,
      messages: [
        { role: "user", content: "seat Lee" },
        { role: "assistant", content: "Seat Lee at lml?", note: "Cancelled. Nothing was changed." },
      ],
    };
    render(<ChatPanel {...defaultProps} />);

    expect(screen.getByText("Cancelled. Nothing was changed.")).toBeInTheDocument();
  });

  it("shows the raw fallback title in sentence case, without CSS title-casing", () => {
    mockHookReturn = {
      ...mockHookReturn,
      pendingAction: { actionId: "a1", toolName: "seat_walk_in", toolInput: {} },
    };
    render(<ChatPanel {...defaultProps} />);

    // Text, not CSS: "Seat walk in", never "Seat Walk In" (a translated host
    // title like "Sentar a un cliente" must not become "Sentar A Un Cliente").
    expect(screen.getByText("Seat walk in")).toBeInTheDocument();
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

  it("shows a visible error with a Try again action when the send fails", async () => {
    const user = userEvent.setup();
    mockHookReturn = {
      ...mockHookReturn,
      messages: [{ role: "user", content: "book a table" }],
      error: new Error("Request failed: Internal Server Error"),
    };

    render(<ChatPanel {...defaultProps} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Request failed: Internal Server Error");

    const retryButton = screen.getByRole("button", { name: /try again/i });
    expect(retryButton).toBeEnabled();
    await user.click(retryButton);
    expect(mockRetry).toHaveBeenCalledOnce();
  });

  it("announces the running tool while a tool call is in flight", () => {
    mockHookReturn = {
      ...mockHookReturn,
      isStreaming: true,
      messages: [{ role: "user", content: "find it" }],
      activeTool: "lookup_reservation",
    };

    render(<ChatPanel {...defaultProps} />);

    expect(screen.getByRole("status")).toHaveTextContent("lookup reservation");
  });

  it("shows tool calls the server refused", () => {
    mockHookReturn = {
      ...mockHookReturn,
      messages: [{ role: "user", content: "run it" }],
      permissionDenials: [{ toolName: "Bash", reason: "Command is blocked" }],
    };

    render(<ChatPanel {...defaultProps} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Bash");
    expect(screen.getByRole("alert")).toHaveTextContent("Command is blocked");
  });

  it("re-enables the composer after a send failure", () => {
    mockHookReturn = {
      ...mockHookReturn,
      isStreaming: false,
      error: new Error("Request failed: Internal Server Error"),
    };

    render(<ChatPanel {...defaultProps} />);

    const input = screen.getByRole("textbox", { name: /chat input/i });
    expect(input).toBeEnabled();
  });

  it("offers starter suggestions on an empty conversation and sends one on click", async () => {
    const user = userEvent.setup();
    render(
      <ChatPanel {...defaultProps} suggestions={["How does tonight look?", "Seat a walk-in"]} />
    );

    await user.click(screen.getByRole("button", { name: "How does tonight look?" }));

    expect(mockSend).toHaveBeenCalledWith("How does tonight look?");
  });

  it("hides suggestions once the conversation has started", () => {
    mockHookReturn = { ...mockHookReturn, messages: [{ role: "user", content: "hi" }] };
    render(<ChatPanel {...defaultProps} suggestions={["How does tonight look?"]} />);

    expect(screen.queryByRole("button", { name: "How does tonight look?" })).toBeNull();
  });

  it("shows a typing indicator on every turn while waiting for the reply", () => {
    mockHookReturn = {
      ...mockHookReturn,
      isStreaming: true,
      messages: [
        { role: "user", content: "first" },
        { role: "assistant", content: "answer" },
        { role: "user", content: "second" },
      ],
    };
    render(<ChatPanel {...defaultProps} />);

    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  });

  it("replaces Send with Stop while a reply is streaming", async () => {
    const user = userEvent.setup();
    mockHookReturn = {
      ...mockHookReturn,
      isStreaming: true,
      messages: [{ role: "user", content: "hi" }],
    };
    render(<ChatPanel {...defaultProps} />);

    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(mockStop).toHaveBeenCalled();
  });

  it("scrolls the conversation to the newest message", () => {
    const scrollTo = vi.fn();
    const original = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollTo;
    try {
      mockHookReturn = {
        ...mockHookReturn,
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
        ],
      };
      render(<ChatPanel {...defaultProps} />);

      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: expect.any(Number) }));
    } finally {
      HTMLElement.prototype.scrollTo = original;
    }
  });

  it("passes axe", async () => {
    const { container } = render(<ChatPanel {...defaultProps} />);
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });

  it("passes axe with starter suggestions", async () => {
    const { container } = render(
      <ChatPanel {...defaultProps} suggestions={["How does tonight look?", "Seat a walk-in"]} />
    );
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });

  it("passes axe while streaming (Stop button + typing indicator)", async () => {
    mockHookReturn = {
      ...mockHookReturn,
      isStreaming: true,
      messages: [{ role: "user", content: "hi" }],
    };
    const { container } = render(<ChatPanel {...defaultProps} />);
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });

  it("does not send on Enter while a reply is streaming", async () => {
    const user = userEvent.setup();
    mockHookReturn = {
      ...mockHookReturn,
      isStreaming: true,
      messages: [{ role: "user", content: "hi" }],
    };
    render(<ChatPanel {...defaultProps} />);

    await user.type(screen.getByRole("textbox"), "another{Enter}");

    expect(mockSend).not.toHaveBeenCalled();
  });
});

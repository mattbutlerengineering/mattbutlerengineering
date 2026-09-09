import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RialtoProvider } from "@mattbutlerengineering/rialto";
import { AuthFlowPage } from "./AuthFlowPage.js";
import { ERROR_STEP, HAPPY_PATH } from "./authFlowMachine.js";

// jsdom has no matchMedia; rialto's device context and framer-motion both read it.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

function renderPage() {
  return render(
    <RialtoProvider theme="dark">
      <AuthFlowPage />
    </RialtoProvider>
  );
}

/** The stable step marker — SplitFlap animates, so assertions key off this. */
function stepId(container: HTMLElement): string | null {
  return container.querySelector("[data-step-id]")?.getAttribute("data-step-id") ?? null;
}

/** The `Handshake` instrument's root — the one `role="img"` inside the panel. */
function handshakeEl(container: HTMLElement): Element | null {
  return container.querySelector('section[aria-label="OIDC flow diagram"] [role="img"]');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuthFlowPage", () => {
  it("renders all three stations", () => {
    renderPage();

    expect(screen.getByRole("group", { name: /browser/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /identity/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /^api station$/i })).toBeInTheDocument();
  });

  it("shows an idle handshake on the first step, negotiating lane 0 after one Next", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    expect(handshakeEl(container)).toHaveAttribute("data-state", "idle");

    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(handshakeEl(container)).toHaveAttribute("data-state", "negotiating");
    expect(handshakeEl(container)).toHaveAttribute("data-lane", "0");
  });

  it("starts at the first step and advances on Next", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    expect(stepId(container)).toBe(HAPPY_PATH[0]?.id);
    expect(screen.getByText(HAPPY_PATH[0]!.caption)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /next/i }));

    expect(stepId(container)).toBe(HAPPY_PATH[1]?.id);
    expect(screen.getByText(HAPPY_PATH[1]!.caption)).toBeInTheDocument();
  });

  it("play/pause toggles the control label", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /play/i }));
    expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /pause/i }));
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
  });

  it("the error toggle replays the callback as a rejected state with a danger LED", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(screen.getByRole("switch", { name: /tampered state/i }));

    expect(stepId(container)).toBe(ERROR_STEP.id);
    expect(screen.getByText(ERROR_STEP.caption)).toBeInTheDocument();

    const handshake = handshakeEl(container);
    expect(handshake).toHaveAttribute("data-state", "failed");
    expect(handshake?.querySelector('[data-station="Browser"]')).toHaveAttribute(
      "data-variant",
      "danger"
    );

    // The flow is halted — Next cannot move past the rejected callback.
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(stepId(container)).toBe(ERROR_STEP.id);
  });

  it("reset returns to the first step", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(screen.getByRole("button", { name: /reset/i }));

    expect(stepId(container)).toBe(HAPPY_PATH[0]?.id);
  });

  it("pauses when the document becomes hidden", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /play/i }));
    expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from "vitest";
import { runNavAction } from "./nav-actions.js";

describe("runNavAction", () => {
  it("routes, opens chat, and signs out — each kind reaches only its own handler", () => {
    const handlers = { navigate: vi.fn(), toggleChat: vi.fn(), signOut: vi.fn() };

    runNavAction({ type: "route", path: "/timeline" }, handlers);
    expect(handlers.navigate).toHaveBeenCalledWith("/timeline");
    expect(handlers.toggleChat).not.toHaveBeenCalled();
    expect(handlers.signOut).not.toHaveBeenCalled();

    runNavAction({ type: "chat" }, handlers);
    expect(handlers.toggleChat).toHaveBeenCalledTimes(1);
    expect(handlers.navigate).toHaveBeenCalledTimes(1);

    runNavAction({ type: "signout" }, handlers);
    expect(handlers.signOut).toHaveBeenCalledTimes(1);
    expect(handlers.navigate).toHaveBeenCalledTimes(1);
  });
});

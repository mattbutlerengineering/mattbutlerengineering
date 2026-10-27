// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_BACK_RELOAD_KEY,
  PRE_AUTH_HISTORY_KEY,
  authHistorySkipSteps,
  installAuthBackReload,
  installAuthBackSkip,
  rememberPreAuthHistoryLength,
} from "./auth-history.js";

describe("authHistorySkipSteps", () => {
  it("skips every entry the sign-in round-trip added when the IdP left its own", () => {
    expect(authHistorySkipSteps(3, 6)).toBe(3);
  });

  it("does not skip when the callback is the only new entry", () => {
    expect(authHistorySkipSteps(3, 4)).toBeNull();
    expect(authHistorySkipSteps(3, 3)).toBeNull();
  });

  it("rejects a length that moved backwards or is not an integer", () => {
    expect(authHistorySkipSteps(5, 2)).toBeNull();
    expect(authHistorySkipSteps(Number.NaN, 4)).toBeNull();
  });
});

describe("installAuthBackSkip", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("does nothing when sign-in did not record a length", () => {
    const pushState = vi.spyOn(window.history, "pushState");
    installAuthBackSkip();
    expect(pushState).not.toHaveBeenCalled();
    pushState.mockRestore();
  });

  it("pushes a sentinel and, on Back, jumps over the IdP entries", () => {
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    vi.spyOn(window.history, "length", "get").mockReturnValue(6);
    sessionStorage.setItem(PRE_AUTH_HISTORY_KEY, "3");
    const scheduled: Array<() => void> = [];

    installAuthBackSkip(window.history, sessionStorage, (fn) => {
      scheduled.push(fn);
    });

    expect(sessionStorage.getItem(PRE_AUTH_HISTORY_KEY)).toBeNull();
    expect(scheduled).toHaveLength(0);

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(sessionStorage.getItem(AUTH_BACK_RELOAD_KEY)).toBe("1");
    expect(go).not.toHaveBeenCalled();

    scheduled[0]?.();
    expect(go).toHaveBeenCalledWith(-3);
    go.mockRestore();
  });
});

describe("installAuthBackReload", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("reloads a persisted page only after an auth-history skip", () => {
    const reload = vi.fn();
    let listener: ((event: PageTransitionEvent) => void) | undefined;
    const cleanup = installAuthBackReload({
      sessionStorage,
      location: { reload },
      addEventListener: (_type, next) => {
        listener = next;
      },
      removeEventListener: () => {
        listener = undefined;
      },
    });

    listener?.(new PageTransitionEvent("pageshow", { persisted: true }));
    expect(reload).not.toHaveBeenCalled();

    sessionStorage.setItem(AUTH_BACK_RELOAD_KEY, "1");
    listener?.(new PageTransitionEvent("pageshow", { persisted: false }));
    expect(reload).not.toHaveBeenCalled();

    listener?.(new PageTransitionEvent("pageshow", { persisted: true }));
    expect(reload).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(AUTH_BACK_RELOAD_KEY)).toBeNull();

    cleanup();
    expect(listener).toBeUndefined();
  });
});

describe("rememberPreAuthHistoryLength", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("stores the current history length", () => {
    rememberPreAuthHistoryLength();
    expect(sessionStorage.getItem(PRE_AUTH_HISTORY_KEY)).toBe(String(window.history.length));
  });
});

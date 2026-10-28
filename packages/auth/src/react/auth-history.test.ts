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
    const go = vi.spyOn(window.history, "go");
    installAuthBackSkip();
    expect(go).not.toHaveBeenCalled();
    go.mockRestore();
  });

  it("jumps over the IdP entries as soon as the callback lands", () => {
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    const pushState = vi.spyOn(window.history, "pushState");
    vi.spyOn(window.history, "length", "get").mockReturnValue(6);
    sessionStorage.setItem(PRE_AUTH_HISTORY_KEY, "3");

    installAuthBackSkip();

    expect(sessionStorage.getItem(PRE_AUTH_HISTORY_KEY)).toBeNull();
    expect(sessionStorage.getItem(AUTH_BACK_RELOAD_KEY)).toBe("1");
    expect(go).toHaveBeenCalledWith(-3);
    expect(pushState).not.toHaveBeenCalled();
    go.mockRestore();
    pushState.mockRestore();
  });

  it("does not hijack a later Back after in-app navigation", () => {
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    const length = vi.spyOn(window.history, "length", "get").mockReturnValue(6);
    sessionStorage.setItem(PRE_AUTH_HISTORY_KEY, "3");
    installAuthBackSkip();
    expect(go).toHaveBeenCalledOnce();

    // In-app link pushes a new entry, then the user presses Back.
    length.mockReturnValue(7);
    window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));

    expect(go).toHaveBeenCalledOnce();
    go.mockRestore();
    length.mockRestore();
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
    // A non-bfcache load clears the stale flag so a later restore cannot reload.
    expect(sessionStorage.getItem(AUTH_BACK_RELOAD_KEY)).toBeNull();
    sessionStorage.setItem(AUTH_BACK_RELOAD_KEY, "1");

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

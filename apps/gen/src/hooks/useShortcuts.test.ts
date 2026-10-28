import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useShortcuts } from "./useShortcuts.js";
import type { ShortcutHandlers } from "./useShortcuts.js";
import { SHORTCUTS, displayKeys } from "../lib/shortcuts.js";

function press(init: KeyboardEventInit, target: EventTarget = document) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

/** A keydown that fires the given table entry's binding. */
function eventFor(keys: readonly string[]): KeyboardEventInit {
  const main = keys[keys.length - 1] ?? "";
  const alt = keys.includes("Alt");
  if (main === "Esc") return { key: "Escape" };
  if (!alt) return { key: main };
  return {
    altKey: true,
    shiftKey: keys.includes("Shift"),
    code: /^\d$/.test(main) ? `Digit${main}` : `Key${main}`,
    key: "Dead",
  };
}

describe("useShortcuts", () => {
  it("fires the handler for every handled table entry", () => {
    const handlers: ShortcutHandlers = {
      newGeneration: vi.fn(),
      templates: vi.fn(),
      history: vi.fn(),
      inspector: vi.fn(),
      fullscreen: vi.fn(),
      stop: vi.fn(),
      help: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
    };
    renderHook(() => useShortcuts(handlers));

    const handled = SHORTCUTS.filter((s) => s.action);
    expect(handled.length).toBe(Object.keys(handlers).length);
    for (const def of handled) {
      const action = def.action;
      if (!action) continue;
      press(eventFor(def.keys));
      expect(handlers[action], def.id).toHaveBeenCalledTimes(1);
    }
  });

  it("stops generation on Escape, even from the prompt textarea", () => {
    const stop = vi.fn();
    renderHook(() => useShortcuts({ stop }));
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    press({ key: "Escape" }, textarea);
    expect(stop).toHaveBeenCalledTimes(1);
    textarea.remove();
  });

  it("ignores Escape that another layer (palette, dialog, fullscreen) already consumed", () => {
    const stop = vi.fn();
    renderHook(() => useShortcuts({ stop }));
    const consumer = document.createElement("div");
    document.body.appendChild(consumer);
    consumer.addEventListener("keydown", (e) => e.preventDefault());
    press({ key: "Escape" }, consumer);
    expect(stop).not.toHaveBeenCalled();
    consumer.remove();
  });

  it("leaves Escape alone when no stop handler is supplied", () => {
    renderHook(() => useShortcuts({ help: vi.fn() }));
    expect(press({ key: "Escape" }).defaultPrevented).toBe(false);
  });

  it("ignores Alt combos while typing so Option+digit characters are not swallowed", () => {
    const history = vi.fn();
    const newGeneration = vi.fn();
    renderHook(() => useShortcuts({ history, newGeneration }));
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    const e1 = press({ altKey: true, code: "Digit1", key: "¡" }, textarea);
    const e2 = press({ altKey: true, shiftKey: true, code: "KeyN", key: "Ń" }, textarea);
    expect(history).not.toHaveBeenCalled();
    expect(newGeneration).not.toHaveBeenCalled();
    expect(e1.defaultPrevented).toBe(false);
    expect(e2.defaultPrevented).toBe(false);
    textarea.remove();
  });

  it("ignores '?' while typing in a form field", () => {
    const help = vi.fn();
    renderHook(() => useShortcuts({ help }));
    const input = document.createElement("input");
    document.body.appendChild(input);
    press({ key: "?" }, input);
    expect(help).not.toHaveBeenCalled();
    input.remove();
  });

  it("does not claim browser-reserved Cmd/Ctrl bindings", () => {
    const handlers: ShortcutHandlers = {
      newGeneration: vi.fn(),
      templates: vi.fn(),
      history: vi.fn(),
      inspector: vi.fn(),
      fullscreen: vi.fn(),
    };
    renderHook(() => useShortcuts(handlers));
    for (const key of ["t", "n", "f", "1", "2"]) {
      press({ key, metaKey: true });
      press({ key, ctrlKey: true });
    }
    for (const fn of Object.values(handlers)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("shortcut table", () => {
  it("advertises no browser-reserved Cmd/Ctrl+T/N/F/digit binding", () => {
    for (const def of SHORTCUTS) {
      if (!def.keys.includes("Mod")) continue;
      expect(def.keys[def.keys.length - 1], def.id).toBe("K");
    }
  });

  it("renders platform-specific key labels", () => {
    const history = SHORTCUTS.find((s) => s.id === "history");
    const palette = SHORTCUTS.find((s) => s.id === "palette");
    if (!history || !palette) throw new Error("missing shortcut");
    expect(displayKeys(history, true)).toEqual(["⌥", "1"]);
    expect(displayKeys(history, false)).toEqual(["Alt", "1"]);
    expect(displayKeys(palette, true)).toEqual(["⌘", "K"]);
    expect(displayKeys(palette, false)).toEqual(["Ctrl", "K"]);
  });

  it("matches Alt shortcuts from realistic key and code values", () => {
    const history = vi.fn();
    const inspector = vi.fn();
    const fullscreen = vi.fn();
    const templates = vi.fn();
    renderHook(() => useShortcuts({ history, inspector, fullscreen, templates }));

    // Linux Chrome, US layout: Alt does not rewrite the digit.
    press({ altKey: true, key: "1", code: "Digit1" });
    // macOS Option+2: key is the symbol, code is the physical key.
    press({ altKey: true, key: "™", code: "Digit2" });
    // Alt+Shift+F where key is a symbol and code is KeyF.
    press({ altKey: true, shiftKey: true, key: "ƒ", code: "KeyF" });
    // Code missing, unmodified character still in key (some Linux events).
    press({ altKey: true, shiftKey: true, key: "T", code: "" });

    expect(history).toHaveBeenCalledTimes(1);
    expect(inspector).toHaveBeenCalledTimes(1);
    expect(fullscreen).toHaveBeenCalledTimes(1);
    expect(templates).toHaveBeenCalledTimes(1);
  });

  it("does not hijack native text undo: Cmd/Ctrl+Z is never matched, Alt+Z is ignored while typing", () => {
    const undo = vi.fn();
    renderHook(() => useShortcuts({ undo }));
    press({ key: "z", ctrlKey: true });
    press({ key: "z", metaKey: true });
    expect(undo).not.toHaveBeenCalled();

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    press({ altKey: true, code: "KeyZ", key: "Ω" }, textarea);
    expect(undo).not.toHaveBeenCalled();
    textarea.remove();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { focusFirstFilledField } from "./useOnboardingChatState.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function mountMark(inner: string): HTMLElement {
  document.body.innerHTML = `<div data-filled-from-chat="true">${inner}</div>`;
  return document.querySelector("[data-filled-from-chat]") as HTMLElement;
}

describe("focusFirstFilledField", () => {
  it("focuses the first control inside the first marked field", () => {
    mountMark('<input id="a" /><input id="b" />');
    focusFirstFilledField(true);
    expect(document.activeElement?.id).toBe("a");
  });

  it("closes a combobox that opens on focus, so Review does not pop its list open", () => {
    mountMark('<input id="tz" role="combobox" />');
    const input = document.getElementById("tz") as HTMLInputElement;
    const keys: string[] = [];
    // Stand-in for rialto Autocomplete: opens on focus, closes on Escape.
    input.addEventListener("focus", () => keys.push("open"));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") keys.push("close");
    });

    focusFirstFilledField(true);

    expect(document.activeElement).toBe(input);
    expect(keys).toEqual(["open", "close"]);
  });

  it("scrolls without animation under reduced motion, smoothly otherwise", () => {
    const mark = mountMark("<input />");
    const scroll = vi.fn();
    mark.scrollIntoView = scroll;

    focusFirstFilledField(true);
    focusFirstFilledField(false);

    expect(scroll).toHaveBeenNthCalledWith(1, { block: "center", behavior: "auto" });
    expect(scroll).toHaveBeenNthCalledWith(2, { block: "center", behavior: "smooth" });
  });

  it("does nothing when no field is marked", () => {
    document.body.innerHTML = "<input />";
    expect(() => focusFirstFilledField(false)).not.toThrow();
  });
});

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocationTimeStep } from "./LocationTimeStep";
import { focusFirstFilledField } from "./useOnboardingChatState.js";

// Real rialto Autocomplete and Select (nothing mocked): they open their list on focus.
function renderStep(filled: readonly string[]) {
  return render(
    <LocationTimeStep
      data={{ ianaTimezone: "Europe/Lisbon", currencyCode: "EUR" }}
      errors={{}}
      onChange={vi.fn()}
      filled={filled}
    />
  );
}

describe("focusFirstFilledField", () => {
  it("focuses the marked field's wrapper, not its control, so the time zone list stays closed", () => {
    renderStep(["ianaTimezone", "currencyCode"]);

    focusFirstFilledField(true);

    const mark = document.querySelector<HTMLElement>("[data-filled-from-chat]");
    expect(document.activeElement).toBe(mark);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("gives the wrapper a name that says which field was filled from chat", () => {
    renderStep(["ianaTimezone"]);
    focusFirstFilledField(true);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Timezone, filled from chat");
  });

  it("leaves unmarked fields out of the tab-by-script path", () => {
    renderStep([]);
    expect(document.querySelector("[tabindex='-1']")).toBeNull();
  });

  it("scrolls without animation under reduced motion, smoothly otherwise", () => {
    renderStep(["currencyCode"]);
    const mark = document.querySelector<HTMLElement>("[data-filled-from-chat]") as HTMLElement;
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

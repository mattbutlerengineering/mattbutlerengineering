import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FilledField } from "./FilledField.js";

describe("FilledField", () => {
  it("names the wrapper as a group while the field is marked", () => {
    render(
      <FilledField filled label="Time zone">
        <input aria-label="Time zone input" />
      </FilledField>
    );
    expect(screen.getByRole("group")).toBeTruthy();
  });

  it("keeps a focused wrapper focused when its mark times out", () => {
    const { rerender } = render(
      <FilledField filled label="Time zone">
        <input aria-label="Time zone input" />
      </FilledField>
    );
    const wrapper = screen.getByRole("group");
    wrapper.focus();
    expect(document.activeElement).toBe(wrapper);

    rerender(
      <FilledField filled={false} label="Time zone">
        <input aria-label="Time zone input" />
      </FilledField>
    );

    expect(screen.queryByRole("group")).toBeNull();
    const same = document.querySelector("[tabindex='-1']");
    expect(same).toBe(wrapper);
    expect(document.activeElement).toBe(wrapper);
  });
});

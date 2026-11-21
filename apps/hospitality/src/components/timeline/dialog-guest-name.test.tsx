import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { CancelReservationDialog } from "./CancelReservationDialog.js";
import { MarkNoShowDialog } from "./MarkNoShowDialog.js";

window.HTMLElement.prototype.scrollIntoView = vi.fn();

// The guest name is staff-visible but guest-controlled text. i18n runs with
// `escapeValue: false`, so it must reach the DOM as a React child, never as an
// interpolated value that <Trans> parses for markup.
const HOSTILE_NAMES = [
  "<0>hi</0>",
  "Ann <1>Evil</1>",
  "Jo</strong><em>x",
  "<img src=x onerror=alert(1)>",
  "Bob <3",
  "<strong>x</strong>",
  "</strong><b>bold</b>",
  "A <strong>B",
  "{{name}} $t(timeline.guest)",
  "<script>alert(1)</script>",
];

const dialogs = [
  {
    label: "CancelReservationDialog",
    renderWith: (guestName: string) =>
      render(
        <CancelReservationDialog
          reservationId="res-1"
          guestName={guestName}
          onConfirm={vi.fn().mockResolvedValue(undefined)}
          onClose={vi.fn()}
        />
      ),
  },
  {
    label: "MarkNoShowDialog",
    renderWith: (guestName: string) =>
      render(
        <MarkNoShowDialog
          guestName={guestName}
          onConfirm={vi.fn().mockResolvedValue(undefined)}
          onClose={vi.fn()}
        />
      ),
  },
];

describe.each(dialogs)("$label guest name", ({ renderWith }) => {
  it.each(HOSTILE_NAMES)("renders %j as literal text inside one <strong>", (name) => {
    const { container } = renderWith(name);
    const strongs = container.querySelectorAll("strong");
    expect(strongs).toHaveLength(1);
    expect(strongs[0]?.textContent).toBe(name);
    expect(strongs[0]?.children).toHaveLength(0);
    expect(container.querySelector("img, em")).toBeNull();
  });
});

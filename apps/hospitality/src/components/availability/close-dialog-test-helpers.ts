import { fireEvent, screen, within } from "@testing-library/react";

/** The Close dialog: the first dialog, since an open date picker adds its own popover dialog. */
const dialog = () => screen.getAllByRole("dialog")[0]!;

/** Picks a When kind ("Tonight", "One date", "Repeating", ...) from the When select. */
export function chooseWhen(name: string) {
  fireEvent.click(within(dialog()).getByRole("combobox", { name: "When" }));
  fireEvent.click(screen.getByRole("option", { name }));
}

/** Opens the What choices, which the dialog keeps to one line until "Change". */
export function openWhat() {
  const change = within(dialog()).getByRole("button", { name: "Change" });
  if (change.getAttribute("aria-expanded") !== "true") fireEvent.click(change);
}

/** Picks a What kind ("Whole venue", "One service", ...). */
export function chooseWhat(name: string) {
  openWhat();
  fireEvent.click(within(dialog()).getByRole("radio", { name }));
}

/** Opens "Add a note or message" and returns the message-for-guests field. */
export function guestMessageField(): HTMLElement {
  openNote();
  return within(dialog()).getByLabelText(/Message for guests/);
}

export function openNote() {
  const trigger = within(dialog()).getByRole("button", { name: "Add a note or message" });
  if (trigger.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger);
}

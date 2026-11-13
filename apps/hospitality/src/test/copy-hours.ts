import { fireEvent, screen } from "@testing-library/react";

/** The day drawer's "Copy hours…" (to other weekdays). Resolves to the weekday copy dialog. */
export async function openCopyToOtherDays(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole("button", { name: "Copy hours…" }));
  return screen.findByRole("dialog", { name: /Copy .* to other days/ });
}

/**
 * The day drawer's "Use other hours…": another day's hours (one set of hours) or a choice of
 * hours (several). Resolves to the dialog named `name`.
 */
export async function openCopyFrom(name: RegExp): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole("button", { name: "Use other hours…" }));
  return screen.findByRole("dialog", { name });
}

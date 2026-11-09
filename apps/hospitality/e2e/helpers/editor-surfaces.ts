import type { Locator, Page } from "@playwright/test";

/**
 * The resource types of PRD criterion 1 and the writable form each one is edited in, for the
 * editors-per-resource-type table (PRD 2). A surface "hosts an editor" for a type when its
 * signature is visible there without navigating further. The same signatures were run against
 * the throwaway worktree of `origin/main` @ `7c051456f` to measure the "before" column.
 */
export const RESOURCE_TYPES = [
  "weeklyHours",
  "services",
  "specialDates",
  "booking",
  "floorPlan",
  "sections",
  "tables",
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const EDITOR_SIGNATURES: Readonly<Record<ResourceType, (page: Page) => Locator>> = {
  weeklyHours: (page) => page.getByRole("combobox", { name: "Opens" }),
  services: (page) => page.getByRole("textbox", { name: /^Service name/ }),
  specialDates: (page) => page.getByRole("dialog", { name: "Close", exact: true }),
  booking: (page) => page.getByRole("dialog", { name: "Booking rules" }),
  floorPlan: (page) => page.getByRole("dialog", { name: /floor plan/i }),
  sections: (page) => page.getByRole("radiogroup", { name: "Room template" }),
  tables: (page) => page.getByRole("button", { name: /Add Table/i }),
};

/** The resource types whose editor is visible on `page` right now. */
export async function editorsVisibleOn(page: Page): Promise<ResourceType[]> {
  const found: ResourceType[] = [];
  for (const type of RESOURCE_TYPES) {
    if (await EDITOR_SIGNATURES[type](page).first().isVisible()) found.push(type);
  }
  return found;
}

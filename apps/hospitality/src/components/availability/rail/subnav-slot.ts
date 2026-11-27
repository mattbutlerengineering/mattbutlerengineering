import { createContext, useContext } from "react";

/**
 * Where the Availability rail renders (#9944): an element the app sidebar places under its
 * Availability item, so the tree sits in the navigation beside the open page and takes no width
 * from it. The dashboard shell provides it; the Availability layout, which holds the data the tree
 * is built from, portals the rail into it. Loaded with the app shell, so it imports nothing heavy.
 */
export interface SubnavSlot {
  /** `null` until the sidebar has rendered the slot, and while its section is collapsed. */
  readonly slot: HTMLElement | null;
  readonly setSlot: (element: HTMLElement | null) => void;
  /** Closes the phone's sidebar drawer once a rail link is picked, as a sidebar item does. */
  readonly onPick: () => void;
}

export const SubnavSlotContext = createContext<SubnavSlot | null>(null);

export const useSubnavSlot = (): SubnavSlot | null => useContext(SubnavSlotContext);

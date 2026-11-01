import { createContext } from "react";

/**
 * The layer a nested overlay portals into: a node inside the outer dialog's
 * overlay, beside (not inside) its transformed, scrolling panel. Null outside a
 * Dialog. Dialog provides it; Dialog and Popover consume it.
 */
export const DialogLayerContext = createContext<HTMLElement | null>(null);

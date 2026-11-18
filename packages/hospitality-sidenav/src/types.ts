/**
 * The seam between hospitality and the side-nav remote (ADR-032). Everything here is plain data
 * and callbacks: no token, no router object and no React element crosses it.
 */

/** Bumped when a change needs a hospitality deploy: a new action type or a new required input. */
export const SIDENAV_CONTRACT = 1;

/** What selecting an item asks the host to do. Mirrors hospitality's `NavAction` union. */
export type NavAction =
  | { readonly type: "route"; readonly path: string }
  | { readonly type: "chat" }
  | { readonly type: "signout" };

export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly action: NavAction;
  /** Short status text after the label, e.g. the pre-launch progress count. */
  readonly badge?: string;
}

export interface NavSection {
  /** Locale-independent identity; collapse state is persisted under it. */
  readonly id?: string;
  readonly label?: string;
  readonly items: readonly NavItem[];
}

export const READINESS_STATUSES = ["loading", "no-venue", "setup", "operational"] as const;
export type ReadinessStatus = (typeof READINESS_STATUSES)[number];

export interface SideNavReadiness {
  readonly status: ReadinessStatus;
  /** Names of the launch steps already done; only the count is shown. */
  readonly steps: readonly string[];
}

export interface SideNavProps {
  readonly contract: number;
  /** The router-relative path, e.g. `/timeline`. */
  readonly pathname: string;
  /** A BCP 47 tag; unknown ones render en-US. */
  readonly locale: string;
  readonly direction: "ltr" | "rtl";
  readonly flags: {
    /** A display hint only. `RequireAdmin` and the API stay the enforcement. */
    readonly isAdmin: boolean;
  };
  readonly readiness: SideNavReadiness;
  /** Owned by hospitality; only affects screens narrower than 768px. */
  readonly isMobileOpen: boolean;
  readonly onAction: (action: NavAction) => void;
  readonly onMobileClose: () => void;
  /** Called once if the remote's root fails while rendering, so the host can swap to its fallback. */
  readonly onRenderError?: (error: Error) => void;
}

export interface SideNavSlots {
  readonly header: HTMLElement;
  readonly footer: HTMLElement;
}

export interface SideNavHandle {
  update(props: SideNavProps): void;
  slots(): SideNavSlots;
  unmount(): void;
}

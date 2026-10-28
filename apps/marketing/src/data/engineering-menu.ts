export interface EngineeringPage {
  readonly label: string;
  readonly href: string;
}

/** Pages behind the nav's "Engineering" menu, in menu order. */
export const ENGINEERING_PAGES: readonly EngineeringPage[] = [
  { label: "Metrics", href: "/metrics" },
  { label: "Shipped", href: "/shipped" },
  { label: "Weekly", href: "/weekly" },
  { label: "Status", href: "/status" },
  { label: "AI health", href: "/ai-health" },
  { label: "ACMM", href: "/acmm" },
];

/** True when `pathname` is the page or one of its children (`/shipped/:slug`). */
export function isEngineeringPageCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface NavLink {
  readonly label: string;
  readonly href: string;
}

export interface EngineeringMenuItem extends NavLink {
  readonly current?: boolean;
}

export interface EngineeringMenu {
  readonly label: string;
  readonly items: readonly EngineeringMenuItem[];
}

export interface FooterColumn {
  title: string;
  links: { label: string; href: string }[];
}

/** Pages behind the nav's "Engineering" menu, in menu order. */
export const ENGINEERING_PAGES: readonly NavLink[] = [
  { label: "Metrics", href: "/metrics" },
  { label: "Shipped", href: "/shipped" },
  { label: "Status", href: "/status" },
  { label: "AI health", href: "/ai-health" },
  { label: "ACMM", href: "/acmm" },
];

/** True when `pathname` is the page or one of its children (`/shipped/:slug`). */
export function isEngineeringPageCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The "Engineering" dropdown for GlobalNav. Gen is a sibling app (served at the
 * edge, full page load) rather than an engineering dashboard, so it is listed
 * but never marked current.
 */
export function engineeringMenu(pathname: string): EngineeringMenu {
  return {
    label: "Engineering",
    items: [
      ...ENGINEERING_PAGES.map((page) => ({
        ...page,
        current: isEngineeringPageCurrent(pathname, page.href),
      })),
      { label: "Gen", href: "/gen/" },
    ],
  };
}

/** The rich footer's link columns, built fresh so callers cannot mutate shared state. */
export function siteFooterColumns(): FooterColumn[] {
  return [
    {
      title: "Projects",
      links: [
        { label: "Rialto Design System", href: "/rialto/" },
        { label: "Hospitality Platform", href: "/hospitality/" },
        { label: "Gen Playground", href: "/gen/" },
        ...ENGINEERING_PAGES.map((page) => ({ ...page })),
      ],
    },
    {
      title: "Connect",
      links: [
        { label: "GitHub", href: "https://github.com/mattbutlerengineering" },
        { label: "LinkedIn", href: "https://www.linkedin.com/in/matt-butler-66496a68/" },
        { label: "Email", href: "mailto:mattbutlerengineering+webapp@gmail.com" },
      ],
    },
  ];
}

export function siteCopyright(year: number): string {
  return `© ${year} Matt Butler Engineering`;
}

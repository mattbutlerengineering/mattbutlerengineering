import { lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { Spinner } from "@mbe/rialto";

/* ── Lazy-loaded demo pages ──────────────────── */
const SignIn = lazy(() => import("./pages/auth/SignIn").then((m) => ({ default: m.SignIn })));
const SignUp = lazy(() => import("./pages/auth/SignUp").then((m) => ({ default: m.SignUp })));
const Dashboard = lazy(() =>
  import("./pages/dashboard/Dashboard").then((m) => ({ default: m.Dashboard }))
);
const DriverProvider = lazy(() =>
  import("./pages/drivers/DriverProvider").then((m) => ({ default: m.DriverProvider }))
);
const DriverList = lazy(() =>
  import("./pages/drivers/DriverList").then((m) => ({ default: m.DriverList }))
);
const DriverCreate = lazy(() =>
  import("./pages/drivers/DriverCreate").then((m) => ({ default: m.DriverCreate }))
);
const DriverRead = lazy(() =>
  import("./pages/drivers/DriverRead").then((m) => ({ default: m.DriverRead }))
);
const DriverUpdate = lazy(() =>
  import("./pages/drivers/DriverUpdate").then((m) => ({ default: m.DriverUpdate }))
);
const TeamCreate = lazy(() =>
  import("./pages/teams/TeamCreate").then((m) => ({ default: m.TeamCreate }))
);
const VisualTest = lazy(() =>
  import("./pages/visual-test/VisualTest").then((m) => ({ default: m.VisualTest }))
);
const LayoutDemo = lazy(() =>
  import("./pages/layouts/LayoutDemo").then((m) => ({ default: m.LayoutDemo }))
);
const DemoLayout = lazy(() =>
  import("./layouts/DemoLayout").then((m) => ({ default: m.DemoLayout }))
);
const ShowcaseLayout = lazy(() =>
  import("./layouts/ShowcaseLayout").then((m) => ({ default: m.ShowcaseLayout }))
);
const OverviewPage = lazy(() =>
  import("./pages/OverviewPage").then((m) => ({ default: m.OverviewPage }))
);

/* ── Forms ───────────────────────────────────── */
const ButtonPage = lazy(() =>
  import("./pages/forms/ButtonPage").then((m) => ({ default: m.ButtonPage }))
);
const InputPage = lazy(() =>
  import("./pages/forms/InputPage").then((m) => ({ default: m.InputPage }))
);
const TextAreaPage = lazy(() =>
  import("./pages/forms/TextAreaPage").then((m) => ({ default: m.TextAreaPage }))
);
const NumberInputPage = lazy(() =>
  import("./pages/forms/NumberInputPage").then((m) => ({ default: m.NumberInputPage }))
);
const CheckboxRadioPage = lazy(() =>
  import("./pages/forms/CheckboxRadioPage").then((m) => ({ default: m.CheckboxRadioPage }))
);
const TogglePage = lazy(() =>
  import("./pages/forms/TogglePage").then((m) => ({ default: m.TogglePage }))
);
const SliderPage = lazy(() =>
  import("./pages/forms/SliderPage").then((m) => ({ default: m.SliderPage }))
);
const SelectPage = lazy(() =>
  import("./pages/forms/SelectPage").then((m) => ({ default: m.SelectPage }))
);
const PinInputPage = lazy(() =>
  import("./pages/forms/PinInputPage").then((m) => ({ default: m.PinInputPage }))
);
const SegmentedControlPage = lazy(() =>
  import("./pages/forms/SegmentedControlPage").then((m) => ({ default: m.SegmentedControlPage }))
);
const AutocompletePage = lazy(() =>
  import("./pages/forms/AutocompletePage").then((m) => ({ default: m.AutocompletePage }))
);
const InputGroupPage = lazy(() =>
  import("./pages/forms/InputGroupPage").then((m) => ({ default: m.InputGroupPage }))
);

/* ── Data Display ────────────────────────────── */
const CardPage = lazy(() =>
  import("./pages/data/CardPage").then((m) => ({ default: m.CardPage }))
);
const TablePage = lazy(() =>
  import("./pages/data/TablePage").then((m) => ({ default: m.TablePage }))
);
const BadgePage = lazy(() =>
  import("./pages/data/BadgePage").then((m) => ({ default: m.BadgePage }))
);
const TagPage = lazy(() => import("./pages/data/TagPage").then((m) => ({ default: m.TagPage })));
const AvatarPage = lazy(() =>
  import("./pages/data/AvatarPage").then((m) => ({ default: m.AvatarPage }))
);
const StatPage = lazy(() =>
  import("./pages/data/StatPage").then((m) => ({ default: m.StatPage }))
);
const DataListPage = lazy(() =>
  import("./pages/data/DataListPage").then((m) => ({ default: m.DataListPage }))
);
const MeterPage = lazy(() =>
  import("./pages/data/MeterPage").then((m) => ({ default: m.MeterPage }))
);
const KbdPage = lazy(() => import("./pages/data/KbdPage").then((m) => ({ default: m.KbdPage })));
const FlipDotPage = lazy(() =>
  import("./pages/data/FlipDotPage").then((m) => ({ default: m.FlipDotPage }))
);

/* ── Navigation ──────────────────────────────── */
const TabsPage = lazy(() =>
  import("./pages/navigation/TabsPage").then((m) => ({ default: m.TabsPage }))
);
const BreadcrumbPage = lazy(() =>
  import("./pages/navigation/BreadcrumbPage").then((m) => ({ default: m.BreadcrumbPage }))
);
const StepsPage = lazy(() =>
  import("./pages/navigation/StepsPage").then((m) => ({ default: m.StepsPage }))
);
const PaginationPage = lazy(() =>
  import("./pages/navigation/PaginationPage").then((m) => ({ default: m.PaginationPage }))
);
const NavigationMenuPage = lazy(() =>
  import("./pages/navigation/NavigationMenuPage").then((m) => ({ default: m.NavigationMenuPage }))
);
const TreePage = lazy(() =>
  import("./pages/data/TreePage").then((m) => ({ default: m.TreePage }))
);
const SidebarPage = lazy(() =>
  import("./pages/navigation/SidebarPage").then((m) => ({ default: m.SidebarPage }))
);
const NavbarPage = lazy(() =>
  import("./pages/navigation/NavbarPage").then((m) => ({ default: m.NavbarPage }))
);

/* ── Feedback ────────────────────────────────── */
const ToastPage = lazy(() =>
  import("./pages/feedback/ToastPage").then((m) => ({ default: m.ToastPage }))
);
const AlertPage = lazy(() =>
  import("./pages/feedback/AlertPage").then((m) => ({ default: m.AlertPage }))
);
const BannerPage = lazy(() =>
  import("./pages/feedback/BannerPage").then((m) => ({ default: m.BannerPage }))
);
const ProgressPage = lazy(() =>
  import("./pages/feedback/ProgressPage").then((m) => ({ default: m.ProgressPage }))
);
const SpinnerPage = lazy(() =>
  import("./pages/feedback/SpinnerPage").then((m) => ({ default: m.SpinnerPage }))
);
const SkeletonPage = lazy(() =>
  import("./pages/feedback/SkeletonPage").then((m) => ({ default: m.SkeletonPage }))
);
const EmptyStatePage = lazy(() =>
  import("./pages/feedback/EmptyStatePage").then((m) => ({ default: m.EmptyStatePage }))
);

/* ── Overlays ────────────────────────────────── */
const DialogPage = lazy(() =>
  import("./pages/overlays/DialogPage").then((m) => ({ default: m.DialogPage }))
);
const ConfirmDialogPage = lazy(() =>
  import("./pages/overlays/ConfirmDialogPage").then((m) => ({ default: m.ConfirmDialogPage }))
);
const DrawerPage = lazy(() =>
  import("./pages/overlays/DrawerPage").then((m) => ({ default: m.DrawerPage }))
);
const CommandPalettePage = lazy(() =>
  import("./pages/overlays/CommandPalettePage").then((m) => ({ default: m.CommandPalettePage }))
);
const TooltipPage = lazy(() =>
  import("./pages/overlays/TooltipPage").then((m) => ({ default: m.TooltipPage }))
);
const PopoverPage = lazy(() =>
  import("./pages/overlays/PopoverPage").then((m) => ({ default: m.PopoverPage }))
);
const HoverCardPage = lazy(() =>
  import("./pages/overlays/HoverCardPage").then((m) => ({ default: m.HoverCardPage }))
);
const DropdownMenuPage = lazy(() =>
  import("./pages/overlays/DropdownMenuPage").then((m) => ({ default: m.DropdownMenuPage }))
);
const ContextMenuPage = lazy(() =>
  import("./pages/overlays/ContextMenuPage").then((m) => ({ default: m.ContextMenuPage }))
);
const DisabledTooltipPage = lazy(() =>
  import("./pages/overlays/DisabledTooltipPage").then((m) => ({ default: m.DisabledTooltipPage }))
);

/* ── Examples ────────────────────────────────── */
const DashboardExamplePage = lazy(() =>
  import("./pages/examples/DashboardExamplePage").then((m) => ({ default: m.DashboardExamplePage }))
);
const SettingsExamplePage = lazy(() =>
  import("./pages/examples/SettingsExamplePage").then((m) => ({ default: m.SettingsExamplePage }))
);
const FormStatesExamplePage = lazy(() =>
  import("./pages/examples/FormStatesExamplePage").then((m) => ({
    default: m.FormStatesExamplePage,
  }))
);

/* ── Layout ──────────────────────────────────── */
const DividerPage = lazy(() =>
  import("./pages/layout/DividerPage").then((m) => ({ default: m.DividerPage }))
);
const TextPage = lazy(() =>
  import("./pages/layout/TextPage").then((m) => ({ default: m.TextPage }))
);
const StackPage = lazy(() =>
  import("./pages/layout/StackPage").then((m) => ({ default: m.StackPage }))
);
const CollapsiblePage = lazy(() =>
  import("./pages/layout/CollapsiblePage").then((m) => ({ default: m.CollapsiblePage }))
);
const AccordionPage = lazy(() =>
  import("./pages/layout/AccordionPage").then((m) => ({ default: m.AccordionPage }))
);
const AspectRatioPage = lazy(() =>
  import("./pages/layout/AspectRatioPage").then((m) => ({ default: m.AspectRatioPage }))
);
const ScrollAreaPage = lazy(() =>
  import("./pages/layout/ScrollAreaPage").then((m) => ({ default: m.ScrollAreaPage }))
);
const TimelinePage = lazy(() =>
  import("./pages/data/TimelinePage").then((m) => ({ default: m.TimelinePage }))
);
const HeroPage = lazy(() =>
  import("./pages/layout/HeroPage").then((m) => ({ default: m.HeroPage }))
);
const FooterPage = lazy(() =>
  import("./pages/layout/FooterPage").then((m) => ({ default: m.FooterPage }))
);
const PageHeaderPage = lazy(() =>
  import("./pages/layout/PageHeaderPage").then((m) => ({ default: m.PageHeaderPage }))
);

/* ── Shared loading fallback ─────────────────── */
function PageLoading() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
      }}
    >
      <Spinner size="lg" label="Loading..." />
    </div>
  );
}

/** Wrap a lazy component with Suspense */
function suspended(Component: React.LazyExoticComponent<React.ComponentType>) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Component />
    </Suspense>
  );
}

/** Token placeholder page */
function tokenPlaceholder(name: string) {
  return (
    <div style={{ padding: "var(--rialto-space-xl)" }}>
      <p style={{ color: "var(--rialto-text-secondary)" }}>{name} — coming soon</p>
    </div>
  );
}

/* ── Component routes (inside ShowcaseLayout) ── */
const componentRoutes: RouteObject[] = [
  // Forms
  { path: "components/button", element: suspended(ButtonPage) },
  { path: "components/input", element: suspended(InputPage) },
  { path: "components/textarea", element: suspended(TextAreaPage) },
  { path: "components/number-input", element: suspended(NumberInputPage) },
  { path: "components/checkbox-radio", element: suspended(CheckboxRadioPage) },
  { path: "components/toggle", element: suspended(TogglePage) },
  { path: "components/slider", element: suspended(SliderPage) },
  { path: "components/select", element: suspended(SelectPage) },
  { path: "components/pin-input", element: suspended(PinInputPage) },
  { path: "components/segmented-control", element: suspended(SegmentedControlPage) },
  { path: "components/autocomplete", element: suspended(AutocompletePage) },
  { path: "components/input-group", element: suspended(InputGroupPage) },
  // Data Display
  { path: "components/card", element: suspended(CardPage) },
  { path: "components/table", element: suspended(TablePage) },
  { path: "components/badge", element: suspended(BadgePage) },
  { path: "components/tag", element: suspended(TagPage) },
  { path: "components/avatar", element: suspended(AvatarPage) },
  { path: "components/stat", element: suspended(StatPage) },
  { path: "components/data-list", element: suspended(DataListPage) },
  { path: "components/meter", element: suspended(MeterPage) },
  { path: "components/kbd", element: suspended(KbdPage) },
  { path: "components/flip-dot", element: suspended(FlipDotPage) },
  // Navigation
  { path: "components/tabs", element: suspended(TabsPage) },
  { path: "components/breadcrumb", element: suspended(BreadcrumbPage) },
  { path: "components/steps", element: suspended(StepsPage) },
  { path: "components/pagination", element: suspended(PaginationPage) },
  { path: "components/navigation-menu", element: suspended(NavigationMenuPage) },
  { path: "components/tree", element: suspended(TreePage) },
  { path: "components/sidebar", element: suspended(SidebarPage) },
  { path: "components/navbar", element: suspended(NavbarPage) },
  // Feedback
  { path: "components/toast", element: suspended(ToastPage) },
  { path: "components/alert", element: suspended(AlertPage) },
  { path: "components/banner", element: suspended(BannerPage) },
  { path: "components/progress", element: suspended(ProgressPage) },
  { path: "components/spinner", element: suspended(SpinnerPage) },
  { path: "components/skeleton", element: suspended(SkeletonPage) },
  { path: "components/empty-state", element: suspended(EmptyStatePage) },
  // Overlays
  { path: "components/dialog", element: suspended(DialogPage) },
  { path: "components/confirm-dialog", element: suspended(ConfirmDialogPage) },
  { path: "components/drawer", element: suspended(DrawerPage) },
  { path: "components/command-palette", element: suspended(CommandPalettePage) },
  { path: "components/tooltip", element: suspended(TooltipPage) },
  { path: "components/popover", element: suspended(PopoverPage) },
  { path: "components/hover-card", element: suspended(HoverCardPage) },
  { path: "components/dropdown-menu", element: suspended(DropdownMenuPage) },
  { path: "components/context-menu", element: suspended(ContextMenuPage) },
  { path: "components/disabled-tooltip", element: suspended(DisabledTooltipPage) },
  // Layout
  { path: "components/divider", element: suspended(DividerPage) },
  { path: "components/text", element: suspended(TextPage) },
  { path: "components/stack", element: suspended(StackPage) },
  { path: "components/collapsible", element: suspended(CollapsiblePage) },
  { path: "components/accordion", element: suspended(AccordionPage) },
  { path: "components/aspect-ratio", element: suspended(AspectRatioPage) },
  { path: "components/scroll-area", element: suspended(ScrollAreaPage) },
  { path: "components/timeline", element: suspended(TimelinePage) },
  { path: "components/hero", element: suspended(HeroPage) },
  { path: "components/footer", element: suspended(FooterPage) },
  { path: "components/page-header", element: suspended(PageHeaderPage) },
  // Token pages
  { path: "components/motion", element: tokenPlaceholder("Motion tokens") },
  { path: "components/typography", element: tokenPlaceholder("Typography tokens") },
  { path: "components/color", element: tokenPlaceholder("Color tokens") },
  { path: "components/spacing", element: tokenPlaceholder("Spacing tokens") },
  { path: "components/radius", element: tokenPlaceholder("Radius tokens") },
  { path: "components/shadows", element: tokenPlaceholder("Shadow tokens") },
  { path: "components/surfaces", element: tokenPlaceholder("Surface tokens") },
  { path: "components/icon-vocabulary", element: tokenPlaceholder("Icon vocabulary") },
  // Examples
  { path: "examples/dashboard", element: suspended(DashboardExamplePage) },
  { path: "examples/settings", element: suspended(SettingsExamplePage) },
  { path: "examples/form", element: suspended(FormStatesExamplePage) },
];

/**
 * Route tree for createBrowserRouter.
 * Uses the v7 data router API which correctly handles basename on deep links.
 *
 * Only ONE pathless layout route (ShowcaseLayout) exists at the top level.
 * DemoLayout uses an explicit `path: "demos"` to avoid ambiguous route matching
 * in React Router v7 when multiple pathless layouts compete at the same level.
 */
export const routeTree: RouteObject[] = [
  // Showcase shell (sidebar + header)
  {
    element: suspended(ShowcaseLayout),
    children: [
      { index: true, element: suspended(OverviewPage) },
      ...componentRoutes,
    ],
  },
  // Demo pages — explicit "demos" path prefix avoids pathless layout ambiguity
  {
    path: "demos",
    element: suspended(DemoLayout),
    children: [
      { path: "login", element: suspended(SignIn) },
      { path: "signup", element: suspended(SignUp) },
      { path: "dashboard", element: suspended(Dashboard) },
      { path: "teams/new", element: suspended(TeamCreate) },
      { path: "layouts", element: suspended(LayoutDemo) },
      { path: "visual-test", element: suspended(VisualTest) },
      {
        element: suspended(DriverProvider),
        children: [
          { path: "drivers", element: suspended(DriverList) },
          { path: "drivers/new", element: suspended(DriverCreate) },
          { path: "drivers/:id", element: suspended(DriverRead) },
          { path: "drivers/:id/edit", element: suspended(DriverUpdate) },
        ],
      },
    ],
  },
  // Standalone visual-test
  { path: "visual-test", element: suspended(VisualTest) },
  // Catch-all
  { path: "*", element: <Navigate to="/" replace /> },
];

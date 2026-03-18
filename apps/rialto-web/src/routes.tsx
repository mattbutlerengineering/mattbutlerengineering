import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
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
// Timeline is in pages/data/ but the nav route is under Layout section
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
const pageLoading = (
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

/* ── Route props ─────────────────────────────── */
export interface ShowcaseRouterProps {
  theme: "light" | "dark";
  onThemeToggle: () => void;
}

/**
 * All route definitions for the rialto-web showcase app.
 *
 * Structure:
 * - ShowcaseLayout wraps the overview + all component pages (/ and /components/*)
 * - DemoLayout wraps the full-page demo pages (/demos/*)
 * - A standalone /visual-test route (hidden from sidebar)
 */
export function ShowcaseRouter({ theme, onThemeToggle }: ShowcaseRouterProps) {
  return (
    <Suspense fallback={pageLoading}>
      <Routes>
        {/* ── Showcase shell ──────────────────── */}
        <Route element={<ShowcaseLayout theme={theme} onThemeToggle={onThemeToggle} />}>
          {/* Overview landing page */}
          <Route index element={<OverviewPage />} />

          {/* ── Forms ─────────────────────────── */}
          <Route path="/components/button" element={<ButtonPage />} />
          <Route path="/components/input" element={<InputPage />} />
          <Route path="/components/textarea" element={<TextAreaPage />} />
          <Route path="/components/number-input" element={<NumberInputPage />} />
          <Route path="/components/checkbox-radio" element={<CheckboxRadioPage />} />
          <Route path="/components/toggle" element={<TogglePage />} />
          <Route path="/components/slider" element={<SliderPage />} />
          <Route path="/components/select" element={<SelectPage />} />
          <Route path="/components/pin-input" element={<PinInputPage />} />
          <Route path="/components/segmented-control" element={<SegmentedControlPage />} />
          <Route path="/components/autocomplete" element={<AutocompletePage />} />
          <Route path="/components/input-group" element={<InputGroupPage />} />

          {/* ── Data Display ──────────────────── */}
          <Route path="/components/card" element={<CardPage />} />
          <Route path="/components/table" element={<TablePage />} />
          <Route path="/components/badge" element={<BadgePage />} />
          <Route path="/components/tag" element={<TagPage />} />
          <Route path="/components/avatar" element={<AvatarPage />} />
          <Route path="/components/stat" element={<StatPage />} />
          <Route path="/components/data-list" element={<DataListPage />} />
          <Route path="/components/meter" element={<MeterPage />} />
          <Route path="/components/kbd" element={<KbdPage />} />

          {/* ── Navigation ────────────────────── */}
          <Route path="/components/tabs" element={<TabsPage />} />
          <Route path="/components/breadcrumb" element={<BreadcrumbPage />} />
          <Route path="/components/steps" element={<StepsPage />} />
          <Route path="/components/pagination" element={<PaginationPage />} />
          <Route path="/components/navigation-menu" element={<NavigationMenuPage />} />
          <Route path="/components/tree" element={<TreePage />} />
          <Route path="/components/sidebar" element={<SidebarPage />} />
          <Route path="/components/navbar" element={<NavbarPage />} />

          {/* ── Feedback ──────────────────────── */}
          <Route path="/components/toast" element={<ToastPage />} />
          <Route path="/components/alert" element={<AlertPage />} />
          <Route path="/components/banner" element={<BannerPage />} />
          <Route path="/components/progress" element={<ProgressPage />} />
          <Route path="/components/spinner" element={<SpinnerPage />} />
          <Route path="/components/skeleton" element={<SkeletonPage />} />
          <Route path="/components/empty-state" element={<EmptyStatePage />} />

          {/* ── Overlays ──────────────────────── */}
          <Route path="/components/dialog" element={<DialogPage />} />
          <Route path="/components/confirm-dialog" element={<ConfirmDialogPage />} />
          <Route path="/components/drawer" element={<DrawerPage />} />
          <Route path="/components/command-palette" element={<CommandPalettePage />} />
          <Route path="/components/tooltip" element={<TooltipPage />} />
          <Route path="/components/popover" element={<PopoverPage />} />
          <Route path="/components/hover-card" element={<HoverCardPage />} />
          <Route path="/components/dropdown-menu" element={<DropdownMenuPage />} />
          <Route path="/components/context-menu" element={<ContextMenuPage />} />
          <Route path="/components/disabled-tooltip" element={<DisabledTooltipPage />} />

          {/* ── Layout ────────────────────────── */}
          <Route path="/components/divider" element={<DividerPage />} />
          <Route path="/components/text" element={<TextPage />} />
          <Route path="/components/stack" element={<StackPage />} />
          <Route path="/components/collapsible" element={<CollapsiblePage />} />
          <Route path="/components/accordion" element={<AccordionPage />} />
          <Route path="/components/aspect-ratio" element={<AspectRatioPage />} />
          <Route path="/components/scroll-area" element={<ScrollAreaPage />} />
          <Route path="/components/timeline" element={<TimelinePage />} />
          <Route path="/components/hero" element={<HeroPage />} />
          <Route path="/components/footer" element={<FooterPage />} />
          <Route path="/components/page-header" element={<PageHeaderPage />} />

          {/* ── Token pages (kept as future work) ── */}
          <Route
            path="/components/motion"
            element={
              <div style={{ padding: "var(--rialto-space-xl)" }}>
                <p style={{ color: "var(--rialto-text-secondary)" }}>Motion tokens — coming soon</p>
              </div>
            }
          />
          <Route
            path="/components/typography"
            element={
              <div style={{ padding: "var(--rialto-space-xl)" }}>
                <p style={{ color: "var(--rialto-text-secondary)" }}>Typography tokens — coming soon</p>
              </div>
            }
          />
          <Route
            path="/components/color"
            element={
              <div style={{ padding: "var(--rialto-space-xl)" }}>
                <p style={{ color: "var(--rialto-text-secondary)" }}>Color tokens — coming soon</p>
              </div>
            }
          />
          <Route
            path="/components/spacing"
            element={
              <div style={{ padding: "var(--rialto-space-xl)" }}>
                <p style={{ color: "var(--rialto-text-secondary)" }}>Spacing tokens — coming soon</p>
              </div>
            }
          />
          <Route
            path="/components/radius"
            element={
              <div style={{ padding: "var(--rialto-space-xl)" }}>
                <p style={{ color: "var(--rialto-text-secondary)" }}>Radius tokens — coming soon</p>
              </div>
            }
          />
          <Route
            path="/components/shadows"
            element={
              <div style={{ padding: "var(--rialto-space-xl)" }}>
                <p style={{ color: "var(--rialto-text-secondary)" }}>Shadow tokens — coming soon</p>
              </div>
            }
          />
          <Route
            path="/components/surfaces"
            element={
              <div style={{ padding: "var(--rialto-space-xl)" }}>
                <p style={{ color: "var(--rialto-text-secondary)" }}>Surface tokens — coming soon</p>
              </div>
            }
          />
          <Route
            path="/components/icon-vocabulary"
            element={
              <div style={{ padding: "var(--rialto-space-xl)" }}>
                <p style={{ color: "var(--rialto-text-secondary)" }}>Icon vocabulary — coming soon</p>
              </div>
            }
          />
        </Route>

        {/* ── Demo pages ──────────────────────── */}
        <Route element={<DemoLayout />}>
          <Route path="/demos/login" element={<SignIn />} />
          <Route path="/demos/signup" element={<SignUp />} />
          <Route path="/demos/dashboard" element={<Dashboard />} />
          <Route path="/demos/teams/new" element={<TeamCreate />} />
          <Route path="/demos/layouts" element={<LayoutDemo />} />
          <Route path="/demos/visual-test" element={<VisualTest />} />
          <Route element={<DriverProvider />}>
            <Route path="/demos/drivers" element={<DriverList />} />
            <Route path="/demos/drivers/new" element={<DriverCreate />} />
            <Route path="/demos/drivers/:id" element={<DriverRead />} />
            <Route path="/demos/drivers/:id/edit" element={<DriverUpdate />} />
          </Route>
        </Route>

        {/* ── Standalone visual-test (not in sidebar) ── */}
        <Route path="/visual-test" element={<VisualTest />} />

        {/* ── Catch-all: redirect unknown routes to overview ── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

ShowcaseRouter.displayName = "ShowcaseRouter";

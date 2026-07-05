/**
 * Fixture map for the discovery-driven accessibility test matrix.
 *
 * Each entry provides:
 *   - `element`: a React element with the minimum props required to render
 *     without errors so axe-core has valid markup to analyze.
 *
 * When a component cannot be meaningfully axe-tested in jsdom (e.g. relies on
 * canvas, portal-only audio, or is purely a provider with no visual output),
 * add it to SKIPPED_COMPONENTS with a reason string instead.
 *
 * Naming convention: keys match exactly the export name from
 * `src/components/index.ts`. The guard test in a11y-matrix.test.tsx enforces
 * that every barrel export appears in one of the two maps.
 */
import type { ReactElement } from "react";

import { Accordion } from "../../components/Accordion/Accordion";
import { Alert } from "../../components/Alert/Alert";
import { AppBar } from "../../components/AppBar/AppBar";
import { AspectRatio } from "../../components/AspectRatio/AspectRatio";
import { AuthMascot } from "../../components/AuthMascot/AuthMascot";
import { Autocomplete } from "../../components/Autocomplete/Autocomplete";
import { Avatar } from "../../components/Avatar/Avatar";
import { Badge } from "../../components/Badge/Badge";
import { Banner } from "../../components/Banner/Banner";
import { Breadcrumb } from "../../components/Breadcrumb/Breadcrumb";
import { Button } from "../../components/Button/Button";
import { Card } from "../../components/Card/Card";
import {
  Chalkboard,
  ChalkboardSection,
  ChalkboardItem,
} from "../../components/Chalkboard/Chalkboard";
// ChatPanel is in SKIPPED_COMPONENTS — its useChatStream requires @mbe/api-client/streaming
// which is not built in the test environment. Axe coverage lives in ChatPanel.test.tsx.
import { Checkbox } from "../../components/Checkbox/Checkbox";
import { Collapsible } from "../../components/Collapsible/Collapsible";
import { CommandPalette } from "../../components/CommandPalette/CommandPalette";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import { ContextMenu } from "../../components/ContextMenu/ContextMenu";
import { DataList } from "../../components/DataList/DataList";
import { Dialog } from "../../components/Dialog/Dialog";
import { DisabledTooltip } from "../../components/DisabledTooltip/DisabledTooltip";
import { Divider } from "../../components/Divider/Divider";
import { Drawer } from "../../components/Drawer/Drawer";
import { DropdownMenu } from "../../components/DropdownMenu/DropdownMenu";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { ErrorBoundary } from "../../components/ErrorBoundary/ErrorBoundary";
import { Ferrofluid } from "../../components/Ferrofluid/Ferrofluid";
import { FlipDot } from "../../components/FlipDot/FlipDot";
import { Footer } from "../../components/Footer/Footer";
import { GlobalNav } from "../../components/GlobalNav/GlobalNav";
import { Heading } from "../../components/Heading/Heading";
import { Hero } from "../../components/Hero/Hero";
import { HoverCard } from "../../components/HoverCard/HoverCard";
import { ImageUpload } from "../../components/ImageUpload/ImageUpload";
import { Input } from "../../components/Input/Input";
import { InputGroup } from "../../components/InputGroup/InputGroup";
import { Kbd } from "../../components/Kbd/Kbd";
import { MasterOverride } from "../../components/MasterOverride/MasterOverride";
import { Meter } from "../../components/Meter/Meter";
import { Navbar } from "../../components/Navbar/Navbar";
import { NavigationMenu } from "../../components/NavigationMenu/NavigationMenu";
import { NumberInput } from "../../components/NumberInput/NumberInput";
import { Odometer } from "../../components/Odometer/Odometer";
import { PageHeader } from "../../components/PageHeader/PageHeader";
import { Pagination } from "../../components/Pagination/Pagination";
import { PinInput } from "../../components/PinInput/PinInput";
import { Popover } from "../../components/Popover/Popover";
import { Progress, Spinner } from "../../components/Progress/Progress";
import { RadialGauge } from "../../components/RadialGauge/RadialGauge";
import { ScrollArea } from "../../components/ScrollArea/ScrollArea";
import { SegmentedControl } from "../../components/SegmentedControl/SegmentedControl";
import { Select } from "../../components/Select/Select";
import { Sidebar } from "../../components/Sidebar/Sidebar";
import { Skeleton } from "../../components/Skeleton/Skeleton";
import { Slider } from "../../components/Slider/Slider";
import { SplitFlap } from "../../components/SplitFlap/SplitFlap";
import { SplitScreenExit } from "../../components/SplitScreenExit/SplitScreenExit";
import { Stack } from "../../components/Stack/Stack";
import { Stat } from "../../components/Stat/Stat";
import { StatusLED } from "../../components/StatusLED/StatusLED";
import { Steps } from "../../components/Steps/Steps";
import { Table } from "../../components/Table/Table";
import { Tabs } from "../../components/Tabs/Tabs";
import { Tag } from "../../components/Tag/Tag";
import { TapeChart } from "../../components/TapeChart/TapeChart";
import { Text } from "../../components/Text/Text";
import { TextArea } from "../../components/TextArea/TextArea";
import { ThemeToggle } from "../../components/ThemeToggle/ThemeToggle";
import { Timeline } from "../../components/Timeline/Timeline";
import { ToastProvider } from "../../components/Toast/Toast";
import { Toggle } from "../../components/Toggle/Toggle";
import { Tooltip } from "../../components/Tooltip/Tooltip";
import { Tree } from "../../components/Tree/Tree";
import { WatchLoader } from "../../components/WatchLoader/WatchLoader";

// ── Types ────────────────────────────────────────────────────────────────

export interface ComponentFixture {
  /** Rendered element passed to axe-core. */
  readonly element: ReactElement;
}

/**
 * Union of all known barrel export names.
 * The guard test uses this to verify the fixture map is complete.
 */
export type BarrelExportName =
  | "Accordion"
  | "Alert"
  | "AppBar"
  | "AspectRatio"
  | "AuthMascot"
  | "Autocomplete"
  | "Avatar"
  | "Badge"
  | "Banner"
  | "Breadcrumb"
  | "Button"
  | "Card"
  | "Chalkboard"
  | "ChatPanel"
  | "Checkbox"
  | "Collapsible"
  | "CommandPalette"
  | "ConfirmDialog"
  | "ContextMenu"
  | "DataList"
  | "Dialog"
  | "DisabledTooltip"
  | "Divider"
  | "Drawer"
  | "DropdownMenu"
  | "EmptyState"
  | "ErrorBoundary"
  | "Ferrofluid"
  | "FlipDot"
  | "Footer"
  | "GlobalNav"
  | "Heading"
  | "Hero"
  | "HoverCard"
  | "ImageUpload"
  | "Input"
  | "InputGroup"
  | "Kbd"
  | "MasterOverride"
  | "Meter"
  | "Navbar"
  | "NavigationMenu"
  | "NumberInput"
  | "Odometer"
  | "PageHeader"
  | "Pagination"
  | "PinInput"
  | "Popover"
  | "Progress"
  | "RadialGauge"
  | "ScrollArea"
  | "SegmentedControl"
  | "Select"
  | "Sidebar"
  | "Skeleton"
  | "Slider"
  | "Spinner"
  | "SplitFlap"
  | "SplitScreenExit"
  | "Stack"
  | "Stat"
  | "StatusLED"
  | "Steps"
  | "Table"
  | "Tabs"
  | "Tag"
  | "TapeChart"
  | "Text"
  | "TextArea"
  | "ThemeToggle"
  | "Timeline"
  | "Toast"
  | "Toggle"
  | "Tooltip"
  | "Tree"
  | "WatchLoader";

// ── Helpers ──────────────────────────────────────────────────────────────

const noop = () => {};

// ── Fixture map ──────────────────────────────────────────────────────────

/**
 * Maps each component name to its minimum viable axe fixture.
 * Keys must exactly match barrel export names.
 */
export const COMPONENT_FIXTURES: Record<string, ComponentFixture> = {
  Accordion: {
    element: (
      <Accordion
        items={[
          { id: "1", title: "Section 1", content: "Content 1" },
          { id: "2", title: "Section 2", content: "Content 2" },
        ]}
      />
    ),
  },

  Alert: {
    element: <Alert>Something happened</Alert>,
  },

  AppBar: {
    element: <AppBar logo="Rialto" />,
  },

  AspectRatio: {
    element: (
      <AspectRatio ratio={16 / 9}>
        <div>Content</div>
      </AspectRatio>
    ),
  },

  AuthMascot: {
    element: <AuthMascot state="neutral" />,
  },

  Autocomplete: {
    element: (
      <Autocomplete
        label="Country"
        options={[
          { label: "United States", value: "US" },
          { label: "Canada", value: "CA" },
        ]}
      />
    ),
  },

  Avatar: {
    element: <Avatar name="Ada Lovelace" />,
  },

  Badge: {
    element: <Badge>New</Badge>,
  },

  Banner: {
    element: <Banner>System update available</Banner>,
  },

  Breadcrumb: {
    element: (
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Products", href: "/products" },
        ]}
      />
    ),
  },

  Button: {
    element: <Button>Click me</Button>,
  },

  Card: {
    element: <Card title="Title">Card content</Card>,
  },

  Chalkboard: {
    element: (
      <Chalkboard title="Board">
        <ChalkboardSection heading="Items">
          <ChalkboardItem name="Item 1" price="$10" />
        </ChalkboardSection>
      </Chalkboard>
    ),
  },

  Checkbox: {
    element: <Checkbox label="Accept terms" />,
  },

  Collapsible: {
    element: <Collapsible trigger="Details">Hidden content</Collapsible>,
  },

  CommandPalette: {
    element: (
      <CommandPalette
        open={false}
        onOpenChange={noop}
        items={[{ id: "a", label: "Action A", onSelect: noop }]}
      />
    ),
  },

  ConfirmDialog: {
    element: (
      <ConfirmDialog
        open
        title="Are you sure?"
        description="This action cannot be undone."
        onConfirm={noop}
        onCancel={noop}
      />
    ),
  },

  ContextMenu: {
    element: (
      <ContextMenu items={[{ id: "copy", label: "Copy", onSelect: noop }]}>
        <div>Right-click this area</div>
      </ContextMenu>
    ),
  },

  DataList: {
    element: (
      <DataList
        items={[
          { label: "Name", value: "Rialto" },
          { label: "Version", value: "0.1.0" },
        ]}
      />
    ),
  },

  Dialog: {
    element: (
      <Dialog open onClose={noop} title="Test Dialog">
        <p>Dialog content</p>
      </Dialog>
    ),
  },

  DisabledTooltip: {
    element: (
      <DisabledTooltip disabled disabledReason="Feature not available">
        <button>Disabled action</button>
      </DisabledTooltip>
    ),
  },

  Divider: {
    element: <Divider />,
  },

  Drawer: {
    element: (
      <Drawer open onClose={noop} title="Menu">
        <p>Drawer content</p>
      </Drawer>
    ),
  },

  DropdownMenu: {
    element: (
      <DropdownMenu
        trigger={<button>Menu</button>}
        items={[
          { id: "profile", label: "Profile", onSelect: noop },
          { id: "settings", label: "Settings", onSelect: noop },
        ]}
      />
    ),
  },

  EmptyState: {
    element: <EmptyState heading="No results" />,
  },

  ErrorBoundary: {
    element: <ErrorBoundary>Child content</ErrorBoundary>,
  },

  Ferrofluid: {
    element: <Ferrofluid blobCount={3} />,
  },

  FlipDot: {
    element: (
      <FlipDot
        aria-label="Status display"
        matrix={[
          [true, false, true],
          [false, true, false],
        ]}
      />
    ),
  },

  Footer: {
    element: <Footer copyright="© 2024 Rialto" />,
  },

  GlobalNav: {
    element: <GlobalNav currentApp="marketing" />,
  },

  Heading: {
    element: <Heading>Title</Heading>,
  },

  Hero: {
    element: <Hero title="Hero Title" subtitle="Subtitle content" />,
  },

  HoverCard: {
    element: (
      <HoverCard content={<p>Card content</p>}>
        <button>Hover me</button>
      </HoverCard>
    ),
  },

  ImageUpload: {
    element: <ImageUpload label="Logo" />,
  },

  Input: {
    element: <Input label="Email" placeholder="you@example.com" />,
  },

  InputGroup: {
    element: (
      <InputGroup aria-label="Price">
        <span>$</span>
        <Input placeholder="0.00" />
      </InputGroup>
    ),
  },

  Kbd: {
    element: <Kbd>Cmd</Kbd>,
  },

  MasterOverride: {
    element: <MasterOverride label="Launch" on={false} onChange={noop} />,
  },

  Meter: {
    element: <Meter label="Storage" value={70} />,
  },

  Navbar: {
    element: (
      <Navbar
        logo="Rialto"
        links={[
          { id: "1", label: "Home", href: "/" },
          { id: "2", label: "Products", href: "/products" },
        ]}
      />
    ),
  },

  NavigationMenu: {
    element: (
      <NavigationMenu
        items={[
          { label: "Features", href: "/features" },
          { label: "Pricing", href: "/pricing" },
        ]}
      />
    ),
  },

  NumberInput: {
    element: <NumberInput label="Quantity" value={1} onChange={noop} min={1} max={10} />,
  },

  Odometer: {
    element: <Odometer value={1234} locale="en-US" />,
  },

  PageHeader: {
    element: (
      <PageHeader
        title="Account Settings"
        breadcrumbs={[{ label: "Home", href: "/" }, { label: "Settings" }]}
      />
    ),
  },

  Pagination: {
    element: <Pagination page={1} totalPages={5} onChange={noop} />,
  },

  PinInput: {
    element: <PinInput label="Verification Code" length={4} />,
  },

  Popover: {
    element: (
      <Popover trigger={<button>Open</button>}>
        <p>Popover content</p>
      </Popover>
    ),
  },

  Progress: {
    element: <Progress value={45} aria-label="Loading" />,
  },

  RadialGauge: {
    element: <RadialGauge label="Utilization" value={72} unit="%" />,
  },

  ScrollArea: {
    element: (
      <ScrollArea maxHeight={200}>
        <p>Scrollable content</p>
      </ScrollArea>
    ),
  },

  SegmentedControl: {
    element: (
      <SegmentedControl
        segments={[
          { id: "a", label: "Alpha" },
          { id: "b", label: "Beta" },
        ]}
        value="a"
        onChange={noop}
      />
    ),
  },

  Select: {
    element: (
      <Select
        label="Theme"
        options={[
          { label: "Light", value: "light" },
          { label: "Dark", value: "dark" },
        ]}
      />
    ),
  },

  Sidebar: {
    element: (
      <Sidebar
        items={[
          { id: "1", label: "Dashboard", href: "/dashboard" },
          { id: "2", label: "Settings", href: "/settings" },
        ]}
      />
    ),
  },

  Skeleton: {
    element: <Skeleton height={20} width="100%" />,
  },

  Slider: {
    element: <Slider label="Volume" min={0} max={100} defaultValue={50} />,
  },

  /** Spinner is exported from Progress/Progress.tsx alongside Progress */
  Spinner: {
    element: <Spinner label="Loading" />,
  },

  SplitFlap: {
    element: <SplitFlap value="RIALTO" aria-label="Status: RIALTO" />,
  },

  SplitScreenExit: {
    element: (
      <SplitScreenExit active={false}>
        <button>Sign in</button>
      </SplitScreenExit>
    ),
  },

  Stack: {
    element: (
      <Stack direction="column" gap="md">
        <div>A</div>
        <div>B</div>
      </Stack>
    ),
  },

  Stat: {
    element: <Stat label="Revenue" value="$45,000" />,
  },

  StatusLED: {
    element: <StatusLED variant="success" label="Online" />,
  },

  Steps: {
    element: <Steps currentStep={1} steps={[{ label: "Step 1" }, { label: "Step 2" }]} />,
  },

  Table: {
    element: (
      <Table
        columns={[
          { header: "Name", key: "name" },
          { header: "Age", key: "age" },
        ]}
        data={[
          { name: "Alice", age: 30 },
          { name: "Bob", age: 25 },
        ]}
        rowKey={(r) => r.name}
      />
    ),
  },

  Tabs: {
    element: (
      <Tabs
        tabs={[
          { id: "a", label: "Tab A", content: <p>Content A</p> },
          { id: "b", label: "Tab B", content: <p>Content B</p> },
        ]}
      />
    ),
  },

  Tag: {
    element: <Tag>Beta</Tag>,
  },

  TapeChart: {
    element: <TapeChart rooms={[]} reservations={[]} startDate="2026-04-20" endDate="2026-04-27" />,
  },

  Text: {
    element: <Text>Some text content</Text>,
  },

  TextArea: {
    element: <TextArea label="Comments" placeholder="Write something..." />,
  },

  ThemeToggle: {
    element: <ThemeToggle theme="light" onToggle={noop} />,
  },

  Timeline: {
    element: (
      <Timeline
        events={[
          { title: "Created", timestamp: "2024-01-01" },
          { title: "Updated", timestamp: "2024-01-02" },
        ]}
      />
    ),
  },

  /** Toast is tested via ToastProvider — the provider renders accessible markup */
  Toast: {
    element: (
      <ToastProvider>
        <div>Content</div>
      </ToastProvider>
    ),
  },

  Toggle: {
    element: <Toggle label="Notifications" />,
  },

  Tooltip: {
    element: (
      <Tooltip content="Save changes">
        <button>Save</button>
      </Tooltip>
    ),
  },

  Tree: {
    element: <Tree data={[{ id: "1", label: "Root", children: [{ id: "2", label: "Child" }] }]} />,
  },

  WatchLoader: {
    element: <WatchLoader aria-label="Loading" />,
  },
} as const;

/**
 * Components that cannot be meaningfully axe-tested in jsdom.
 * Each entry requires a human-readable reason.
 *
 * A component here is explicitly excluded from the axe matrix, but still
 * documented — it does NOT silently fall through.
 */
export const SKIPPED_COMPONENTS: Record<string, { reason: string }> = {
  /**
   * ChatPanel imports useChatStream which imports @mbe/api-client/streaming.
   * That package is not built in the test environment, causing a Vite import
   * resolution failure. Axe coverage is provided by ChatPanel.test.tsx which
   * mocks useChatStream at the module level.
   */
  ChatPanel: {
    reason:
      "useChatStream imports @mbe/api-client/streaming (not built in test env); axe tested in ChatPanel.test.tsx",
  },
};

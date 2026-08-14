/**
 * Smoke tests for all Rialto components.
 * Each test verifies the component renders without crashing.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

/* ── Components ─────────────────────────────── */
import { AppBar } from "./AppBar/AppBar";
import { Accordion } from "./Accordion/Accordion";
import { Alert } from "./Alert/Alert";
import { AspectRatio } from "./AspectRatio/AspectRatio";
import { Autocomplete } from "./Autocomplete/Autocomplete";
import { Avatar, AvatarGroup } from "./Avatar/Avatar";
import { Badge } from "./Badge/Badge";
import { Banner } from "./Banner/Banner";
import { Breadcrumb } from "./Breadcrumb/Breadcrumb";
import { Button } from "./Button/Button";
import { Card } from "./Card/Card";
import { Checkbox } from "./Checkbox/Checkbox";
import { Collapsible } from "./Collapsible/Collapsible";
import { CommandPalette } from "./CommandPalette/CommandPalette";
import { ConfirmDialog } from "./ConfirmDialog/ConfirmDialog";
import { ContextMenu } from "./ContextMenu/ContextMenu";
import { DataList } from "./DataList/DataList";
import { Dialog } from "./Dialog/Dialog";
import { Divider } from "./Divider/Divider";
import { Drawer } from "./Drawer/Drawer";
import { DropdownMenu } from "./DropdownMenu/DropdownMenu";
import { EmptyState } from "./EmptyState/EmptyState";
import { Heading } from "./Heading/Heading";
import { HoverCard } from "./HoverCard/HoverCard";
import { Input } from "./Input/Input";
import { InputGroup } from "./InputGroup/InputGroup";
import { Kbd } from "./Kbd/Kbd";
import { Meter } from "./Meter/Meter";
import { Navbar } from "./Navbar/Navbar";
import { NavigationMenu } from "./NavigationMenu/NavigationMenu";
import { NumberInput } from "./NumberInput/NumberInput";
import { Pagination } from "./Pagination/Pagination";
import { PinInput } from "./PinInput/PinInput";
import { Popover } from "./Popover/Popover";
import { Progress, Spinner } from "./Progress/Progress";
import { ScrollArea } from "./ScrollArea/ScrollArea";
import { SegmentedControl } from "./SegmentedControl/SegmentedControl";
import { Select } from "./Select/Select";
import { Sidebar } from "./Sidebar/Sidebar";
import { Skeleton, SkeletonGroup } from "./Skeleton/Skeleton";
import { Slider } from "./Slider/Slider";
import { Stack } from "./Stack/Stack";
import { Stat } from "./Stat/Stat";
import { Steps } from "./Steps/Steps";
import { Table } from "./Table/Table";
import { Tabs } from "./Tabs/Tabs";
import { Tag, AnimatedTag, TagGroup } from "./Tag/Tag";
import { Text } from "./Text/Text";
import { TextArea } from "./TextArea/TextArea";
import { Timeline } from "./Timeline/Timeline";
import { ToastProvider } from "./Toast/Toast";

import { useToast } from "./Toast/ToastContext";
import { Toggle } from "./Toggle/Toggle";
import { Tooltip } from "./Tooltip/Tooltip";
import { Tree } from "./Tree/Tree";

/* ── Helpers ─────────────────────────────────── */
const noop = () => {};

/* ── Smoke Tests ─────────────────────────────── */
describe("Smoke tests — every component renders without crashing", () => {
  it("AppBar", () => {
    render(<AppBar logo={<span>Brand</span>} actions={<button>Toggle</button>} />);
    expect(screen.getByText("Brand")).toBeInTheDocument();
    expect(screen.getByText("Toggle")).toBeInTheDocument();
  });

  it("Accordion", () => {
    render(<Accordion items={[{ id: "1", title: "Section 1", content: "Content 1" }]} />);
    expect(screen.getByText("Section 1")).toBeInTheDocument();
  });

  it("Alert", () => {
    render(<Alert>Something happened</Alert>);
    expect(screen.getByText("Something happened")).toBeInTheDocument();
  });

  it("AspectRatio", () => {
    render(
      <AspectRatio ratio={16 / 9}>
        <div>Content</div>
      </AspectRatio>
    );
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("Avatar", () => {
    render(<Avatar name="Ada Lovelace" />);
    expect(screen.getByText("AL")).toBeInTheDocument();
  });

  it("Autocomplete", () => {
    render(
      <Autocomplete
        label="Search"
        options={[
          { value: "apple", label: "Apple" },
          { value: "banana", label: "Banana" },
        ]}
      />
    );
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
  });

  it("AvatarGroup", () => {
    render(<AvatarGroup avatars={[{ name: "Alice" }, { name: "Bob" }, { name: "Carol" }]} />);
    expect(screen.getByLabelText("Alice")).toBeInTheDocument();
  });

  it("Badge", () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("Banner", () => {
    render(<Banner>System update available</Banner>);
    expect(screen.getByText("System update available")).toBeInTheDocument();
  });

  it("Breadcrumb", () => {
    render(
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Products", href: "/products" },
        ]}
      />
    );
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("Button", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("Card", () => {
    render(<Card title="Title">Card content</Card>);
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("Card with tilt", () => {
    render(
      <Card tilt title="Tilt">
        Tilt content
      </Card>
    );
    expect(screen.getByText("Tilt content")).toBeInTheDocument();
  });

  it("Checkbox", () => {
    render(<Checkbox label="Accept terms" />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("Collapsible", () => {
    render(<Collapsible trigger="Details">Hidden content</Collapsible>);
    expect(screen.getByText("Details")).toBeInTheDocument();
  });

  it("CommandPalette", () => {
    render(
      <CommandPalette
        open={false}
        onOpenChange={noop}
        items={[{ id: "a", label: "Action", onSelect: noop }]}
      />
    );
    // Closed contract: the palette dialog and its items are absent from the a11y tree.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Action")).toBeNull();
  });

  it("ConfirmDialog", () => {
    render(<ConfirmDialog open={false} onConfirm={noop} onCancel={noop} title="Delete?" />);
    // Closed contract: the dialog and its title are absent from the a11y tree.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Delete?")).toBeNull();
  });

  it("ContextMenu", () => {
    render(
      <ContextMenu items={[{ id: "copy", label: "Copy", onSelect: noop }]}>
        <div>Right-click me</div>
      </ContextMenu>
    );
    expect(screen.getByText("Right-click me")).toBeInTheDocument();
  });

  it("DataList", () => {
    render(
      <DataList
        items={[
          { label: "Name", value: "Rialto" },
          { label: "Version", value: "0.1.0" },
        ]}
      />
    );
    expect(screen.getByText("Rialto")).toBeInTheDocument();
  });

  it("Dialog", () => {
    render(<Dialog open={false} onClose={noop} title="Test" />);
    // Closed contract: the dialog and its title are absent from the a11y tree.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Test")).toBeNull();
  });

  it("Divider", () => {
    render(<Divider />);
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("Drawer", () => {
    render(
      <Drawer open={false} onClose={noop}>
        Drawer content
      </Drawer>
    );
    // Closed contract: the drawer dialog and its content are absent from the a11y tree.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Drawer content")).toBeNull();
  });

  it("DropdownMenu", () => {
    render(
      <DropdownMenu
        trigger={<button>Menu</button>}
        items={[{ id: "edit", label: "Edit", onSelect: noop }]}
      />
    );
    expect(screen.getByText("Menu")).toBeInTheDocument();
  });

  it("EmptyState", () => {
    render(<EmptyState heading="No results" />);
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("HoverCard", () => {
    render(
      <HoverCard content={<p>Details</p>}>
        <span>Hover me</span>
      </HoverCard>
    );
    expect(screen.getByText("Hover me")).toBeInTheDocument();
  });

  it("Heading", () => {
    render(<Heading>Reservations</Heading>);
    expect(screen.getByRole("heading", { level: 2, name: "Reservations" })).toBeInTheDocument();
  });

  it("Input", () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("InputGroup", () => {
    render(
      <InputGroup>
        <input placeholder="Search..." />
        <button>Go</button>
      </InputGroup>
    );
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("Kbd", () => {
    render(<Kbd>⌘K</Kbd>);
    expect(screen.getByText("⌘K")).toBeInTheDocument();
  });

  it("Meter", () => {
    render(<Meter value={60} label="Usage" />);
    expect(screen.getByRole("meter", { name: "Usage" })).toHaveAttribute("aria-valuenow", "60");
  });

  it("Navbar", () => {
    render(<Navbar links={[{ id: "home", label: "Home", href: "/" }]} />);
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("NavigationMenu", () => {
    render(<NavigationMenu items={[{ label: "Docs", href: "/docs" }]} />);
    expect(screen.getByText("Docs")).toBeInTheDocument();
  });

  it("NumberInput", () => {
    render(<NumberInput label="Quantity" value={1} onChange={noop} />);
    expect(screen.getByLabelText("Quantity")).toBeInTheDocument();
  });

  it("Pagination", () => {
    render(<Pagination page={1} totalPages={5} onChange={noop} />);
    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
  });

  it("PinInput", () => {
    render(<PinInput label="Code" />);
    expect(screen.getByRole("group", { name: "Code" })).toBeInTheDocument();
  });

  it("Popover", () => {
    render(<Popover trigger={<button>Open</button>}>Popover content</Popover>);
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("Progress", () => {
    render(<Progress value={50} aria-label="Loading" />);
    expect(screen.getByRole("progressbar", { name: "Loading" })).toHaveAttribute(
      "aria-valuenow",
      "50"
    );
  });

  it("Spinner", () => {
    render(<Spinner label="Loading" />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("ScrollArea", () => {
    render(
      <ScrollArea maxHeight={200}>
        <p>Scrollable content</p>
      </ScrollArea>
    );
    expect(screen.getByText("Scrollable content")).toBeInTheDocument();
  });

  it("SegmentedControl", () => {
    render(
      <SegmentedControl
        segments={[
          { id: "a", label: "Alpha" },
          { id: "b", label: "Beta" },
        ]}
        value="a"
        onChange={noop}
      />
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("Select", () => {
    render(
      <Select
        label="Color"
        options={[
          { value: "red", label: "Red" },
          { value: "blue", label: "Blue" },
        ]}
      />
    );
    expect(screen.getByRole("combobox", { name: "Color" })).toBeInTheDocument();
  });

  it("Sidebar", () => {
    render(<Sidebar items={[{ id: "home", label: "Home", icon: <span>🏠</span> }]} />);
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("Skeleton", () => {
    const { container } = render(<Skeleton width={200} height={20} />);
    // Skeleton is intentionally aria-hidden (a decorative loading placeholder),
    // so its rendering contract is verified via the dimensions derived from props.
    const placeholder = container.querySelector('[aria-hidden="true"]');
    expect(placeholder).toHaveStyle({ width: "200px", height: "20px" });
  });

  it("SkeletonGroup", () => {
    render(
      <SkeletonGroup>
        <Skeleton width={200} height={20} />
        <Skeleton width={150} height={20} />
      </SkeletonGroup>
    );
    expect(screen.getByRole("status", { name: "Loading content" })).toBeInTheDocument();
  });

  it("Slider", () => {
    render(<Slider min={0} max={100} value={50} onChange={noop} />);
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "50");
  });

  it("Stack", () => {
    render(
      <Stack direction="column" gap="md">
        <div>A</div>
        <div>B</div>
      </Stack>
    );
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("Stat", () => {
    render(<Stat value="1,234" label="Users" />);
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });

  it("Steps", () => {
    render(
      <Steps
        steps={[{ label: "Step 1" }, { label: "Step 2" }, { label: "Step 3" }]}
        currentStep={0}
      />
    );
    expect(screen.getByText("Step 1")).toBeInTheDocument();
  });

  it("Table", () => {
    render(
      <Table
        columns={[
          { key: "name", header: "Name" },
          { key: "role", header: "Role" },
        ]}
        data={[{ name: "Alice", role: "Admin" }]}
        rowKey={(r) => r.name}
      />
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("Tabs", () => {
    render(
      <Tabs
        tabs={[
          { id: "a", label: "Tab A", content: <p>Content A</p> },
          { id: "b", label: "Tab B", content: <p>Content B</p> },
        ]}
      />
    );
    expect(screen.getByText("Tab A")).toBeInTheDocument();
  });

  it("Tag", () => {
    render(<Tag>Label</Tag>);
    expect(screen.getByText("Label")).toBeInTheDocument();
  });

  it("AnimatedTag", () => {
    render(<AnimatedTag id="tag-1">Animated</AnimatedTag>);
    expect(screen.getByText("Animated")).toBeInTheDocument();
  });

  it("TagGroup", () => {
    render(
      <TagGroup>
        <AnimatedTag key="a" id="a">
          A
        </AnimatedTag>
        <AnimatedTag key="b" id="b">
          B
        </AnimatedTag>
      </TagGroup>
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("Text", () => {
    render(<Text>Hello world</Text>);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("TextArea", () => {
    render(<TextArea label="Message" />);
    expect(screen.getByLabelText("Message")).toBeInTheDocument();
  });

  it("Timeline", () => {
    render(
      <Timeline
        events={[
          {
            title: "Created",
            description: "Project started",
            timestamp: "2025-01-01",
          },
          { title: "Released", description: "v1.0", timestamp: "2025-06-01" },
        ]}
      />
    );
    expect(screen.getByText("Created")).toBeInTheDocument();
  });

  it("ToastProvider", () => {
    render(
      <ToastProvider>
        <div>App</div>
      </ToastProvider>
    );
    expect(screen.getByText("App")).toBeInTheDocument();
  });

  it("useToast (inside provider)", () => {
    function TestConsumer() {
      const { toast } = useToast();
      return <button onClick={() => toast({ title: "Hi" })}>Fire</button>;
    }
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    expect(screen.getByText("Fire")).toBeInTheDocument();
  });

  it("Toggle", () => {
    render(<Toggle label="Dark mode" />);
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });

  it("Tooltip", () => {
    render(
      <Tooltip content="Help text">
        <button>Hover</button>
      </Tooltip>
    );
    expect(screen.getByText("Hover")).toBeInTheDocument();
  });

  it("Tree", () => {
    render(
      <Tree
        data={[
          {
            id: "root",
            label: "Root",
            children: [{ id: "child", label: "Child" }],
          },
        ]}
      />
    );
    expect(screen.getByText("Root")).toBeInTheDocument();
  });
});

/**
 * Accessibility tests for Rialto components using axe-core.
 * Each test verifies the component has no WCAG 2.1 AA violations.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { axe } from "vitest-axe";

/* ── Components ─────────────────────────────── */
import { Accordion } from "./Accordion/Accordion";
import { Alert } from "./Alert/Alert";
import { AppBar } from "./AppBar/AppBar";
import { AspectRatio } from "./AspectRatio/AspectRatio";
import { Autocomplete } from "./Autocomplete/Autocomplete";
import { Avatar } from "./Avatar/Avatar";
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
import { DisabledTooltip } from "./DisabledTooltip/DisabledTooltip";
import { Divider } from "./Divider/Divider";
import { Drawer } from "./Drawer/Drawer";
import { DropdownMenu } from "./DropdownMenu/DropdownMenu";
import { EmptyState } from "./EmptyState/EmptyState";
import { Footer } from "./Footer/Footer";
import { Hero } from "./Hero/Hero";
import { HoverCard } from "./HoverCard/HoverCard";
import { Input } from "./Input/Input";
import { InputGroup } from "./InputGroup/InputGroup";
import { Kbd } from "./Kbd/Kbd";
import { Meter } from "./Meter/Meter";
import { Navbar } from "./Navbar/Navbar";
import { NavigationMenu } from "./NavigationMenu/NavigationMenu";
import { NumberInput } from "./NumberInput/NumberInput";
import { PageHeader } from "./PageHeader/PageHeader";
import { Pagination } from "./Pagination/Pagination";
import { PinInput } from "./PinInput/PinInput";
import { Popover } from "./Popover/Popover";
import { Progress, Spinner } from "./Progress/Progress";
import { ScrollArea } from "./ScrollArea/ScrollArea";
import { SegmentedControl } from "./SegmentedControl/SegmentedControl";
import { Select } from "./Select/Select";
import { Sidebar } from "./Sidebar/Sidebar";
import { Skeleton } from "./Skeleton/Skeleton";
import { Slider } from "./Slider/Slider";
import { Stack } from "./Stack/Stack";
import { Stat } from "./Stat/Stat";
import { Steps } from "./Steps/Steps";
import { Table } from "./Table/Table";
import { Tabs } from "./Tabs/Tabs";
import { Tag } from "./Tag/Tag";
import { Text } from "./Text/Text";
import { TextArea } from "./TextArea/TextArea";
import { Timeline } from "./Timeline/Timeline";
import { ToastProvider } from "./Toast/Toast";
import { Toggle } from "./Toggle/Toggle";
import { Tooltip } from "./Tooltip/Tooltip";
import { Tree } from "./Tree/Tree";

/* ── Helpers ─────────────────────────────────── */
const noop = () => {};

// jsdom does not implement scrollIntoView — stub it so CommandPalette doesn't throw
window.HTMLElement.prototype.scrollIntoView = () => {};

/* ── Accessibility Tests ─────────────────────── */
describe("Accessibility — axe-core WCAG 2.1 AA", () => {
  it("Accordion", async () => {
    const { container } = render(
      <Accordion
        items={[
          { id: "1", title: "Section 1", content: "Content 1" },
          { id: "2", title: "Section 2", content: "Content 2" },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Alert", async () => {
    const { container } = render(<Alert>Something happened</Alert>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Avatar", async () => {
    const { container } = render(<Avatar name="Ada Lovelace" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Badge", async () => {
    const { container } = render(<Badge>New</Badge>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Banner", async () => {
    const { container } = render(<Banner>System update available</Banner>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Breadcrumb", async () => {
    const { container } = render(
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Products", href: "/products" },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Button", async () => {
    const { container } = render(<Button>Click me</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Button (disabled)", async () => {
    const { container } = render(<Button disabled>Save</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Input (disabled with reason)", async () => {
    const { container } = render(<Input label="Email" disabled disabledReason="Account locked" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Toggle (disabled with reason)", async () => {
    const { container } = render(
      <Toggle label="Notifications" disabled disabledReason="Feature unavailable" />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Card", async () => {
    const { container } = render(<Card title="Title">Card content</Card>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Card with tilt has no violations", async () => {
    const { container } = render(
      <Card tilt title="Tilt Card">
        <p>Content</p>
      </Card>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Checkbox", async () => {
    const { container } = render(<Checkbox label="Accept terms" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Collapsible", async () => {
    const { container } = render(<Collapsible trigger="Details">Hidden content</Collapsible>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("DataList", async () => {
    const { container } = render(
      <DataList
        items={[
          { label: "Name", value: "Rialto" },
          { label: "Version", value: "0.1.0" },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Dialog (open)", async () => {
    const { container } = render(
      <Dialog open onClose={noop} title="Test Dialog">
        <p>Dialog content</p>
      </Dialog>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Divider", async () => {
    const { container } = render(<Divider />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("EmptyState", async () => {
    const { container } = render(<EmptyState heading="No results" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Input", async () => {
    const { container } = render(<Input label="Email" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Kbd", async () => {
    const { container } = render(<Kbd>⌘K</Kbd>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Meter", async () => {
    const { container } = render(<Meter value={60} label="Usage" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Navbar", async () => {
    const { container } = render(<Navbar links={[{ id: "home", label: "Home", href: "/" }]} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("NavigationMenu", async () => {
    const { container } = render(<NavigationMenu items={[{ label: "Docs", href: "/docs" }]} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("NumberInput", async () => {
    const { container } = render(<NumberInput label="Quantity" value={1} onChange={noop} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Pagination", async () => {
    const { container } = render(<Pagination page={1} totalPages={5} onChange={noop} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("PinInput", async () => {
    const { container } = render(<PinInput label="Code" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Progress", async () => {
    const { container } = render(<Progress value={50} aria-label="Loading" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Spinner", async () => {
    const { container } = render(<Spinner label="Loading" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("SegmentedControl", async () => {
    const { container } = render(
      <SegmentedControl
        segments={[
          { id: "a", label: "Alpha" },
          { id: "b", label: "Beta" },
        ]}
        value="a"
        onChange={noop}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Select", async () => {
    const { container } = render(
      <Select
        label="Color"
        options={[
          { value: "red", label: "Red" },
          { value: "blue", label: "Blue" },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Sidebar", async () => {
    const { container } = render(
      <Sidebar items={[{ id: "home", label: "Home", icon: <span>H</span> }]} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Slider", async () => {
    const { container } = render(
      <Slider min={0} max={100} value={50} onChange={noop} aria-label="Volume" />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Stack", async () => {
    const { container } = render(
      <Stack direction="column" gap="md">
        <div>A</div>
        <div>B</div>
      </Stack>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Stat", async () => {
    const { container } = render(<Stat value="1,234" label="Users" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Steps", async () => {
    const { container } = render(
      <Steps
        steps={[{ label: "Step 1" }, { label: "Step 2" }, { label: "Step 3" }]}
        currentStep={0}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Table", async () => {
    const { container } = render(
      <Table
        columns={[
          { key: "name", header: "Name" },
          { key: "role", header: "Role" },
        ]}
        data={[{ name: "Alice", role: "Admin" }]}
        rowKey={(r) => r.name}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Tabs", async () => {
    const { container } = render(
      <Tabs
        tabs={[
          { id: "a", label: "Tab A", content: <p>Content A</p> },
          { id: "b", label: "Tab B", content: <p>Content B</p> },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Tag", async () => {
    const { container } = render(<Tag>Label</Tag>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Text", async () => {
    const { container } = render(<Text>Hello world</Text>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("TextArea", async () => {
    const { container } = render(<TextArea label="Message" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Timeline", async () => {
    const { container } = render(
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
    expect(await axe(container)).toHaveNoViolations();
  });

  it("ToastProvider", async () => {
    const { container } = render(
      <ToastProvider>
        <div>App</div>
      </ToastProvider>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Toggle", async () => {
    const { container } = render(<Toggle label="Dark mode" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Tree", async () => {
    const { container } = render(
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
    expect(await axe(container)).toHaveNoViolations();
  });

  /* ── Non-portal components (Task 1) ──────────── */

  it("AppBar", async () => {
    const { container } = render(
      <AppBar logo={<span>Acme</span>} aria-label="Main navigation" />
    );
    expect(
      await axe(container, {
        rules: {
          // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
          "color-contrast": { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });

  it("AspectRatio", async () => {
    const { container } = render(
      <AspectRatio ratio={16 / 9}>
        <div>Content</div>
      </AspectRatio>
    );
    expect(
      await axe(container, {
        rules: {
          // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
          "color-contrast": { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });

  it("DisabledTooltip (disabled with reason)", async () => {
    const { container } = render(
      <DisabledTooltip disabled disabledReason="Feature unavailable">
        <button type="button" disabled>
          Save
        </button>
      </DisabledTooltip>
    );
    expect(
      await axe(container, {
        rules: {
          // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
          "color-contrast": { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });

  it("Footer (minimal)", async () => {
    const { container } = render(
      <Footer>
        <span>&copy; 2026 Rialto</span>
      </Footer>
    );
    expect(
      await axe(container, {
        rules: {
          // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
          "color-contrast": { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });

  it("Footer (rich)", async () => {
    const { container } = render(
      <Footer
        variant="rich"
        columns={[{ title: "Product", links: [{ label: "Docs", href: "/docs" }] }]}
        copyright="&copy; 2026 Rialto"
      />
    );
    expect(
      await axe(container, {
        rules: {
          // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
          "color-contrast": { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });

  it("Hero", async () => {
    const { container } = render(
      <Hero
        title="Precision meets warmth"
        subtitle="A component library for premium digital products."
        minHeight="auto"
      />
    );
    expect(
      await axe(container, {
        rules: {
          // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
          "color-contrast": { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });

  it("InputGroup", async () => {
    const { container } = render(
      <InputGroup aria-label="Search group">
        <Input label="Search" />
        <Button>Go</Button>
      </InputGroup>
    );
    expect(
      await axe(container, {
        rules: {
          // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
          "color-contrast": { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });

  it("PageHeader", async () => {
    const { container } = render(
      <PageHeader
        title="Account Settings"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Settings" },
        ]}
      />
    );
    expect(
      await axe(container, {
        rules: {
          // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
          "color-contrast": { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });

  it("ScrollArea", async () => {
    const { container } = render(
      <ScrollArea maxHeight={200}>
        <p>Long scrollable content goes here.</p>
      </ScrollArea>
    );
    expect(
      await axe(container, {
        rules: {
          // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
          "color-contrast": { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });

  it("Skeleton", async () => {
    const { container } = render(<Skeleton variant="rect" width={200} height={24} />);
    expect(
      await axe(container, {
        rules: {
          // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
          "color-contrast": { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });

  /* ── Portal-based components (Task 2) ────────── */

  it("CommandPalette (open)", async () => {
    render(
      <CommandPalette
        open
        onOpenChange={noop}
        items={[
          { id: "new", label: "New File", onSelect: noop },
          { id: "open", label: "Open File", onSelect: noop },
        ]}
        placeholder="Search commands…"
      />
    );
    expect(
      await axe(document.body, {
        rules: {
          // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
          "color-contrast": { enabled: false },
          // Isolated test content lacks page-level landmark wrappers — not a component concern
          region: { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });

  it("Drawer (open)", async () => {
    render(
      <Drawer open onClose={noop} title="Test Drawer">
        <p>Drawer content</p>
      </Drawer>
    );
    expect(
      await axe(document.body, {
        rules: {
          // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
          "color-contrast": { enabled: false },
          // Isolated test content lacks page-level landmark wrappers — not a component concern
          region: { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });

  it("ConfirmDialog (open)", async () => {
    render(
      <ConfirmDialog
        open
        onConfirm={noop}
        onCancel={noop}
        title="Delete item?"
        description="This action cannot be undone."
      />
    );
    expect(
      await axe(document.body, {
        rules: {
          // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
          "color-contrast": { enabled: false },
          // Isolated test content lacks page-level landmark wrappers — not a component concern
          region: { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });

  it("DropdownMenu (open)", async () => {
    const { getByRole } = render(
      <DropdownMenu
        trigger={<button type="button">Actions</button>}
        items={[
          { id: "edit", label: "Edit", onSelect: noop },
          { id: "delete", label: "Delete", destructive: true, onSelect: noop },
        ]}
      />
    );
    await act(async () => {
      // The trigger button now has aria-haspopup and aria-expanded injected onto it
      fireEvent.click(getByRole("button", { name: "Actions" }));
    });
    expect(
      await axe(document.body, {
        rules: {
          // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
          "color-contrast": { enabled: false },
          // Isolated test content lacks page-level landmark wrappers — not a component concern
          region: { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });

  it("Popover (open)", async () => {
    const { getByRole } = render(
      <Popover trigger={<button type="button">Options</button>} title="Filter">
        <p>Popover content</p>
      </Popover>
    );
    await act(async () => {
      // The trigger button now has aria-haspopup and aria-expanded injected onto it
      fireEvent.click(getByRole("button", { name: "Options" }));
    });
    expect(
      await axe(document.body, {
        rules: {
          // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
          "color-contrast": { enabled: false },
          // Isolated test content lacks page-level landmark wrappers — not a component concern
          region: { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });

  it("Tooltip (visible)", async () => {
    const { getByRole } = render(
      <Tooltip content="Copy to clipboard" delay={0}>
        <button type="button">Copy</button>
      </Tooltip>
    );
    await act(async () => {
      fireEvent.mouseEnter(getByRole("button"));
      // delay=0 means tooltip shows synchronously in next tick
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(
      await axe(document.body, {
        rules: {
          // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
          "color-contrast": { enabled: false },
          // Isolated test content lacks page-level landmark wrappers — not a component concern
          region: { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });

  it("ContextMenu (open)", async () => {
    const { getByText } = render(
      <ContextMenu
        items={[
          { id: "copy", label: "Copy", onSelect: noop },
          { id: "paste", label: "Paste", onSelect: noop },
        ]}
      >
        <div>Right-click this area</div>
      </ContextMenu>
    );
    await act(async () => {
      fireEvent.contextMenu(getByText("Right-click this area"));
    });
    expect(
      await axe(document.body, {
        rules: {
          // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
          "color-contrast": { enabled: false },
          // Isolated test content lacks page-level landmark wrappers — not a component concern
          region: { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });

  it("HoverCard (visible)", async () => {
    const { getByRole } = render(
      <HoverCard
        content={<p>User profile preview</p>}
        openDelay={0}
        placement="bottom"
      >
        <a href="/user/1">Ada Lovelace</a>
      </HoverCard>
    );
    await act(async () => {
      fireEvent.mouseEnter(getByRole("link"));
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(
      await axe(document.body, {
        rules: {
          // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
          "color-contrast": { enabled: false },
          // Isolated test content lacks page-level landmark wrappers — not a component concern
          region: { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });

  it("Autocomplete (open with options)", async () => {
    const { getByRole } = render(
      <Autocomplete
        label="Country"
        options={[
          { value: "us", label: "United States" },
          { value: "ca", label: "Canada" },
          { value: "gb", label: "United Kingdom" },
        ]}
        placeholder="Search countries…"
      />
    );
    await act(async () => {
      fireEvent.change(getByRole("combobox"), { target: { value: "U" } });
    });
    expect(
      await axe(document.body, {
        rules: {
          // jsdom cannot resolve CSS custom properties — covered by token-contrast.test.ts
          "color-contrast": { enabled: false },
          // Isolated test content lacks page-level landmark wrappers — not a component concern
          region: { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });
});

/* ── Focus Management Tests ──────────────────── */
describe("Focus management — return-to-trigger on close", () => {
  /**
   * Flush all pending timers (including requestAnimationFrame, which jsdom
   * backs with setTimeout) so focus-return rAF callbacks run synchronously.
   */
  function flushRaf() {
    vi.runAllTimers();
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Dialog returns focus to trigger on close", () => {
    const onClose = vi.fn();
    const { getByText, rerender } = render(
      <>
        <button>Trigger</button>
        <Dialog open={false} onClose={onClose} title="Test">
          Content
        </Dialog>
      </>
    );

    const trigger = getByText("Trigger");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Open dialog — focus-return effect captures trigger; focus-trap moves focus inside
    act(() => {
      rerender(
        <>
          <button>Trigger</button>
          <Dialog open={true} onClose={onClose} title="Test">
            Content
          </Dialog>
        </>
      );
    });

    // Close dialog — focus-return effect schedules rAF to restore focus
    act(() => {
      rerender(
        <>
          <button>Trigger</button>
          <Dialog open={false} onClose={onClose} title="Test">
            Content
          </Dialog>
        </>
      );
    });

    // Flush rAF (backed by fake setTimeout in jsdom)
    act(() => {
      flushRaf();
    });

    expect(document.activeElement).toBe(trigger);
  });

  it("Drawer returns focus to trigger on close", () => {
    const onClose = vi.fn();
    const { getByText, rerender } = render(
      <>
        <button>Open Drawer</button>
        <Drawer open={false} onClose={onClose} title="Test Drawer">
          <p>Drawer content</p>
        </Drawer>
      </>
    );

    const trigger = getByText("Open Drawer");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Open drawer — focus-return effect captures trigger; focus-trap moves focus inside
    act(() => {
      rerender(
        <>
          <button>Open Drawer</button>
          <Drawer open={true} onClose={onClose} title="Test Drawer">
            <p>Drawer content</p>
          </Drawer>
        </>
      );
    });

    // Close drawer — focus-return effect schedules rAF to restore focus
    act(() => {
      rerender(
        <>
          <button>Open Drawer</button>
          <Drawer open={false} onClose={onClose} title="Test Drawer">
            <p>Drawer content</p>
          </Drawer>
        </>
      );
    });

    // Flush rAF
    act(() => {
      flushRaf();
    });

    expect(document.activeElement).toBe(trigger);
  });

  it("CommandPalette returns focus to trigger on close", () => {
    const onOpenChange = vi.fn();
    const { getByText, rerender } = render(
      <>
        <button>Open Palette</button>
        <CommandPalette
          open={false}
          onOpenChange={onOpenChange}
          items={[{ id: "a", label: "Action A", onSelect: noop }]}
        />
      </>
    );

    const trigger = getByText("Open Palette");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Open palette — focus-return effect captures trigger; input focus rAF fires
    act(() => {
      rerender(
        <>
          <button>Open Palette</button>
          <CommandPalette
            open={true}
            onOpenChange={onOpenChange}
            items={[{ id: "a", label: "Action A", onSelect: noop }]}
          />
        </>
      );
      // Flush rAF that focuses the input on open
      vi.runAllTimers();
    });

    // Close palette — focus-return effect schedules rAF to restore focus
    act(() => {
      rerender(
        <>
          <button>Open Palette</button>
          <CommandPalette
            open={false}
            onOpenChange={onOpenChange}
            items={[{ id: "a", label: "Action A", onSelect: noop }]}
          />
        </>
      );
    });

    // Flush rAF
    act(() => {
      flushRaf();
    });

    expect(document.activeElement).toBe(trigger);
  });
});

/**
 * Accessibility tests for Rialto components using axe-core.
 * Each test verifies the component has no WCAG 2.1 AA violations.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';

/* ── Components ─────────────────────────────── */
import { Accordion } from './Accordion/Accordion';
import { Alert } from './Alert/Alert';
import { Avatar } from './Avatar/Avatar';
import { Badge } from './Badge/Badge';
import { Banner } from './Banner/Banner';
import { Breadcrumb } from './Breadcrumb/Breadcrumb';
import { Button } from './Button/Button';
import { Card } from './Card/Card';
import { Checkbox } from './Checkbox/Checkbox';
import { Collapsible } from './Collapsible/Collapsible';
import { DataList } from './DataList/DataList';
import { Dialog } from './Dialog/Dialog';
import { Divider } from './Divider/Divider';
import { EmptyState } from './EmptyState/EmptyState';
import { Input } from './Input/Input';
import { Kbd } from './Kbd/Kbd';
import { Meter } from './Meter/Meter';
import { Navbar } from './Navbar/Navbar';
import { NavigationMenu } from './NavigationMenu/NavigationMenu';
import { NumberInput } from './NumberInput/NumberInput';
import { Pagination } from './Pagination/Pagination';
import { PinInput } from './PinInput/PinInput';
import { Progress, Spinner } from './Progress/Progress';
import { SegmentedControl } from './SegmentedControl/SegmentedControl';
import { Select } from './Select/Select';
import { Sidebar } from './Sidebar/Sidebar';
import { Slider } from './Slider/Slider';
import { Stack } from './Stack/Stack';
import { Stat } from './Stat/Stat';
import { Steps } from './Steps/Steps';
import { Table } from './Table/Table';
import { Tabs } from './Tabs/Tabs';
import { Tag } from './Tag/Tag';
import { Text } from './Text/Text';
import { TextArea } from './TextArea/TextArea';
import { Timeline } from './Timeline/Timeline';
import { ToastProvider } from './Toast/Toast';

import { Toggle } from './Toggle/Toggle';
import { Tree } from './Tree/Tree';

/* ── Helpers ─────────────────────────────────── */
const noop = () => {};

/* ── Accessibility Tests ─────────────────────── */
describe('Accessibility — axe-core WCAG 2.1 AA', () => {
  it('Accordion', async () => {
    const { container } = render(
      <Accordion
        items={[
          { id: '1', title: 'Section 1', content: 'Content 1' },
          { id: '2', title: 'Section 2', content: 'Content 2' },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Alert', async () => {
    const { container } = render(<Alert>Something happened</Alert>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Avatar', async () => {
    const { container } = render(<Avatar name="Ada Lovelace" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Badge', async () => {
    const { container } = render(<Badge>New</Badge>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Banner', async () => {
    const { container } = render(<Banner>System update available</Banner>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Breadcrumb', async () => {
    const { container } = render(
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Products', href: '/products' },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Button', async () => {
    const { container } = render(<Button>Click me</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Button (disabled)', async () => {
    const { container } = render(<Button disabled>Save</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Input (disabled with reason)', async () => {
    const { container } = render(
      <Input label="Email" disabled disabledReason="Account locked" />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Toggle (disabled with reason)', async () => {
    const { container } = render(
      <Toggle
        label="Notifications"
        disabled
        disabledReason="Feature unavailable"
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Card', async () => {
    const { container } = render(<Card title="Title">Card content</Card>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Card with tilt has no violations', async () => {
    const { container } = render(
      <Card tilt title="Tilt Card">
        <p>Content</p>
      </Card>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Checkbox', async () => {
    const { container } = render(<Checkbox label="Accept terms" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Collapsible', async () => {
    const { container } = render(
      <Collapsible trigger="Details">Hidden content</Collapsible>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('DataList', async () => {
    const { container } = render(
      <DataList
        items={[
          { label: 'Name', value: 'Rialto' },
          { label: 'Version', value: '0.1.0' },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Dialog (open)', async () => {
    const { container } = render(
      <Dialog open onClose={noop} title="Test Dialog">
        <p>Dialog content</p>
      </Dialog>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Divider', async () => {
    const { container } = render(<Divider />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('EmptyState', async () => {
    const { container } = render(<EmptyState heading="No results" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Input', async () => {
    const { container } = render(<Input label="Email" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Kbd', async () => {
    const { container } = render(<Kbd>⌘K</Kbd>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Meter', async () => {
    const { container } = render(<Meter value={60} label="Usage" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Navbar', async () => {
    const { container } = render(
      <Navbar links={[{ id: 'home', label: 'Home', href: '/' }]} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('NavigationMenu', async () => {
    const { container } = render(
      <NavigationMenu items={[{ label: 'Docs', href: '/docs' }]} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('NumberInput', async () => {
    const { container } = render(
      <NumberInput label="Quantity" value={1} onChange={noop} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Pagination', async () => {
    const { container } = render(
      <Pagination page={1} totalPages={5} onChange={noop} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PinInput', async () => {
    const { container } = render(<PinInput label="Code" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Progress', async () => {
    const { container } = render(<Progress value={50} aria-label="Loading" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Spinner', async () => {
    const { container } = render(<Spinner label="Loading" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('SegmentedControl', async () => {
    const { container } = render(
      <SegmentedControl
        segments={[
          { id: 'a', label: 'Alpha' },
          { id: 'b', label: 'Beta' },
        ]}
        value="a"
        onChange={noop}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Select', async () => {
    const { container } = render(
      <Select
        label="Color"
        options={[
          { value: 'red', label: 'Red' },
          { value: 'blue', label: 'Blue' },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Sidebar', async () => {
    const { container } = render(
      <Sidebar items={[{ id: 'home', label: 'Home', icon: <span>H</span> }]} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Slider', async () => {
    const { container } = render(
      <Slider
        min={0}
        max={100}
        value={50}
        onChange={noop}
        aria-label="Volume"
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Stack', async () => {
    const { container } = render(
      <Stack direction="column" gap="md">
        <div>A</div>
        <div>B</div>
      </Stack>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Stat', async () => {
    const { container } = render(<Stat value="1,234" label="Users" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Steps', async () => {
    const { container } = render(
      <Steps
        steps={[{ label: 'Step 1' }, { label: 'Step 2' }, { label: 'Step 3' }]}
        currentStep={0}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Table', async () => {
    const { container } = render(
      <Table
        columns={[
          { key: 'name', header: 'Name' },
          { key: 'role', header: 'Role' },
        ]}
        data={[{ name: 'Alice', role: 'Admin' }]}
        rowKey={(r) => r.name}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Tabs', async () => {
    const { container } = render(
      <Tabs
        tabs={[
          { id: 'a', label: 'Tab A', content: <p>Content A</p> },
          { id: 'b', label: 'Tab B', content: <p>Content B</p> },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Tag', async () => {
    const { container } = render(<Tag>Label</Tag>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Text', async () => {
    const { container } = render(<Text>Hello world</Text>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('TextArea', async () => {
    const { container } = render(<TextArea label="Message" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Timeline', async () => {
    const { container } = render(
      <Timeline
        events={[
          {
            title: 'Created',
            description: 'Project started',
            timestamp: '2025-01-01',
          },
          { title: 'Released', description: 'v1.0', timestamp: '2025-06-01' },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('ToastProvider', async () => {
    const { container } = render(
      <ToastProvider>
        <div>App</div>
      </ToastProvider>
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Toggle', async () => {
    const { container } = render(<Toggle label="Dark mode" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Tree', async () => {
    const { container } = render(
      <Tree
        data={[
          {
            id: 'root',
            label: 'Root',
            children: [{ id: 'child', label: 'Child' }],
          },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

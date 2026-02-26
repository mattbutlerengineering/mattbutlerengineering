/**
 * Visual Test Harness
 *
 * Renders core components in all meaningful states for Playwright screenshot tests.
 * Each section has a data-testid for targeted screenshots.
 * This page is only used in dev/test — not included in production builds.
 */

import {
  Accordion,
  Alert,
  Avatar,
  AvatarGroup,
  Badge,
  Banner,
  Breadcrumb,
  Button,
  Card,
  Checkbox,
  DataList,
  Dialog,
  Divider,
  Drawer,
  EmptyState,
  Input,
  Meter,
  NumberInput,
  Pagination,
  Progress,
  SegmentedControl,
  Select,
  Skeleton,
  SkeletonGroup,
  Slider,
  Stat,
  Steps,
  Table,
  Tabs,
  Tag,
  Text,
  TextArea,
  Toggle,
  Tooltip,
} from "@mbe/rialto";
import styles from "./VisualTest.module.css";

/* ── Helpers ─────────────────────────────────── */

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.section} data-testid={id}>
      <div className={styles.sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

/* ── Sample data ─────────────────────────────── */

const selectOptions = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
];

const tableColumns = [
  { key: "name" as const, header: "Name", sortable: true },
  { key: "role" as const, header: "Role" },
  { key: "status" as const, header: "Status" },
];

const tableData = [
  { id: "1", name: "Alice", role: "Engineer", status: "Active" },
  { id: "2", name: "Bob", role: "Designer", status: "Away" },
  { id: "3", name: "Carol", role: "Manager", status: "Active" },
];

/* ── Component ───────────────────────────────── */

export function VisualTest() {
  return (
    <div className={styles.page}>
      <Text variant="display">Visual Test Harness</Text>
      <Text variant="caption" color="secondary">
        Stable rendering of core components for screenshot regression tests.
      </Text>
      <Divider spacing="spacious" />

      {/* ── Button ─────────────────────────── */}
      <Section id="button-variants" title="Button — Variants">
        <div className={styles.card}>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
      </Section>

      <Section id="button-sizes" title="Button — Sizes">
        <div className={styles.card}>
          <Button variant="primary" size="sm">
            Small
          </Button>
          <Button variant="primary" size="md">
            Medium
          </Button>
          <Button variant="primary" size="lg">
            Large
          </Button>
        </div>
      </Section>

      {/* ── Input ──────────────────────────── */}
      <Section id="input-states" title="Input — States">
        <div className={styles.cardColumn}>
          <Input label="Default" placeholder="Placeholder text" />
          <Input label="With value" defaultValue="Hello world" />
          <Input label="With hint" hint="This is a hint" />
          <Input label="Error" error />
          <Input label="Disabled" disabled defaultValue="Disabled" />
        </div>
      </Section>

      {/* ── TextArea ─────────────────────────── */}
      <Section id="textarea-states" title="TextArea — States">
        <div className={styles.cardColumn}>
          <TextArea label="Default" placeholder="Enter description..." />
          <TextArea label="With value" defaultValue="Some text content here." />
          <TextArea label="With hint" hint="Maximum 500 characters" />
          <TextArea label="Error" error />
          <TextArea label="Disabled" disabled defaultValue="Disabled" />
        </div>
      </Section>

      {/* ── NumberInput ──────────────────────── */}
      <Section id="numberinput-states" title="NumberInput — States">
        <div className={styles.cardColumn}>
          <NumberInput label="Quantity" value={5} onChange={() => {}} min={0} max={99} />
          <NumberInput label="Disabled" value={10} onChange={() => {}} disabled />
        </div>
      </Section>

      {/* ── Select ─────────────────────────── */}
      <Section id="select-states" title="Select — States">
        <div className={styles.cardColumn}>
          <Select label="Default" placeholder="Choose a fruit" options={selectOptions} />
          <Select label="Disabled" options={selectOptions} disabled />
        </div>
      </Section>

      {/* ── Toggle ─────────────────────────── */}
      <Section id="toggle-states" title="Toggle — States">
        <div className={styles.card}>
          <Toggle label="Off" />
          <Toggle label="On" defaultChecked />
          <Toggle label="Disabled" disabled />
          <Toggle label="Disabled on" disabled defaultChecked />
        </div>
      </Section>

      {/* ── Checkbox ───────────────────────── */}
      <Section id="checkbox-states" title="Checkbox — States">
        <div className={styles.card}>
          <Checkbox label="Unchecked" />
          <Checkbox label="Checked" checked />
          <Checkbox label="Indeterminate" indeterminate />
          <Checkbox label="Disabled" disabled />
        </div>
      </Section>

      {/* ── SegmentedControl ─────────────────── */}
      <Section id="segmentedcontrol-default" title="SegmentedControl">
        <div className={styles.card}>
          <SegmentedControl
            segments={[
              { id: "day", label: "Day" },
              { id: "week", label: "Week" },
              { id: "month", label: "Month" },
            ]}
            value="week"
            onChange={() => {}}
          />
        </div>
      </Section>

      {/* ── Slider ─────────────────────────── */}
      <Section id="slider-states" title="Slider — States">
        <div className={styles.cardColumn}>
          <Slider min={0} max={100} defaultValue={40} />
          <Slider min={0} max={100} defaultValue={60} disabled />
        </div>
      </Section>

      {/* ── Tabs ───────────────────────────── */}
      <Section id="tabs-default" title="Tabs">
        <div className={styles.card}>
          <Tabs
            tabs={[
              {
                id: "tab1",
                label: "Overview",
                content: <Text>Overview content</Text>,
              },
              {
                id: "tab2",
                label: "Details",
                content: <Text>Details content</Text>,
              },
              {
                id: "tab3",
                label: "Settings",
                content: <Text>Settings content</Text>,
              },
            ]}
          />
        </div>
      </Section>

      {/* ── Accordion ────────────────────────── */}
      <Section id="accordion-default" title="Accordion">
        <div className={styles.cardColumn}>
          <Accordion
            items={[
              {
                id: "a",
                title: "Section A",
                content: <Text>Content for section A.</Text>,
              },
              {
                id: "b",
                title: "Section B",
                content: <Text>Content for section B.</Text>,
              },
              {
                id: "c",
                title: "Section C (Disabled)",
                content: <Text>Hidden.</Text>,
                disabled: true,
              },
            ]}
            defaultOpen={["a"]}
          />
        </div>
      </Section>

      {/* ── Card ───────────────────────────── */}
      <Section id="card-variants" title="Card — Variants">
        <div className={styles.card}>
          <Card title="Card Title" subtitle="With subtitle">
            <Text>Card body content goes here.</Text>
          </Card>
          <Card>
            <Text>Plain card without title.</Text>
          </Card>
        </div>
      </Section>

      {/* ── Alert ──────────────────────────── */}
      <Section id="alert-variants" title="Alert — Variants">
        <div className={styles.cardColumn}>
          <Alert variant="info">Informational message.</Alert>
          <Alert variant="success">Operation completed successfully.</Alert>
          <Alert variant="warning">Please review before proceeding.</Alert>
          <Alert variant="error">Something went wrong.</Alert>
        </div>
      </Section>

      {/* ── Banner ─────────────────────────── */}
      <Section id="banner-variants" title="Banner — Variants">
        <div className={styles.cardColumn}>
          <Banner variant="info">System maintenance scheduled for tonight.</Banner>
          <Banner variant="warning">Your trial expires in 3 days.</Banner>
          <Banner variant="error">Payment method declined.</Banner>
          <Banner variant="accent">New feature available!</Banner>
        </div>
      </Section>

      {/* ── Badge ──────────────────────────── */}
      <Section id="badge-variants" title="Badge — Variants">
        <div className={styles.card}>
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="accent">Accent</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="error">Error</Badge>
        </div>
      </Section>

      {/* ── Tag ────────────────────────────── */}
      <Section id="tag-variants" title="Tag — Variants">
        <div className={styles.card}>
          <Tag>Default</Tag>
          <Tag variant="accent">Accent</Tag>
          <Tag variant="success">Success</Tag>
          <Tag variant="error">Error</Tag>
          <Tag variant="accent" selected>
            Selected
          </Tag>
          <Tag dismissible onDismiss={() => {}}>
            Dismissible
          </Tag>
        </div>
      </Section>

      {/* ── Avatar ─────────────────────────── */}
      <Section id="avatar-variants" title="Avatar — Sizes & Status">
        <div className={styles.card}>
          <Avatar name="Alice Smith" size="sm" />
          <Avatar name="Bob Jones" size="md" status="online" />
          <Avatar name="Carol Wu" size="lg" status="busy" />
          <Avatar name="David Kim" size="xl" status="away" />
        </div>
      </Section>

      <Section id="avatargroup-default" title="AvatarGroup">
        <div className={styles.card}>
          <AvatarGroup
            avatars={[
              { name: "Alice" },
              { name: "Bob" },
              { name: "Carol" },
              { name: "David" },
              { name: "Eve" },
            ]}
            max={3}
          />
        </div>
      </Section>

      {/* ── Table ──────────────────────────── */}
      <Section id="table-default" title="Table — With Data">
        <div className={styles.cardColumn}>
          <Table columns={tableColumns} data={tableData} rowKey={(r) => r.id} striped />
        </div>
      </Section>

      <Section id="table-empty" title="Table — Empty">
        <div className={styles.cardColumn}>
          <Table
            columns={tableColumns}
            data={[]}
            rowKey={(r: { id: string }) => r.id}
            emptyMessage="No records found"
          />
        </div>
      </Section>

      {/* ── DataList ─────────────────────────── */}
      <Section id="datalist-default" title="DataList">
        <div className={styles.cardColumn}>
          <DataList
            items={[
              { label: "Name", value: "Max Verstappen" },
              { label: "Team", value: "Red Bull Racing" },
              { label: "Number", value: "1" },
              { label: "Nationality", value: "Dutch" },
            ]}
            striped
          />
        </div>
      </Section>

      {/* ── Progress ───────────────────────── */}
      <Section id="progress-states" title="Progress — States">
        <div className={styles.cardColumn}>
          <Progress value={65} />
          <Progress />
        </div>
      </Section>

      {/* ── Meter ──────────────────────────── */}
      <Section id="meter-variants" title="Meter — Variants">
        <div className={styles.cardColumn}>
          <Meter label="Storage" value={72} showValue />
          <Meter label="CPU" value={45} variant="accent" showValue />
          <Meter label="Health" value={90} variant="success" showValue />
          <Meter label="Errors" value={15} variant="error" showValue />
        </div>
      </Section>

      {/* ── Skeleton ─────────────────────────── */}
      <Section id="skeleton-variants" title="Skeleton — Variants">
        <div className={styles.cardColumn}>
          <SkeletonGroup>
            <Skeleton variant="circle" width={48} height={48} />
            <Skeleton variant="heading" width="60%" />
            <Skeleton variant="text" lines={3} width="100%" />
          </SkeletonGroup>
        </div>
      </Section>

      {/* ── Steps ──────────────────────────── */}
      <Section id="steps-default" title="Steps">
        <div className={styles.cardColumn}>
          <Steps
            steps={[
              { label: "Cart", description: "Review items" },
              { label: "Shipping", description: "Enter address" },
              { label: "Payment", description: "Add billing" },
              { label: "Confirm", description: "Place order" },
            ]}
            currentStep={1}
          />
        </div>
      </Section>

      {/* ── Breadcrumb ─────────────────────── */}
      <Section id="breadcrumb-default" title="Breadcrumb">
        <div className={styles.card}>
          <Breadcrumb
            items={[
              { label: "Home", href: "#" },
              { label: "Products", href: "#" },
              { label: "Electronics", href: "#" },
              { label: "Headphones" },
            ]}
          />
        </div>
      </Section>

      {/* ── EmptyState ─────────────────────── */}
      <Section id="emptystate-default" title="EmptyState">
        <div className={styles.card}>
          <EmptyState
            icon="search"
            title="No results found"
            description="Try adjusting your search or filters."
          />
        </div>
      </Section>

      {/* ── Stat ───────────────────────────── */}
      <Section id="stat-variants" title="Stat — Trends">
        <div className={styles.card}>
          <Stat label="Revenue" value="$12,400" delta="+8.2%" trend="up" />
          <Stat label="Churn" value="2.4%" delta="-0.3%" trend="down" />
          <Stat label="Users" value="1,024" delta="0%" trend="neutral" />
        </div>
      </Section>

      {/* ── Tooltip ────────────────────────── */}
      <Section id="tooltip-default" title="Tooltip">
        <div className={styles.card}>
          <Tooltip content="Helpful tooltip text">
            <Button variant="secondary">Hover me</Button>
          </Tooltip>
        </div>
      </Section>

      {/* ── Pagination ─────────────────────── */}
      <Section id="pagination-default" title="Pagination">
        <div className={styles.card}>
          <Pagination page={3} totalPages={10} onChange={() => {}} />
        </div>
      </Section>

      {/* ── Dialog ─────────────────────────── */}
      <Section id="dialog-open" title="Dialog — Open">
        <div className={styles.cardColumn} style={{ position: "relative", minHeight: 200 }}>
          <Dialog
            open
            onClose={() => {}}
            title="Confirm Action"
            description="Are you sure you want to proceed?"
          >
            <Text>This action cannot be undone.</Text>
          </Dialog>
        </div>
      </Section>

      {/* ── Drawer ─────────────────────────── */}
      <Section id="drawer-open" title="Drawer — Open">
        <div className={styles.cardColumn} style={{ position: "relative", minHeight: 200 }}>
          <Drawer open onClose={() => {}} title="Settings" description="Manage your preferences">
            <Text>Drawer content goes here.</Text>
          </Drawer>
        </div>
      </Section>

      {/* ── Dark Mode Section ──────────────── */}
      <Divider label="Dark Mode" spacing="spacious" />

      <div data-theme="dark" data-testid="dark-mode-section">
        <div
          className={styles.page}
          style={{
            background: "#1a1918",
            borderRadius: "var(--rialto-radius-soft)",
          }}
        >
          <Section id="dark-buttons" title="Dark — Buttons">
            <div className={styles.card}>
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
            </div>
          </Section>

          <Section id="dark-inputs" title="Dark — Inputs">
            <div className={styles.cardColumn}>
              <Input label="Default" placeholder="Placeholder" />
              <Input label="Error" error />
            </div>
          </Section>

          <Section id="dark-alerts" title="Dark — Alerts">
            <div className={styles.cardColumn}>
              <Alert variant="info">Info in dark mode.</Alert>
              <Alert variant="success">Success in dark mode.</Alert>
              <Alert variant="warning">Warning in dark mode.</Alert>
              <Alert variant="error">Error in dark mode.</Alert>
            </div>
          </Section>

          <Section id="dark-toggles" title="Dark — Toggles & Checkboxes">
            <div className={styles.card}>
              <Toggle label="Off" />
              <Toggle label="On" defaultChecked />
              <Checkbox label="Unchecked" />
              <Checkbox label="Checked" checked />
            </div>
          </Section>

          <Section id="dark-badges" title="Dark — Badges">
            <div className={styles.card}>
              <Badge variant="neutral">Neutral</Badge>
              <Badge variant="accent">Accent</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="error">Error</Badge>
            </div>
          </Section>

          <Section id="dark-cards" title="Dark — Card">
            <div className={styles.card}>
              <Card title="Dark Card">
                <Text>Content in dark mode.</Text>
              </Card>
            </div>
          </Section>

          <Section id="dark-banner" title="Dark — Banner">
            <div className={styles.cardColumn}>
              <Banner variant="info">Info banner in dark mode.</Banner>
              <Banner variant="warning">Warning banner in dark mode.</Banner>
            </div>
          </Section>

          <Section id="dark-avatar" title="Dark — Avatar">
            <div className={styles.card}>
              <Avatar name="Alice" size="md" status="online" />
              <Avatar name="Bob" size="md" status="busy" />
              <Avatar name="Carol" size="md" />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

VisualTest.displayName = "VisualTest";

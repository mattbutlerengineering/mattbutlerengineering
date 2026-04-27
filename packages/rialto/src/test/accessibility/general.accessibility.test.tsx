import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";

/* ── Components ─────────────────────────────── */
import { Accordion } from "../../components/Accordion/Accordion";
import { Alert } from "../../components/Alert/Alert";
import { AspectRatio } from "../../components/AspectRatio/AspectRatio";
import { Avatar } from "../../components/Avatar/Avatar";
import { Badge } from "../../components/Badge/Badge";
import { Banner } from "../../components/Banner/Banner";
import { Breadcrumb } from "../../components/Breadcrumb/Breadcrumb";
import { Button } from "../../components/Button/Button";
import { Card } from "../../components/Card/Card";
import { Checkbox } from "../../components/Checkbox/Checkbox";
import { Collapsible } from "../../components/Collapsible/Collapsible";
import { Divider } from "../../components/Divider/Divider";
import { EmptyState } from "../../components/EmptyState/EmptyState";
import { Heading } from "../../components/Heading/Heading";
import { Hero } from "../../components/Hero/Hero";
import { Kbd } from "../../components/Kbd/Kbd";
import { Meter } from "../../components/Meter/Meter";
import { Progress, Spinner } from "../../components/Progress/Progress";
import { ScrollArea } from "../../components/ScrollArea/ScrollArea";
import { SegmentedControl } from "../../components/SegmentedControl/SegmentedControl";
import { Skeleton } from "../../components/Skeleton/Skeleton";
import { Stack } from "../../components/Stack/Stack";
import { Stat } from "../../components/Stat/Stat";
import { Tabs } from "../../components/Tabs/Tabs";
import { Tag } from "../../components/Tag/Tag";
import { Text } from "../../components/Text/Text";
import { Timeline } from "../../components/Timeline/Timeline";

describe("Accessibility — General Components", () => {
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

  it("AspectRatio", async () => {
    const { container } = render(
      <AspectRatio ratio={16 / 9}>
        <div>Content</div>
      </AspectRatio>
    );
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

  it("Card", async () => {
    const { container } = render(<Card title="Title">Card content</Card>);
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

  it("Divider", async () => {
    const { container } = render(<Divider />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("EmptyState", async () => {
    const { container } = render(
      <EmptyState heading="No results" />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Heading", async () => {
    const { container } = render(<Heading>Title</Heading>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Hero", async () => {
    const { container } = render(<Hero title="Hero Title" subtitle="Subtitle content" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Kbd", async () => {
    const { container } = render(<Kbd>Cmd</Kbd>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Meter", async () => {
    const { container } = render(<Meter label="Storage" value={70} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Progress", async () => {
    const { container } = render(<Progress value={45} aria-label="Loading" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Spinner", async () => {
    const { container } = render(<Spinner label="Loading" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("ScrollArea", async () => {
    const { container } = render(
      <ScrollArea maxHeight={200}>
        <p>Scrollable content</p>
      </ScrollArea>
    );
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
        onChange={() => {}}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Skeleton", async () => {
    const { container } = render(<Skeleton height={20} width="100%" />);
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
    const { container } = render(<Stat label="Revenue" value="$45,000" />);
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
    const { container } = render(<Tag>Beta</Tag>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Text", async () => {
    const { container } = render(<Text>Some text content</Text>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("Timeline", async () => {
    const { container } = render(
      <Timeline
        events={[
          { title: "Created", timestamp: "2024-01-01" },
          { title: "Updated", timestamp: "2024-01-02" },
        ]}
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

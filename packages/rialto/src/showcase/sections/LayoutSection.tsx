import { Card } from "../../components/Card/Card";
import { Stack } from "../../components/Stack/Stack";
import { Divider } from "../../components/Divider/Divider";
import { AspectRatio } from "../../components/AspectRatio/AspectRatio";
import { ScrollArea } from "../../components/ScrollArea/ScrollArea";
import { Collapsible } from "../../components/Collapsible/Collapsible";
import { SegmentedControl } from "../../components/SegmentedControl/SegmentedControl";
import { Text } from "../../components/Text/Text";
import { Button } from "../../components/Button/Button";
import css from "../showcase.module.css";

export function LayoutSection() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--rialto-space-xl)" }}>
      {/* Card */}
      <div>
        <Text
          variant="caption"
          color="secondary"
          style={{ marginBlockEnd: "var(--rialto-space-xs)" }}
        >
          Card
        </Text>
        <div className={css.gridLayout}>
          <Card>
            <Text variant="label">Basic Card</Text>
            <Text variant="caption" color="secondary">
              A simple elevated container.
            </Text>
          </Card>
          <Card>
            <Text variant="label">With Actions</Text>
            <Text variant="caption" color="secondary">
              Cards can contain any content.
            </Text>
            <div style={{ marginBlockStart: "var(--rialto-space-sm)" }}>
              <Button variant="primary" size="sm">
                Action
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Stack */}
      <div>
        <Text
          variant="caption"
          color="secondary"
          style={{ marginBlockEnd: "var(--rialto-space-xs)" }}
        >
          Stack (horizontal)
        </Text>
        <Stack direction="row" gap="md" align="center">
          <div
            style={{
              width: 60,
              height: 60,
              background: "var(--rialto-accent-muted)",
              borderRadius: "var(--rialto-radius-default)",
            }}
          />
          <div
            style={{
              width: 60,
              height: 40,
              background: "var(--rialto-accent-muted)",
              borderRadius: "var(--rialto-radius-default)",
            }}
          />
          <div
            style={{
              width: 60,
              height: 80,
              background: "var(--rialto-accent-muted)",
              borderRadius: "var(--rialto-radius-default)",
            }}
          />
        </Stack>
      </div>

      {/* Divider */}
      <div>
        <Text
          variant="caption"
          color="secondary"
          style={{ marginBlockEnd: "var(--rialto-space-xs)" }}
        >
          Divider
        </Text>
        <div style={{ maxWidth: 400 }}>
          <Text variant="body">Content above</Text>
          <Divider />
          <Text variant="body">Content below</Text>
        </div>
      </div>

      {/* AspectRatio */}
      <div>
        <Text
          variant="caption"
          color="secondary"
          style={{ marginBlockEnd: "var(--rialto-space-xs)" }}
        >
          Aspect Ratio (16:9)
        </Text>
        <div style={{ maxWidth: 320 }}>
          <AspectRatio ratio={16 / 9}>
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "var(--rialto-surface-recessed)",
                borderRadius: "var(--rialto-radius-soft)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text variant="caption" color="tertiary">
                16:9 container
              </Text>
            </div>
          </AspectRatio>
        </div>
      </div>

      {/* ScrollArea */}
      <div>
        <Text
          variant="caption"
          color="secondary"
          style={{ marginBlockEnd: "var(--rialto-space-xs)" }}
        >
          Scroll Area
        </Text>
        <ScrollArea
          style={{
            height: 150,
            maxWidth: 300,
            border: "1px solid var(--rialto-border)",
            borderRadius: "var(--rialto-radius-default)",
          }}
        >
          <div style={{ padding: "var(--rialto-space-sm)" }}>
            {Array.from({ length: 20 }, (_, i) => (
              <Text key={i} variant="body" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
                Scrollable item {i + 1}
              </Text>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Collapsible */}
      <div>
        <Text
          variant="caption"
          color="secondary"
          style={{ marginBlockEnd: "var(--rialto-space-xs)" }}
        >
          Collapsible
        </Text>
        <div style={{ maxWidth: 400 }}>
          <Collapsible title="Click to expand">
            <Text variant="body">This content is hidden by default and revealed on click.</Text>
          </Collapsible>
        </div>
      </div>

      {/* SegmentedControl */}
      <div>
        <Text
          variant="caption"
          color="secondary"
          style={{ marginBlockEnd: "var(--rialto-space-xs)" }}
        >
          Segmented Control
        </Text>
        <SegmentedControl
          options={[
            { label: "Day", value: "day" },
            { label: "Week", value: "week" },
            { label: "Month", value: "month" },
          ]}
          value="week"
          onValueChange={() => {}}
        />
      </div>
    </div>
  );
}

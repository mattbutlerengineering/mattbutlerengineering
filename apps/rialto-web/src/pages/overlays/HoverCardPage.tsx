import { Avatar, Badge, Button, DataList, HoverCard, Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function HoverCardPage() {
  return (
    <ComponentPageLayout
      name="Hover Card"
      description="Hover-triggered rich preview — a hybrid of Tooltip's hover mechanics and Popover's glass panel. The close delay lets your mouse travel from trigger into the panel without it vanishing. For user profiles, link previews, data point details."
    >
      {/* ── User Profile Card ─────────────────────────────────────── */}
      <Section title="User Profile">
        <div className={styles.row} style={{ flexWrap: "wrap" }}>
          <HoverCard
            content={
              <div
                style={{
                  display: "flex",
                  gap: "var(--rialto-space-sm)",
                  alignItems: "flex-start",
                }}
              >
                <Avatar name="Charles Leclerc" size="lg" status="online" />
                <div>
                  <Text
                    style={{
                      fontSize: "var(--rialto-text-sm)",
                      fontWeight: "var(--rialto-weight-medium)",
                      color: "var(--rialto-text-primary)",
                      margin: 0,
                    }}
                  >
                    Charles Leclerc
                  </Text>
                  <Text
                    style={{
                      fontSize: "var(--rialto-text-xs)",
                      color: "var(--rialto-text-tertiary)",
                      margin: "2px 0 var(--rialto-space-xs)",
                    }}
                  >
                    Lead Driver &middot; Racing Team
                  </Text>
                  <div style={{ display: "flex", gap: "var(--rialto-space-sm)" }}>
                    <Badge variant="success" dot>
                      Active
                    </Badge>
                    <Badge variant="accent">P1</Badge>
                  </div>
                </div>
              </div>
            }
          >
            <Text
              style={{
                fontSize: "var(--rialto-text-sm)",
                color: "var(--rialto-accent)",
                cursor: "pointer",
                borderBottom: "1px dashed var(--rialto-accent-muted)",
                paddingBottom: 1,
              }}
            >
              Charles Leclerc
            </Text>
          </HoverCard>

          <HoverCard
            placement="top"
            content={
              <div
                style={{
                  display: "flex",
                  gap: "var(--rialto-space-sm)",
                  alignItems: "flex-start",
                }}
              >
                <Avatar name="Marc Newson" size="lg" status="away" />
                <div>
                  <Text
                    style={{
                      fontSize: "var(--rialto-text-sm)",
                      fontWeight: "var(--rialto-weight-medium)",
                      color: "var(--rialto-text-primary)",
                      margin: 0,
                    }}
                  >
                    Marc Newson
                  </Text>
                  <Text
                    style={{
                      fontSize: "var(--rialto-text-xs)",
                      color: "var(--rialto-text-tertiary)",
                      margin: "2px 0 var(--rialto-space-xs)",
                    }}
                  >
                    Industrial Designer
                  </Text>
                  <Badge variant="neutral" dot>
                    Away
                  </Badge>
                </div>
              </div>
            }
          >
            <Button variant="ghost" size="sm">
              Top placement
            </Button>
          </HoverCard>
        </div>
      </Section>

      {/* ── Data Preview ──────────────────────────────────────────── */}
      <Section title="Data Preview">
        <div className={styles.row}>
          <HoverCard
            content={
              <div>
                <Text
                  style={{
                    fontSize: "var(--rialto-text-xs)",
                    fontWeight: "var(--rialto-weight-medium)",
                    color: "var(--rialto-text-primary)",
                    margin: "0 0 var(--rialto-space-xs)",
                  }}
                >
                  Lap 14 — Sector Breakdown
                </Text>
                <div
                  style={{
                    display: "flex",
                    gap: "var(--rialto-space-md)",
                    fontSize: "var(--rialto-text-xs)",
                  }}
                >
                  {[
                    { label: "S1", value: "28.412", color: "var(--rialto-text-primary)" },
                    { label: "S2", value: "34.891", color: "var(--rialto-text-primary)" },
                    { label: "S3", value: "22.107", color: "var(--rialto-success)" },
                  ].map((sector) => (
                    <div key={sector.label}>
                      <Text style={{ color: "var(--rialto-text-tertiary)" }}>{sector.label}</Text>
                      <Text
                        style={{
                          margin: "2px 0 0",
                          fontFamily: "var(--rialto-font-mono)",
                          color: sector.color,
                        }}
                      >
                        {sector.value}
                      </Text>
                    </div>
                  ))}
                </div>
                <Text
                  style={{
                    margin: "var(--rialto-space-xs) 0 0",
                    fontFamily: "var(--rialto-font-mono)",
                    fontSize: "var(--rialto-text-sm)",
                    color: "var(--rialto-text-primary)",
                  }}
                >
                  1:25.410 <Text style={{ color: "var(--rialto-success)" }}>−0.342</Text>
                </Text>
              </div>
            }
          >
            <Text
              style={{
                fontSize: "var(--rialto-text-sm)",
                fontFamily: "var(--rialto-font-mono)",
                color: "var(--rialto-text-secondary)",
                cursor: "pointer",
                borderBottom: "1px dashed var(--rialto-border-strong)",
                paddingBottom: 1,
              }}
            >
              1:25.410
            </Text>
          </HoverCard>
        </div>
      </Section>

      {/* ── Open Delay ────────────────────────────────────────────── */}
      <Section title="Open Delay">
        <div className={styles.row}>
          <HoverCard
            openDelay={200}
            content={
              <Text
                style={{
                  margin: 0,
                  fontSize: "var(--rialto-text-sm)",
                  color: "var(--rialto-text-secondary)",
                }}
              >
                Eager preview — 200ms open delay instead of the default 400ms.
              </Text>
            }
          >
            <Button variant="secondary" size="sm">
              Short delay (200ms)
            </Button>
          </HoverCard>
          <HoverCard
            openDelay={800}
            content={
              <Text
                style={{
                  margin: 0,
                  fontSize: "var(--rialto-text-sm)",
                  color: "var(--rialto-text-secondary)",
                }}
              >
                Deliberate preview — 800ms delay. Good for items users frequently pass over.
              </Text>
            }
          >
            <Button variant="secondary" size="sm">
              Long delay (800ms)
            </Button>
          </HoverCard>
        </div>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="HoverCard" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "Hover card content is in a dialog region" },
            { label: "Focus", value: "Not focused on open — hover mechanic only" },
            { label: "Keyboard", value: "Tab into the card to interact with its content" },
            { label: "Close delay", value: "Grace period prevents accidental dismissal" },
            {
              label: "Screen reader",
              value:
                "Content not announced on hover alone; announced only when focus moves into the card via keyboard; uses role=dialog when interactive",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

HoverCardPage.displayName = "HoverCardPage";

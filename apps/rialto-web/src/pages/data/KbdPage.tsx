import { DataList, Kbd, Shortcut, Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function KbdPage() {
  return (
    <ComponentPageLayout
      name="Kbd"
      description="Machined aluminum key caps with physical depth — the thicker bottom border and inner highlight create the illusion of a raised key. Shortcut combos join keys with a separator."
    >
      {/* ── Individual Keys ───────────────────────────────────────── */}
      <Section title="Individual Keys">
        <div className={styles.row} style={{ flexWrap: "wrap" }}>
          <Kbd>⌘</Kbd>
          <Kbd>Shift</Kbd>
          <Kbd>K</Kbd>
          <Kbd>⏎</Kbd>
          <Kbd>Esc</Kbd>
          <Kbd>Tab</Kbd>
          <Kbd>Space</Kbd>
          <Kbd>⌫</Kbd>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          <Kbd>←</Kbd>
          <Kbd>→</Kbd>
        </div>
      </Section>

      {/* ── Shortcut Combos ───────────────────────────────────────── */}
      <Section title="Shortcut Combos">
        <div className={styles.row} style={{ flexWrap: "wrap" }}>
          <Shortcut keys={["⌘", "K"]} />
          <Shortcut keys={["⌘", "Shift", "P"]} />
          <Shortcut keys={["Ctrl", "C"]} />
          <Shortcut keys={["Alt", "F4"]} />
          <Shortcut keys={["⌘", "Z"]} />
          <Shortcut keys={["⌘", "⇧", "Z"]} />
        </div>
      </Section>

      {/* ── In Context ────────────────────────────────────────────── */}
      <Section title="In Context">
        <div className={styles.stack}>
          <Text variant="caption" color="secondary">
            Press <Shortcut keys={["⌘", "K"]} /> to open the command palette
          </Text>
          <Text variant="caption" color="secondary">
            Use <Shortcut keys={["⌘", "Z"]} /> to undo changes
          </Text>
          <Text variant="caption" color="secondary">
            Hold <Kbd>Shift</Kbd> and click to select a range
          </Text>
          <Text variant="caption" color="secondary">
            Press <Kbd>Esc</Kbd> to dismiss dialogs and overlays
          </Text>
        </div>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <div
          style={{
            padding: "var(--rialto-space-lg)",
            background: "var(--rialto-surface-elevated)",
            borderRadius: "var(--rialto-radius-soft)",
            border: "1px solid var(--rialto-border)",
          }}
        >
          <Text
            style={{
              fontSize: "var(--rialto-text-xs)",
              color: "var(--rialto-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "var(--rialto-tracking-wide)",
              marginBottom: "var(--rialto-space-md)",
            }}
          >
            Keyboard Shortcuts
          </Text>
          <div className={styles.stack}>
            {[
              { action: "Open command palette", keys: ["⌘", "K"] },
              { action: "Toggle dark mode", keys: ["⌘", "Shift", "D"] },
              { action: "Save configuration", keys: ["⌘", "S"] },
              { action: "Undo", keys: ["⌘", "Z"] },
              { action: "Close / dismiss", keys: ["Esc"] },
            ].map(({ action, keys }) => (
              <div
                key={action}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "var(--rialto-space-xs) 0",
                  borderBottom: "1px solid var(--rialto-border)",
                }}
              >
                <Text variant="caption" color="secondary">
                  {action}
                </Text>
                <Shortcut keys={keys} />
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Props Table (Kbd) ─────────────────────────────────────── */}
      <Section title="Kbd Props">
        <PropsTable component="Kbd" />
      </Section>

      {/* ── Props Table (Shortcut) ────────────────────────────────── */}
      <Section title="Shortcut Props">
        <PropsTable component="Shortcut" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "Native <kbd> element" },
            { label: "Semantics", value: "Screen readers announce keyboard keys as expected" },
            { label: "Shortcut", value: "Shortcut wraps keys in <span> with separator" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

KbdPage.displayName = "KbdPage";

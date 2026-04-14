import { Button, DataList, Dialog, Input, Select, Stack, Text } from "@mattbutlerengineering/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DialogPage() {
  const [basicOpen, setBasicOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [scrollOpen, setScrollOpen] = useState(false);

  return (
    <ComponentPageLayout
      name="Dialog"
      description="Glass surface with backdrop blur. Spring physics entrance from below. Warm overlay tint — never pure black."
    >
      {/* ── Basic ─────────────────────────────────────────────────── */}
      <Section title="Basic">
        <div className={styles.row}>
          <Button variant="secondary" onClick={() => setBasicOpen(true)}>
            Open Dialog
          </Button>
        </div>

        <Dialog
          open={basicOpen}
          onClose={() => setBasicOpen(false)}
          title="Confirm Configuration"
          description="This will apply the selected driving mode to all vehicle systems. The change takes effect immediately."
          footer={
            <>
              <Button variant="ghost" onClick={() => setBasicOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setBasicOpen(false)}>
                Confirm
              </Button>
            </>
          }
        />
      </Section>

      {/* ── With Form Content ─────────────────────────────────────── */}
      <Section title="With Form Content">
        <div className={styles.row}>
          <Button variant="secondary" onClick={() => setFormOpen(true)}>
            Session Settings
          </Button>
        </div>

        <Dialog
          open={formOpen}
          onClose={() => setFormOpen(false)}
          title="Session Settings"
          description="Configure the parameters for the current telemetry session."
          footer={
            <>
              <Button variant="ghost" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setFormOpen(false)}>
                Save
              </Button>
            </>
          }
        >
          <Stack gap="md">
            <Input label="Session Name" placeholder="FP1 — Fiorano" />
            <Select
              label="Tire Compound"
              placeholder="Select compound..."
              value=""
              onChange={() => {}}
              options={[
                { value: "soft", label: "Soft (C5)" },
                { value: "medium", label: "Medium (C3)" },
                { value: "hard", label: "Hard (C1)" },
              ]}
            />
          </Stack>
        </Dialog>
      </Section>

      {/* ── Scrollable Content ────────────────────────────────────── */}
      <Section title="Scrollable Content">
        <div className={styles.row}>
          <Button variant="secondary" onClick={() => setScrollOpen(true)}>
            Long Content Dialog
          </Button>
        </div>

        <Dialog
          open={scrollOpen}
          onClose={() => setScrollOpen(false)}
          title="Technical Regulations"
          footer={
            <>
              <Button variant="ghost" onClick={() => setScrollOpen(false)}>
                Dismiss
              </Button>
              <Button variant="primary" onClick={() => setScrollOpen(false)}>
                Acknowledge
              </Button>
            </>
          }
        >
          <Stack gap="sm">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i}>
                <Text variant="label" color="primary" style={{ marginBottom: "var(--rialto-space-xs)" }}>
                  Article {i + 1}
                </Text>
                <Text variant="body" color="secondary">
                  The competitor must ensure all telemetry systems comply with FIA regulations
                  regarding data transmission frequencies, channel configurations, and privacy
                  requirements. Maximum transmission rate is 100 Hz per channel.
                </Text>
              </div>
            ))}
          </Stack>
        </Dialog>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "open",
              type: "boolean",
              description: "Controls dialog visibility.",
            },
            {
              name: "onClose",
              type: "() => void",
              description: "Called when clicking outside or pressing Escape.",
            },
            {
              name: "title",
              type: "string",
              description: "Dialog heading.",
            },
            {
              name: "description",
              type: "string",
              description: "Optional supporting text below the title.",
            },
            {
              name: "children",
              type: "ReactNode",
              description: "Dialog body content.",
            },
            {
              name: "footer",
              type: "ReactNode",
              description: "Action buttons rendered at the bottom of the dialog.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=dialog with aria-modal=true" },
            { label: "Focus", value: "Focus trapped inside dialog while open" },
            { label: "Close", value: "Escape key and outside click close the dialog" },
            { label: "Label", value: "aria-labelledby points to the dialog title" },
            { label: "Return", value: "Focus returns to trigger element on close" },
            {
              label: "Screen reader",
              value:
                "VoiceOver reads dialog title then description on open; tab announces each focused element within the trap; closing announces nothing — focus silently returns to trigger",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

DialogPage.displayName = "DialogPage";

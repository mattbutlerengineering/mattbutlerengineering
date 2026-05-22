import { Button, ConfirmDialog, DataList, Stack, useToast } from "@mattbutlerengineering/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ConfirmDialogPage() {
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  return (
    <ComponentPageLayout
      name="Confirm Dialog"
      description="A focused wrapper around Dialog for confirm/cancel patterns. Default variant auto-focuses the confirm button; destructive auto-focuses cancel to prevent accidental clicks."
    >
      {/* ── Default Variant ───────────────────────────────────────── */}
      <Section title="Default">
        <div className={styles.row}>
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
            Confirm Configuration
          </Button>
        </div>

        <ConfirmDialog
          open={confirmOpen}
          onConfirm={() => {
            toast({ title: "Configuration applied", variant: "success" });
            setConfirmOpen(false);
          }}
          onCancel={() => setConfirmOpen(false)}
          title="Confirm Configuration"
          description="This will apply the selected driving mode to all vehicle systems. The change takes effect immediately."
        />
      </Section>

      {/* ── Destructive Variant ───────────────────────────────────── */}
      <Section title="Destructive">
        <div className={styles.row}>
          <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
            Delete Session
          </Button>
        </div>

        <ConfirmDialog
          open={deleteOpen}
          onConfirm={() => {
            toast({ title: "Session deleted", variant: "error" });
            setDeleteOpen(false);
          }}
          onCancel={() => setDeleteOpen(false)}
          title="Delete Session"
          description="This action cannot be undone. All telemetry data for this session will be permanently removed."
          confirmLabel="Delete"
          cancelLabel="Keep"
          variant="destructive"
        />
      </Section>

      {/* ── Custom Labels ─────────────────────────────────────────── */}
      <Section title="Custom Labels">
        <div className={styles.row}>
          <Button variant="secondary" onClick={() => setArchiveOpen(true)}>
            Archive Data
          </Button>
        </div>

        <ConfirmDialog
          open={archiveOpen}
          onConfirm={() => {
            toast({ title: "Session archived", variant: "default" });
            setArchiveOpen(false);
          }}
          onCancel={() => setArchiveOpen(false)}
          title="Archive Session"
          description="This session will be moved to long-term storage. You can restore it at any time."
          confirmLabel="Archive"
          cancelLabel="Cancel"
        />
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Stack gap="sm">
          <p
            style={{
              margin: 0,
              fontSize: "var(--rialto-text-sm)",
              color: "var(--rialto-text-secondary)",
            }}
          >
            Use <strong>default</strong> variant for confirmations where the action is reversible.
            Use <strong>destructive</strong> when the action is permanent — the cancel button
            receives initial focus to prevent accidental confirmation.
          </p>
        </Stack>
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
              name: "onConfirm",
              type: "() => void",
              description: "Called when the confirm button is clicked.",
            },
            {
              name: "onCancel",
              type: "() => void",
              description: "Called when the cancel button is clicked or dialog is dismissed.",
            },
            {
              name: "title",
              type: "string",
              description: "Dialog heading.",
            },
            {
              name: "description",
              type: "string",
              description: "Supporting text explaining what the action will do.",
            },
            {
              name: "confirmLabel",
              type: "string",
              default: '"Confirm"',
              description: "Label for the confirm button.",
            },
            {
              name: "cancelLabel",
              type: "string",
              default: '"Cancel"',
              description: "Label for the cancel button.",
            },
            {
              name: "variant",
              type: '"default" | "destructive"',
              default: '"default"',
              description:
                "Destructive styles the confirm button as danger and auto-focuses cancel.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            {
              label: "Focus",
              value: "Default: confirm button focused. Destructive: cancel focused",
            },
            { label: "Escape", value: "Closes dialog, equivalent to cancel" },
            { label: "Role", value: "Inherits Dialog accessibility (role=dialog, aria-modal)" },
            { label: "Label", value: "aria-labelledby and aria-describedby on the dialog" },
            {
              label: "Screen reader",
              value:
                "Announced as alertdialog with title and description read immediately; focus trapped; Cancel and Confirm buttons announced with their labels",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

ConfirmDialogPage.displayName = "ConfirmDialogPage";

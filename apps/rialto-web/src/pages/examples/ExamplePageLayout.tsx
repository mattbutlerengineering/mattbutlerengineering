import { useState, type ReactNode } from "react";
import { Text, Button, Stack, Divider } from "@mattbutlerengineering/rialto";
import styles from "./ExamplePageLayout.module.css";

/* ── ExamplePageLayout ───────────────────────── */

export interface ExamplePageLayoutProps {
  name: string;
  description: string;
  sourceJsx: string;
  compositionNotes?: ReactNode;
  children: ReactNode;
}

export function ExamplePageLayout({
  name,
  description,
  sourceJsx,
  compositionNotes,
  children,
}: ExamplePageLayoutProps) {
  const [copyLabel, setCopyLabel] = useState<"Copy JSX" | "Copied!">("Copy JSX");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sourceJsx);
      setCopyLabel("Copied!");
      setTimeout(() => {
        setCopyLabel("Copy JSX");
      }, 2000);
    } catch {
      // Clipboard write failed — silently ignore
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Stack direction="row" align="center" justify="between">
          <div>
            <Text variant="display" as="h1">
              {name}
            </Text>
            <Text variant="body" color="secondary">
              {description}
            </Text>
          </div>
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            <span aria-live="polite">{copyLabel}</span>
          </Button>
        </Stack>
      </div>

      <Divider />

      {compositionNotes != null && <div className={styles.notes}>{compositionNotes}</div>}

      <div className={styles.content}>{children}</div>
    </div>
  );
}

ExamplePageLayout.displayName = "ExamplePageLayout";

/* ── StatePanel ──────────────────────────────── */

export interface StatePanelProps {
  label: string;
  children: ReactNode;
}

export function StatePanel({ label, children }: StatePanelProps) {
  return (
    <div className={styles.statePanel}>
      <div className={styles.statePanelLabel}>
        <Text variant="caption" color="tertiary">
          {label}
        </Text>
      </div>
      <div className={styles.statePanelContent}>{children}</div>
    </div>
  );
}

StatePanel.displayName = "StatePanel";

/* ── CompositionNote ─────────────────────────── */

export interface CompositionNoteProps {
  children: ReactNode;
}

export function CompositionNote({ children }: CompositionNoteProps) {
  return (
    <aside className={styles.compositionNote} aria-label="Composition note">
      <Text variant="caption" color="secondary">
        {children}
      </Text>
    </aside>
  );
}

CompositionNote.displayName = "CompositionNote";

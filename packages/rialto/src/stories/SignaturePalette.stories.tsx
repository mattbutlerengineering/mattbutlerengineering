import { useEffect, type CSSProperties, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { Select } from "../components/Select";
import { Tabs } from "../components/Tabs";
import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  rowPairs,
  type BoardColumn,
  type BoardRow,
} from "./signature-pairs";

/**
 * Kill-test board (rialto-signature-pass Milestone 1). Matt answers one
 * question from it: does "after" read as more Rialto and less generic?
 *
 * Not in src/test/visual/visual.spec.ts: the screenshots are for the go/no-go
 * issue, never a committed baseline. `data-palette="signature"` is @internal.
 */
const meta: Meta = {
  title: "Palette/Signature kill test",
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj;

const TABLES = [
  { value: "t4", label: "Table 4 (booth)" },
  { value: "t7", label: "Table 7 (window)" },
  { value: "t12", label: "Table 12 (bar)" },
];

const noop = () => undefined;

function RowContent({ row, column }: { row: BoardRow; column: BoardColumn }) {
  const key = `${row}-${column.id}`;
  switch (row) {
    case "Button":
      return (
        <div style={stack}>
          <Button variant="primary">Seat</Button>
          <Button>Hold</Button>
          <Button variant="ghost">Skip</Button>
          <Button disabled>Closed</Button>
        </div>
      );
    case "Input":
      return (
        <div style={column_}>
          <Input label="Guest" placeholder="Name" />
          <Input label="Party" defaultValue="4 guests" />
          {column.surface === "velvet" ? (
            <p style={note}>Invalid: n/a (error red is not re-declared on velvet)</p>
          ) : (
            <Input label="Phone" defaultValue="555" error hint="Too short" />
          )}
        </div>
      );
    case "Select":
      return (
        <div style={column_}>
          <Select label="Table" options={TABLES} value="t7" onChange={noop} />
          <Select label="Section" options={TABLES} onChange={noop} />
        </div>
      );
    case "Card":
      return (
        <Card title="Table 12" subtitle="Party of 4 · 8:15pm">
          <p style={{ margin: 0 }}>Window booth, anniversary.</p>
        </Card>
      );
    case "Tabs":
      return (
        <Tabs
          aria-label={`Service view ${key}`}
          defaultTab="floor"
          tabs={[
            { id: "floor", label: "Floor", content: <p style={note}>Floor plan</p> },
            { id: "waitlist", label: "Waitlist (3)", content: <p style={note}>Waitlist</p> },
            { id: "notes", label: "Notes", content: <p style={note}>Notes</p> },
          ]}
        />
      );
  }
}

function Cell({
  row,
  variant,
  column,
}: {
  row: BoardRow;
  variant: "before" | "after";
  column: BoardColumn;
}) {
  const testId = `cell-${variant}-${column.id}`;
  if (variant === "before" && column.surface !== null) {
    return (
      <div data-testid={testId} data-column={column.id} data-theme={column.theme} style={paint}>
        <p style={note}>n/a: new surface</p>
      </div>
    );
  }
  const painted = (
    <div data-surface={column.surface ?? undefined} style={paint}>
      <RowContent row={row} column={column} />
    </div>
  );
  return (
    <div data-testid={testId} data-column={column.id} data-theme={column.theme}>
      {variant === "after" ? <div data-palette="signature">{painted}</div> : painted}
    </div>
  );
}

function Caption({ row }: { row: BoardRow }) {
  return (
    <div style={caption}>
      {BOARD_COLUMNS.map((column) => (
        <p key={column.id} style={{ margin: 0 }}>
          <strong>{column.label}:</strong>{" "}
          {rowPairs(row, column).map((pair, i) => (
            <span
              key={pair.label}
              data-testid="pair"
              data-column={column.id}
              data-fg={pair.fg}
              data-bg={pair.bg}
              data-min={pair.min}
            >
              {i > 0 ? " · " : ""}
              {pair.label} {pair.ratio.toFixed(2)}:1
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

export function SignatureBoard() {
  return (
    <div style={board}>
      <div style={grid}>
        <span />
        {BOARD_COLUMNS.map((column) => (
          <strong key={column.id} style={head}>
            {column.label}
          </strong>
        ))}
      </div>
      {BOARD_ROWS.map((row) => (
        <section key={row} data-testid={`row-${row}`} data-row={row} style={section}>
          {(["before", "after"] as const).map((variant) => (
            <div key={variant} style={grid}>
              <strong style={head}>
                {row} {variant}
              </strong>
              {BOARD_COLUMNS.map((column) => (
                <Cell key={column.id} row={row} variant={variant} column={column} />
              ))}
            </div>
          ))}
          <Caption row={row} />
        </section>
      ))}
    </div>
  );
}

export const Board: Story = {
  render: () => <SignatureBoard />,
};

/**
 * Select's list portals to <body>, outside any cell's scope, so the open
 * list's highlighted (plum-muted) and selected (gold check) options are shown
 * here with the scope set on <body> for this story only.
 */
function BodyPalette({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.body.setAttribute("data-palette", "signature");
    return () => document.body.removeAttribute("data-palette");
  }, []);
  return <>{children}</>;
}

export const SelectOpenAfter: Story = {
  name: "Select open (after)",
  render: () => (
    <BodyPalette>
      <div style={{ ...paint, minHeight: 320 }}>
        <Select label="Table" options={TABLES} value="t7" onChange={noop} />
      </div>
    </BodyPalette>
  ),
};

const board: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--rialto-space-lg)",
  padding: "var(--rialto-space-lg)",
  minWidth: 1500,
  background: "var(--rialto-surface)",
  color: "var(--rialto-text-primary)",
  fontFamily: "var(--rialto-font-sans)",
};
const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "120px repeat(5, minmax(260px, 1fr))",
  gap: "var(--rialto-space-sm)",
  alignItems: "stretch",
};
const section: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--rialto-space-sm)",
};
const paint: CSSProperties = {
  height: "100%",
  boxSizing: "border-box",
  padding: "var(--rialto-space-md)",
  background: "var(--rialto-surface)",
  color: "var(--rialto-text-primary)",
};
const stack: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--rialto-space-xs)",
};
const column_: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--rialto-space-sm)",
};
const note: CSSProperties = {
  margin: 0,
  fontSize: "var(--rialto-text-sm)",
  color: "var(--rialto-text-secondary)",
};
const head: CSSProperties = { fontSize: "var(--rialto-text-sm)", alignSelf: "center" };
const caption: CSSProperties = {
  fontSize: "var(--rialto-text-xs)",
  color: "var(--rialto-text-secondary)",
  display: "grid",
  gap: "var(--rialto-space-2xs)",
  paddingInlineStart: 128,
};

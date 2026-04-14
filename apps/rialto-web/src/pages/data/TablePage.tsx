import { Card, Checkbox, DataList, Stack, Table, Text } from "@mattbutlerengineering/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface LapRow extends Record<string, unknown> {
  id: number;
  driver: string;
  lap: number;
  sector1: string;
  sector2: string;
  sector3: string;
  total: string;
  delta: string;
}

const LAP_DATA: LapRow[] = [
  {
    id: 1,
    driver: "Charles Leclerc",
    lap: 14,
    sector1: "28.412",
    sector2: "34.891",
    sector3: "22.107",
    total: "1:25.410",
    delta: "-0.342",
  },
  {
    id: 2,
    driver: "Lewis Hamilton",
    lap: 14,
    sector1: "28.673",
    sector2: "34.752",
    sector3: "22.331",
    total: "1:25.756",
    delta: "+0.004",
  },
  {
    id: 3,
    driver: "Marc Newson",
    lap: 12,
    sector1: "29.101",
    sector2: "35.244",
    sector3: "22.890",
    total: "1:27.235",
    delta: "+1.483",
  },
  {
    id: 4,
    driver: "Adrian Newey",
    lap: 11,
    sector1: "29.445",
    sector2: "35.601",
    sector3: "23.112",
    total: "1:28.158",
    delta: "+2.406",
  },
  {
    id: 5,
    driver: "Lando Norris",
    lap: 14,
    sector1: "28.890",
    sector2: "35.112",
    sector3: "22.550",
    total: "1:26.552",
    delta: "+0.800",
  },
];

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

function TablePlayground() {
  const [striped, setStriped] = useState(true);

  return (
    <Stack gap="lg">
      <Table<LapRow>
        columns={[
          { key: "driver", header: "Driver", sortable: true },
          { key: "lap", header: "Lap", sortable: true, align: "center", width: "60px" },
          { key: "total", header: "Total", sortable: true, align: "right" },
          {
            key: "delta",
            header: "Delta",
            sortable: true,
            align: "right",
            render: (row) => (
              <span
                style={{
                  color: String(row.delta).startsWith("-")
                    ? "var(--rialto-success)"
                    : "var(--rialto-text-tertiary)",
                  fontFamily: "var(--rialto-font-mono)",
                }}
              >
                {row.delta as string}
              </span>
            ),
          },
        ]}
        data={LAP_DATA}
        rowKey={(row) => row.id}
        striped={striped}
      />
      <div className={styles.row}>
        <Checkbox label="Striped rows" checked={striped} onCheckedChange={setStriped} />
      </div>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TablePage() {
  return (
    <ComponentPageLayout
      name="Table"
      description="Aluminum header gradient, subtle row hover with gold tint, sortable columns with gold active indicator. Click any sortable header — the arrow flips between ascending and descending."
    >
      {/* ── Full Example ──────────────────────────────────────────── */}
      <Section title="Sortable Table">
        <Table<LapRow>
          columns={[
            { key: "driver", header: "Driver", sortable: true },
            {
              key: "lap",
              header: "Lap",
              sortable: true,
              align: "center",
              width: "60px",
            },
            { key: "sector1", header: "S1", align: "right" },
            { key: "sector2", header: "S2", align: "right" },
            { key: "sector3", header: "S3", align: "right" },
            { key: "total", header: "Total", sortable: true, align: "right" },
            {
              key: "delta",
              header: "Delta",
              sortable: true,
              align: "right",
              render: (row) => (
                <span
                  style={{
                    color: String(row.delta).startsWith("-")
                      ? "var(--rialto-success)"
                      : "var(--rialto-text-tertiary)",
                  }}
                >
                  {row.delta as string}
                </span>
              ),
            },
          ]}
          data={LAP_DATA}
          rowKey={(row) => row.id}
          striped
        />
      </Section>

      {/* ── Features ──────────────────────────────────────────────── */}
      <Section title="Features">
        <Card variant="flat" style={{ padding: "var(--rialto-space-md)" }}>
          <Stack gap="sm">
            <Text variant="caption" color="secondary">
              Click any sortable column header to sort ascending. Click again for descending. The
              gold arrow indicator shows the active sort direction.
            </Text>
            <Text variant="caption" color="secondary">
              The <code>render</code> prop on columns allows custom cell rendering — useful for
              coloring values, adding icons, or showing badges.
            </Text>
          </Stack>
        </Card>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <TablePlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "columns",
              type: "Column<T>[]",
              description:
                "Column definitions. Each column has key, header, and optional sortable, align, width, render.",
            },
            {
              name: "data",
              type: "T[]",
              description: "Array of data rows.",
            },
            {
              name: "rowKey",
              type: "(row: T) => string | number",
              description: "Unique key for each row (for React reconciliation).",
            },
            {
              name: "striped",
              type: "boolean",
              default: "false",
              description: "Alternating row background colors.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "Native <table> with <thead> and <tbody>" },
            { label: "Sorting", value: "aria-sort=ascending/descending on active column" },
            { label: "Keyboard", value: "Tab to navigate to sortable headers, Enter to sort" },
            { label: "Headers", value: "<th scope=col> for all column headers" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

TablePage.displayName = "TablePage";

import { useState } from "react";
import { Card, DataList, DataTable, Stack, Tag, Text } from "@mattbutlerengineering/rialto";
import type { SortState } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

interface Driver extends Record<string, unknown> {
  id: string;
  driver: string;
  team: string;
  points: number;
  wins: number;
}

const DRIVERS: Driver[] = [
  { id: "ver", driver: "Max Verstappen", team: "Red Bull Racing", points: 575, wins: 19 },
  { id: "per", driver: "Sergio Perez", team: "Red Bull Racing", points: 285, wins: 2 },
  { id: "ham", driver: "Lewis Hamilton", team: "Mercedes", points: 234, wins: 0 },
  { id: "sai", driver: "Carlos Sainz", team: "Ferrari", points: 200, wins: 1 },
  { id: "alo", driver: "Fernando Alonso", team: "Aston Martin", points: 206, wins: 0 },
];

const COLUMNS = [
  { key: "driver", header: "Driver", sortable: true, rowHeader: true },
  { key: "team", header: "Team", sortable: true },
  { key: "points", header: "Points", sortable: true, align: "right" as const },
  { key: "wins", header: "Wins", sortable: true, align: "right" as const },
];

const rowKey = (row: Driver) => row.id;
const selectionLabel = (row: Driver) => `Select ${row.driver}`;

// ---------------------------------------------------------------------------
// Multi-select playground
// ---------------------------------------------------------------------------

function MultiSelectDemo() {
  const [selected, setSelected] = useState<(string | number)[]>(["ver"]);

  return (
    <Stack gap="md">
      <DataTable
        label="Championship standings"
        columns={COLUMNS}
        data={DRIVERS}
        rowKey={rowKey}
        selectionMode="multiple"
        selectionLabel={selectionLabel}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        striped
      />
      <Text variant="caption" color="secondary">
        {selected.length} selected: {selected.join(", ") || "none"}. Sort cycles ascending →
        descending → unsorted. The select-all header checkbox shows an indeterminate state for
        partial selections.
      </Text>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Controlled sort demo
// ---------------------------------------------------------------------------

function ControlledSortDemo() {
  const [sort, setSort] = useState<SortState | null>({ key: "points", direction: "desc" });

  return (
    <Stack gap="md">
      <DataTable
        label="Controlled sort"
        columns={COLUMNS}
        data={DRIVERS}
        rowKey={rowKey}
        sort={sort}
        onSortChange={setSort}
      />
      <Text variant="caption" color="secondary">
        Current sort: {sort ? `${sort.key} (${sort.direction})` : "none"}. The parent owns the sort
        state; clicking a header reports the next state through onSortChange.
      </Text>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function DataTablePage() {
  return (
    <ComponentPageLayout
      name="DataTable"
      description="Sortable, selectable data grid built on a native table with grid ARIA. Column sort cycles ascending → descending → none with aria-sort on the active header. Row selection (single or multiple) renders accessible checkboxes plus an indeterminate select-all. Sort and selection are both controllable and uncontrolled-friendly."
    >
      {/* ── Uncontrolled ──────────────────────────────────────────────── */}
      <Section title="Sortable (uncontrolled)">
        <Stack gap="md">
          <DataTable
            label="Championship standings"
            columns={COLUMNS}
            data={DRIVERS}
            rowKey={rowKey}
            defaultSort={{ key: "points", direction: "desc" }}
          />
          <Text variant="caption" color="secondary">
            No sort props required — the grid keeps its own state seeded from defaultSort. Numeric
            columns sort numerically; text columns sort by locale.
          </Text>
        </Stack>
      </Section>

      {/* ── Multi selection ───────────────────────────────────────────── */}
      <Section title="Multi selection (controlled)">
        <MultiSelectDemo />
      </Section>

      {/* ── Single selection ──────────────────────────────────────────── */}
      <Section title="Single selection">
        <Stack gap="md">
          <DataTable
            label="Pick one driver"
            columns={COLUMNS}
            data={DRIVERS}
            rowKey={rowKey}
            selectionMode="single"
            selectionLabel={selectionLabel}
            defaultSelectedKeys={["ham"]}
          />
          <Text variant="caption" color="secondary">
            Selecting a row deselects any previously selected row. No select-all is offered in
            single mode.
          </Text>
        </Stack>
      </Section>

      {/* ── Controlled sort ───────────────────────────────────────────── */}
      <Section title="Controlled sort">
        <ControlledSortDemo />
      </Section>

      {/* ── Density ───────────────────────────────────────────────────── */}
      <Section title="Density">
        <Stack gap="lg">
          <div>
            <Tag>compact</Tag>
            <DataTable
              label="Compact standings"
              columns={COLUMNS}
              data={DRIVERS}
              rowKey={rowKey}
              density="compact"
            />
          </div>
          <div>
            <Tag>spacious</Tag>
            <DataTable
              label="Spacious standings"
              columns={COLUMNS}
              data={DRIVERS}
              rowKey={rowKey}
              density="spacious"
            />
          </div>
        </Stack>
      </Section>

      {/* ── Empty state ───────────────────────────────────────────────── */}
      <Section title="Empty">
        <DataTable
          label="Empty standings"
          columns={COLUMNS}
          data={[]}
          rowKey={rowKey}
          emptyMessage="No drivers to display"
        />
      </Section>

      {/* ── Usage example ─────────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Card variant="elevated" style={{ padding: "var(--rialto-space-lg)" }}>
          <Stack gap="md">
            <Text variant="label" color="primary">
              Race Control
            </Text>
            <Text variant="caption" color="secondary">
              Select drivers to flag for a stewards review; sort by points to triage.
            </Text>
            <DataTable
              label="Stewards review"
              columns={COLUMNS}
              data={DRIVERS}
              rowKey={rowKey}
              selectionMode="multiple"
              selectionLabel={selectionLabel}
              defaultSort={{ key: "points", direction: "desc" }}
            />
          </Stack>
        </Card>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable component="DataTable" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=grid on the table; row / columnheader / rowheader / gridcell on cells" },
            {
              label: "Sort",
              value: "aria-sort=ascending|descending|none on the active/sortable columnheader",
            },
            {
              label: "Selection",
              value:
                "Native checkboxes with accessible names; aria-selected on selected rows; aria-multiselectable on the grid in multi mode",
            },
            {
              label: "Select all",
              value: "Header checkbox reflects all/none and shows an indeterminate partial state",
            },
            {
              label: "Keyboard",
              value: "Sortable headers are buttons (Enter/Space to sort); checkboxes toggle with Space",
            },
            {
              label: "Controllability",
              value: "Sort (sort/onSortChange) and selection (selectedKeys/onSelectionChange) are controllable, with defaultSort/defaultSelectedKeys for uncontrolled use",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

DataTablePage.displayName = "DataTablePage";

import { useState } from "react";
import { Table, type ColumnDef } from "../../components/Table/Table";
import { DataList } from "../../components/DataList/DataList";
import { Tabs } from "../../components/Tabs/Tabs";
import { Accordion } from "../../components/Accordion/Accordion";
import { Timeline } from "../../components/Timeline/Timeline";
import { Pagination } from "../../components/Pagination/Pagination";
import { Breadcrumb } from "../../components/Breadcrumb/Breadcrumb";
import { Stat } from "../../components/Stat/Stat";
import { Card } from "../../components/Card/Card";
import { Text } from "../../components/Text/Text";
import css from "../showcase.module.css";

interface SampleRow {
  id: number;
  name: string;
  role: string;
  status: string;
}

const SAMPLE_DATA: readonly SampleRow[] = [
  { id: 1, name: "Alice Chen", role: "Engineer", status: "Active" },
  { id: 2, name: "Bob Martinez", role: "Designer", status: "Active" },
  { id: 3, name: "Carol Smith", role: "PM", status: "Away" },
  { id: 4, name: "Dave Wilson", role: "Engineer", status: "Offline" },
];

const COLUMNS: ReadonlyArray<ColumnDef<SampleRow>> = [
  { key: "name", header: "Name", sortable: true },
  { key: "role", header: "Role", sortable: true },
  { key: "status", header: "Status" },
];

const TAB_ITEMS = [
  { value: "overview", label: "Overview", content: <Text variant="body">Overview content goes here.</Text> },
  { value: "details", label: "Details", content: <Text variant="body">Detailed information and settings.</Text> },
  { value: "history", label: "History", content: <Text variant="body">Activity history and logs.</Text> },
];

const ACCORDION_ITEMS = [
  { value: "q1", title: "What is Rialto?", content: "Rialto is a React component library built with material honesty principles." },
  { value: "q2", title: "How do vibes work?", content: "Vibes are CSS custom property override presets that shift the design language to match user intent." },
  { value: "q3", title: "Is Rialto accessible?", content: "Yes. All interactive components meet WCAG AA standards with keyboard navigation and screen reader support." },
];

const TIMELINE_EVENTS = [
  { title: "Project created", description: "Initial repository setup", date: "Jan 15, 2026" },
  { title: "Design tokens defined", description: "Colors, typography, spacing, radius, shadows", date: "Feb 1, 2026" },
  { title: "Core components shipped", description: "Button, Input, Card, Dialog, Table", date: "Mar 10, 2026" },
  { title: "Figma migration started", description: "Token extraction and component showcase", date: "Apr 14, 2026" },
];

export function DataSection() {
  const [page, setPage] = useState(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--rialto-space-xl)" }}>
      {/* Stats */}
      <div>
        <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
          Stats
        </Text>
        <div className={css.gridLayout}>
          <Stat label="Components" value="69" />
          <Stat label="Tokens" value="128" />
          <Stat label="Coverage" value="80%" />
          <Stat label="Bundle size" value="150 kB" />
        </div>
      </div>

      {/* Table */}
      <div>
        <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
          Table
        </Text>
        <Table data={SAMPLE_DATA} columns={COLUMNS} />
      </div>

      {/* DataList */}
      <div>
        <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
          Data List
        </Text>
        <Card style={{ maxWidth: 400 }}>
          <DataList
            items={[
              { label: "Name", value: "Rialto Design System" },
              { label: "Version", value: "0.1.0" },
              { label: "License", value: "MIT" },
              { label: "Components", value: "69" },
            ]}
          />
        </Card>
      </div>

      {/* Breadcrumb */}
      <div>
        <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
          Breadcrumb
        </Text>
        <Breadcrumb
          items={[
            { label: "Home", href: "#" },
            { label: "Components", href: "#" },
            { label: "Data Display" },
          ]}
        />
      </div>

      {/* Tabs */}
      <div>
        <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
          Tabs
        </Text>
        <Tabs items={TAB_ITEMS} defaultValue="overview" />
      </div>

      {/* Accordion */}
      <div>
        <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
          Accordion
        </Text>
        <Accordion items={ACCORDION_ITEMS} />
      </div>

      {/* Timeline */}
      <div>
        <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
          Timeline
        </Text>
        <Timeline events={TIMELINE_EVENTS} />
      </div>

      {/* Pagination */}
      <div>
        <Text variant="caption" color="secondary" style={{ marginBlockEnd: "var(--rialto-space-xs)" }}>
          Pagination
        </Text>
        <Pagination currentPage={page} totalPages={10} onPageChange={setPage} />
      </div>
    </div>
  );
}

import { DataList, Pagination, Stack, Text } from "@mbe/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function PaginationPage() {
  const [pageA, setPageA] = useState(1);
  const [pageB, setPageB] = useState(7);
  const [pageC, setPageC] = useState(50);

  return (
    <ComponentPageLayout
      name="Pagination"
      description="Aluminum page buttons with gold active indicator. Ellipsis collapse keeps large ranges compact. Previous/Next arrows disable at boundaries."
    >
      {/* ── Small range ───────────────────────────────────────────── */}
      <Section title="Small Range">
        <Stack gap="xs">
          <Text variant="detail" color="tertiary">
            5 pages
          </Text>
          <Pagination page={pageA} totalPages={5} onChange={setPageA} />
        </Stack>
      </Section>

      {/* ── Large range with ellipsis ──────────────────────────────── */}
      <Section title="Large Range with Ellipsis">
        <Stack gap="xs">
          <Text variant="detail" color="tertiary">
            20 pages
          </Text>
          <Pagination page={pageB} totalPages={20} onChange={setPageB} />
        </Stack>
      </Section>

      {/* ── Very large ────────────────────────────────────────────── */}
      <Section title="Very Large Range">
        <Stack gap="xs">
          <Text variant="detail" color="tertiary">
            100 pages
          </Text>
          <Pagination page={pageC} totalPages={100} onChange={setPageC} />
        </Stack>
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "var(--rialto-space-md)",
            }}
          >
            <Text variant="detail" color="tertiary">
              Showing laps {(pageA - 1) * 10 + 1}–{Math.min(pageA * 10, 147)} of 147
            </Text>
          </div>
          <div
            style={{
              height: 80,
              background: "var(--rialto-surface-recessed)",
              borderRadius: "var(--rialto-radius-default)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "var(--rialto-space-md)",
            }}
          >
            <Text variant="caption" color="tertiary">
              Lap data table
            </Text>
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <Pagination page={pageA} totalPages={15} onChange={setPageA} />
          </div>
        </div>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "page",
              type: "number",
              description: "Current page (1-based).",
            },
            {
              name: "totalPages",
              type: "number",
              description: "Total number of pages.",
            },
            {
              name: "onChange",
              type: "(page: number) => void",
              description: "Called when page changes.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "<nav aria-label='Pagination'>" },
            { label: "Current", value: "aria-current='page' on active page button" },
            { label: "Previous/Next", value: "aria-label='Previous/Next page' on arrow buttons" },
            { label: "Disabled", value: "aria-disabled on Previous at page 1, Next at last page" },
            { label: "Keyboard", value: "Tab to navigate between buttons" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

PaginationPage.displayName = "PaginationPage";

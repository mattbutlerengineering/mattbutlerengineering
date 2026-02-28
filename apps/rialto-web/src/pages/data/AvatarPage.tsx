import { Avatar, AvatarGroup, DataList, Select } from "@mbe/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------

type AvatarSize = "sm" | "md" | "lg" | "xl";
type AvatarStatus = "online" | "away" | "busy" | "offline" | undefined;

function AvatarPlayground() {
  const [size, setSize] = useState<AvatarSize>("lg");
  const [status, setStatus] = useState<AvatarStatus>("online");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--rialto-space-lg)",
      }}
    >
      <div
        style={{
          padding: "var(--rialto-space-xl)",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Avatar name="Charles Leclerc" size={size} status={status} />
      </div>
      <div className={styles.row} style={{ flexWrap: "wrap" }}>
        <Select
          label="Size"
          value={size}
          onChange={(v) => setSize(v as AvatarSize)}
          options={[
            { value: "sm", label: "sm" },
            { value: "md", label: "md" },
            { value: "lg", label: "lg" },
            { value: "xl", label: "xl" },
          ]}
        />
        <Select
          label="Status"
          value={status ?? "none"}
          onChange={(v) => setStatus(v === "none" ? undefined : (v as AvatarStatus))}
          options={[
            { value: "none", label: "No status" },
            { value: "online", label: "Online" },
            { value: "away", label: "Away" },
            { value: "busy", label: "Busy" },
            { value: "offline", label: "Offline" },
          ]}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AvatarPage() {
  return (
    <ComponentPageLayout
      name="Avatar"
      description="Machined aluminum border ring with image, initials fallback, or generic silhouette. Gold status dots for presence. Group stacking with hover lift."
    >
      {/* ── Sizes ─────────────────────────────────────────────────── */}
      <Section title="Sizes">
        <div className={styles.row} style={{ alignItems: "center" }}>
          <Avatar name="Charles Leclerc" size="sm" />
          <Avatar name="Charles Leclerc" size="md" />
          <Avatar name="Charles Leclerc" size="lg" />
          <Avatar name="Charles Leclerc" size="xl" />
        </div>
      </Section>

      {/* ── Status ────────────────────────────────────────────────── */}
      <Section title="Status Indicators">
        <div className={styles.row} style={{ alignItems: "center" }}>
          <Avatar name="CL" size="lg" status="online" />
          <Avatar name="MN" size="lg" status="away" />
          <Avatar name="JI" size="lg" status="busy" />
          <Avatar name="SF" size="lg" status="offline" />
        </div>
      </Section>

      {/* ── Fallback ──────────────────────────────────────────────── */}
      <Section title="Fallback Hierarchy">
        <div className={styles.row} style={{ alignItems: "center" }}>
          <Avatar size="lg" />
          <Avatar name="Marc Newson" size="lg" />
          <Avatar src="https://i.pravatar.cc/128?u=a" name="Test User" size="lg" />
        </div>
      </Section>

      {/* ── Avatar Group ──────────────────────────────────────────── */}
      <Section title="Avatar Group">
        <div className={styles.stack}>
          <AvatarGroup
            size="md"
            max={3}
            avatars={[
              { name: "Charles Leclerc", status: "online" },
              { name: "Lewis Hamilton", status: "online" },
              { name: "Marc Newson", status: "away" },
              { name: "Adrian Newey", status: "busy" },
              { name: "Carlos Sainz" },
            ]}
          />
          <AvatarGroup
            size="sm"
            max={4}
            avatars={[
              { name: "Charles Leclerc" },
              { name: "Lewis Hamilton" },
              { name: "Marc Newson" },
              { name: "Adrian Newey" },
              { name: "Carlos Sainz" },
              { name: "Lando Norris" },
            ]}
          />
        </div>
      </Section>

      {/* ── Playground ────────────────────────────────────────────── */}
      <Section title="Interactive Playground">
        <AvatarPlayground />
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Avatar Props">
        <PropsTable
          props={[
            {
              name: "src",
              type: "string",
              description: "Image URL. Falls back to initials or silhouette if missing or broken.",
            },
            {
              name: "name",
              type: "string",
              description: "Used for initials fallback and aria-label.",
            },
            {
              name: "size",
              type: '"sm" | "md" | "lg" | "xl"',
              default: '"md"',
              description: "Avatar diameter.",
            },
            {
              name: "status",
              type: '"online" | "away" | "busy" | "offline"',
              description: "Presence indicator dot.",
            },
          ]}
        />
      </Section>

      {/* ── Props Table (AvatarGroup) ─────────────────────────────── */}
      <Section title="AvatarGroup Props">
        <PropsTable
          props={[
            {
              name: "avatars",
              type: "Array<{ src?: string; name?: string; status?: AvatarStatus }>",
              description: "List of avatars to display.",
            },
            {
              name: "max",
              type: "number",
              description: "Maximum avatars before overflow count badge appears.",
            },
            {
              name: "size",
              type: '"sm" | "md" | "lg" | "xl"',
              default: '"md"',
              description: "Size applied to all avatars in the group.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Element", value: "<img> with alt or <span> with aria-label" },
            { label: "Name", value: "name prop used as aria-label for initials fallback" },
            { label: "Status dot", value: "aria-label on status dot describes presence state" },
            { label: "Group", value: "AvatarGroup wraps in role=group" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

AvatarPage.displayName = "AvatarPage";

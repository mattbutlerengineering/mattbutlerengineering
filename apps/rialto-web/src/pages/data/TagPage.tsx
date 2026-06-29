import { AnimatedTag, Button, DataList, Tag, TagGroup, Text } from "@mattbutlerengineering/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TagPage() {
  const [tags, setTags] = useState(["Fiorano", "Monza", "Mugello", "Imola", "Spa"]);
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set(["V6"]));

  return (
    <ComponentPageLayout
      name="Tag"
      description="Removable tags for filters and multi-value selections. Spring-animated dismiss, selectable toggle mode, and variant colors. The interactive cousin of Badge."
    >
      {/* ── Variants ──────────────────────────────────────────────── */}
      <Section title="Variants">
        <div className={styles.row}>
          <Tag>Default</Tag>
          <Tag variant="accent">Accent</Tag>
          <Tag variant="success">Success</Tag>
          <Tag variant="error">Error</Tag>
        </div>
      </Section>

      {/* ── Selectable (filter mode) ──────────────────────────────── */}
      <Section title="Selectable (Filter Mode)">
        <div className={styles.row}>
          {["V6", "V8", "V12", "Hybrid", "Turbo"].map((f) => (
            <Tag
              key={f}
              onClick={() =>
                setSelectedFilters((prev) => {
                  const next = new Set(prev);
                  if (next.has(f)) {
                    next.delete(f);
                  } else {
                    next.add(f);
                  }
                  return next;
                })
              }
              selected={selectedFilters.has(f)}
            >
              {f}
            </Tag>
          ))}
        </div>
      </Section>

      {/* ── Dismissible ───────────────────────────────────────────── */}
      <Section title="Dismissible (AnimatedTag)">
        <TagGroup>
          {tags.map((t) => (
            <AnimatedTag
              key={t}
              id={t}
              variant="accent"
              dismissible
              onDismiss={() => setTags((prev) => prev.filter((x) => x !== t))}
            >
              {t}
            </AnimatedTag>
          ))}
        </TagGroup>
        {tags.length === 0 && (
          <div style={{ marginTop: "var(--rialto-space-xs)" }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTags(["Fiorano", "Monza", "Mugello", "Imola", "Spa"])}
            >
              Reset tags
            </Button>
          </div>
        )}
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
              marginBottom: "var(--rialto-space-xs)",
            }}
          >
            Active circuits
          </Text>
          <TagGroup>
            <AnimatedTag id="fiorano" variant="accent" dismissible onDismiss={() => {}}>
              Fiorano
            </AnimatedTag>
            <AnimatedTag id="monza" variant="accent" dismissible onDismiss={() => {}}>
              Monza
            </AnimatedTag>
            <AnimatedTag id="mugello" variant="accent" dismissible onDismiss={() => {}}>
              Mugello
            </AnimatedTag>
          </TagGroup>
        </div>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Tag Props">
        <PropsTable component="Tag" />
      </Section>

      {/* ── Props Table (AnimatedTag) ─────────────────────────────── */}
      <Section title="AnimatedTag Props">
        <PropsTable component="AnimatedTag" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=option when used as filter tag" },
            { label: "Dismiss", value: "Dismiss button has aria-label='Remove [tag text]'" },
            { label: "Selected", value: "aria-pressed=true on selected filter tags" },
            { label: "Keyboard", value: "Space/Enter to toggle selection or dismiss" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

TagPage.displayName = "TagPage";

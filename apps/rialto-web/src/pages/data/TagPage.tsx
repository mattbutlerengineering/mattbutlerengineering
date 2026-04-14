import { AnimatedTag, Button, DataList, Tag, TagGroup } from "@mattbutlerengineering/rialto";
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
          <p
            style={{
              fontSize: "var(--rialto-text-xs)",
              color: "var(--rialto-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "var(--rialto-tracking-wide)",
              marginBottom: "var(--rialto-space-xs)",
            }}
          >
            Active circuits
          </p>
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
        <PropsTable
          props={[
            {
              name: "variant",
              type: '"default" | "accent" | "success" | "error"',
              default: '"default"',
              description: "Color variant.",
            },
            {
              name: "selected",
              type: "boolean",
              default: "false",
              description: "Shows selected state (for filter tags).",
            },
            {
              name: "dismissible",
              type: "boolean",
              default: "false",
              description: "Shows a dismiss (×) button.",
            },
            {
              name: "onDismiss",
              type: "() => void",
              description: "Called when the dismiss button is clicked.",
            },
            {
              name: "onClick",
              type: "() => void",
              description: "Makes the tag interactive (for filter tags).",
            },
          ]}
        />
      </Section>

      {/* ── Props Table (AnimatedTag) ─────────────────────────────── */}
      <Section title="AnimatedTag Props">
        <PropsTable
          props={[
            {
              name: "id",
              type: "string",
              description: "Required — used as Framer Motion layout ID for exit animation.",
            },
            {
              name: "dismissible",
              type: "boolean",
              default: "false",
              description: "Shows dismiss button with spring exit animation.",
            },
            {
              name: "onDismiss",
              type: "() => void",
              description: "Called when dismissed — remove from parent state to trigger exit.",
            },
          ]}
        />
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

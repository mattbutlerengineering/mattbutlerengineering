import { Card, DataList, Select, Skeleton, SkeletonGroup, Stack } from "@mbe/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SkeletonPage() {
  const [showSkeleton, setShowSkeleton] = useState(true);

  return (
    <ComponentPageLayout
      name="Skeleton"
      description="Gold-tinted shimmer sweeps across recessed surfaces. Shape variants match the content they replace — text lines, headings, circles, rectangles. Compose them for realistic loading states."
    >
      {/* ── Shapes ────────────────────────────────────────────────── */}
      <Section title="Shapes">
        <div className={styles.row} style={{ alignItems: "center", flexWrap: "wrap" }}>
          <div className={styles.stack} style={{ alignItems: "center" }}>
            <Skeleton variant="circle" width={40} />
            <span style={{ fontSize: "var(--rialto-text-xs)", color: "var(--rialto-text-tertiary)" }}>
              circle
            </span>
          </div>
          <div className={styles.stack} style={{ alignItems: "center" }}>
            <Skeleton variant="text" width={120} />
            <span style={{ fontSize: "var(--rialto-text-xs)", color: "var(--rialto-text-tertiary)" }}>
              text
            </span>
          </div>
          <div className={styles.stack} style={{ alignItems: "center" }}>
            <Skeleton variant="heading" width={180} />
            <span style={{ fontSize: "var(--rialto-text-xs)", color: "var(--rialto-text-tertiary)" }}>
              heading
            </span>
          </div>
          <div className={styles.stack} style={{ alignItems: "center" }}>
            <Skeleton variant="rect" width={80} height={40} />
            <span style={{ fontSize: "var(--rialto-text-xs)", color: "var(--rialto-text-tertiary)" }}>
              rect
            </span>
          </div>
        </div>
      </Section>

      {/* ── Multi-line Text ───────────────────────────────────────── */}
      <Section title="Multi-line Text">
        <div style={{ maxWidth: 400 }}>
          <Skeleton variant="text" lines={3} width="100%" />
        </div>
      </Section>

      {/* ── Card Skeleton ─────────────────────────────────────────── */}
      <Section title="Card Skeleton">
        <SkeletonGroup>
          <Card style={{ width: 320 }}>
            <div
              style={{
                display: "flex",
                gap: "var(--rialto-space-sm)",
                alignItems: "center",
                marginBottom: "var(--rialto-space-sm)",
              }}
            >
              <Skeleton variant="circle" width={36} />
              <div style={{ flex: 1 }}>
                <Skeleton variant="heading" width="60%" />
                <div style={{ height: 6 }} />
                <Skeleton variant="text" width="40%" />
              </div>
            </div>
            <Skeleton variant="rect" width="100%" height={80} />
            <div style={{ height: 8 }} />
            <Skeleton variant="text" lines={2} width="100%" />
          </Card>
        </SkeletonGroup>
      </Section>

      {/* ── List Skeleton ─────────────────────────────────────────── */}
      <Section title="List Skeleton">
        <SkeletonGroup>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--rialto-space-sm)" }}>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--rialto-space-sm)",
                  padding: "var(--rialto-space-xs) 0",
                }}
              >
                <Skeleton variant="circle" width={32} />
                <div style={{ flex: 1 }}>
                  <Skeleton variant="text" width={`${60 + i * 10}%`} />
                  <div style={{ height: 4 }} />
                  <Skeleton variant="text" width="30%" />
                </div>
                <Skeleton variant="rect" width={48} height={20} />
              </div>
            ))}
          </div>
        </SkeletonGroup>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Stack gap="md">
          <div style={{ display: "flex", gap: "var(--rialto-space-sm)", alignItems: "center" }}>
            <Select
              label="State"
              value={showSkeleton ? "loading" : "loaded"}
              onChange={(v) => setShowSkeleton(v === "loading")}
              options={[
                { value: "loading", label: "Loading" },
                { value: "loaded", label: "Loaded" },
              ]}
            />
          </div>
          <Card style={{ width: 320 }}>
            {showSkeleton ? (
              <SkeletonGroup>
                <div
                  style={{
                    display: "flex",
                    gap: "var(--rialto-space-sm)",
                    alignItems: "center",
                    marginBottom: "var(--rialto-space-sm)",
                  }}
                >
                  <Skeleton variant="circle" width={36} />
                  <div style={{ flex: 1 }}>
                    <Skeleton variant="heading" width="55%" />
                    <div style={{ height: 4 }} />
                    <Skeleton variant="text" width="35%" />
                  </div>
                </div>
                <Skeleton variant="text" lines={2} width="100%" />
              </SkeletonGroup>
            ) : (
              <div>
                <div
                  style={{
                    display: "flex",
                    gap: "var(--rialto-space-sm)",
                    alignItems: "center",
                    marginBottom: "var(--rialto-space-sm)",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "var(--rialto-accent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "var(--rialto-text-sm)",
                      fontWeight: "var(--rialto-weight-medium)",
                      color: "#000",
                    }}
                  >
                    CL
                  </div>
                  <div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "var(--rialto-text-sm)",
                        fontWeight: "var(--rialto-weight-medium)",
                        color: "var(--rialto-text-primary)",
                      }}
                    >
                      Charles Leclerc
                    </p>
                    <p
                      style={{
                        margin: "2px 0 0",
                        fontSize: "var(--rialto-text-xs)",
                        color: "var(--rialto-text-tertiary)",
                      }}
                    >
                      Lead Driver
                    </p>
                  </div>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--rialto-text-sm)",
                    color: "var(--rialto-text-secondary)",
                    lineHeight: 1.5,
                  }}
                >
                  Fastest lap: 1:24.892. Sector 3 personal best by 0.3s.
                </p>
              </div>
            )}
          </Card>
        </Stack>
      </Section>

      {/* ── Props Table (Skeleton) ────────────────────────────────── */}
      <Section title="Skeleton Props">
        <PropsTable
          props={[
            {
              name: "variant",
              type: '"text" | "heading" | "circle" | "rect"',
              default: '"text"',
              description: "Shape of the skeleton placeholder.",
            },
            {
              name: "width",
              type: "number | string",
              description: "Width of the skeleton (px or CSS value like '100%').",
            },
            {
              name: "height",
              type: "number | string",
              description: "Height for rect variant.",
            },
            {
              name: "lines",
              type: "number",
              description: "Renders multiple stacked text lines when > 1.",
            },
          ]}
        />
      </Section>

      {/* ── Props Table (SkeletonGroup) ───────────────────────────── */}
      <Section title="SkeletonGroup Props">
        <PropsTable
          props={[
            {
              name: "children",
              type: "ReactNode",
              description: "Skeleton children. Synchronizes shimmer animation across all children.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "aria-hidden=true — purely decorative" },
            { label: "Pattern", value: "Wrap in a region with aria-busy=true during loading" },
            { label: "Reduced motion", value: "Shimmer animation disabled" },
            { label: "Color", value: "Uses surface tokens — adapts to dark/light mode" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

SkeletonPage.displayName = "SkeletonPage";

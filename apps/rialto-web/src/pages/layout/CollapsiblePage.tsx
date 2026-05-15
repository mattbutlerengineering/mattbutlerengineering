import { Button, Collapsible, DataList, Stack } from "@mattbutlerengineering/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function CollapsiblePage() {
  const [controlledOpen, setControlledOpen] = useState(false);

  return (
    <ComponentPageLayout
      name="Collapsible"
      description="A simpler sibling to Accordion — single expandable section with spring-animated height and chevron rotation. Supports controlled and uncontrolled modes."
    >
      {/* ── Uncontrolled ──────────────────────────────────────────── */}
      <Section title="Uncontrolled">
        <div className={styles.stack}>
          <Collapsible trigger="Powertrain Specifications" defaultOpen>
            Twin-turbocharged 3.0L V6 paired with three electric motors. Combined output of 1,200 PS
            with instant torque delivery from the hybrid system.
          </Collapsible>
          <Collapsible trigger="Active Aerodynamics">
            Adaptive front splitter, active rear wing, and underbody venturi tunnels. Over 1,000 kg
            of downforce at 250 km/h.
          </Collapsible>
        </div>
      </Section>

      {/* ── Controlled ────────────────────────────────────────────── */}
      <Section title="Controlled">
        <Stack gap="sm">
          <Collapsible
            trigger="Controlled toggle"
            open={controlledOpen}
            onOpenChange={setControlledOpen}
          >
            This section is controlled externally via the button below.
          </Collapsible>
          <div className={styles.row}>
            <Button variant="ghost" size="sm" onClick={() => setControlledOpen((v) => !v)}>
              {controlledOpen ? "Close" : "Open"} externally
            </Button>
          </div>
        </Stack>
      </Section>

      {/* ── Disabled ──────────────────────────────────────────────── */}
      <Section title="Disabled">
        <Collapsible trigger="Disabled section" disabled>
          This content should not be visible.
        </Collapsible>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Stack gap="xs">
          {[
            {
              trigger: "Suspension Settings",
              content: "Ride height: 55mm front, 72mm rear. Spring rate: 220 N/mm. Damper: 8/6.",
            },
            {
              trigger: "Brake Balance",
              content:
                "Front bias: 58%. Brake pressure: 85 bar. Duct opening: front 60%, rear 40%.",
            },
            {
              trigger: "ERS Configuration",
              content:
                "Deploy mode: Qualifying. Recovery target: 80%. Motor generator unit HP active.",
            },
          ].map((item) => (
            <Collapsible key={item.trigger} trigger={item.trigger}>
              {item.content}
            </Collapsible>
          ))}
        </Stack>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "trigger",
              type: "ReactNode",
              description: "The clickable header text or element.",
            },
            {
              name: "children",
              type: "ReactNode",
              description: "Content revealed when expanded.",
            },
            {
              name: "defaultOpen",
              type: "boolean",
              default: "false",
              description: "Initial open state (uncontrolled).",
            },
            {
              name: "open",
              type: "boolean",
              description: "Controlled open state.",
            },
            {
              name: "onOpenChange",
              type: "(open: boolean) => void",
              description: "Called when open state changes (controlled mode).",
            },
            {
              name: "disabled",
              type: "boolean",
              default: "false",
              description: "Prevents opening/closing.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Trigger", value: "button with aria-expanded" },
            { label: "Content", value: "aria-hidden=true when collapsed" },
            { label: "Animation", value: "Height animation respects prefers-reduced-motion" },
            { label: "Keyboard", value: "Enter/Space to toggle" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

CollapsiblePage.displayName = "CollapsiblePage";

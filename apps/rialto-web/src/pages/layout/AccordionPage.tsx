import { Accordion, DataList, Stack } from "@mbe/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AccordionPage() {
  return (
    <ComponentPageLayout
      name="Accordion"
      description="Spring-animated expanding panels. The chevron rotates with gentle spring physics. Single or multiple open modes."
    >
      {/* ── Single Mode ───────────────────────────────────────────── */}
      <Section title="Single Mode (default)">
        <Accordion
          items={[
            {
              id: "powertrain",
              title: "Powertrain",
              content:
                "Twin-turbocharged 3.0L V6 paired with three electric motors. Combined output of 1,200 PS with instant torque delivery from the hybrid system.",
            },
            {
              id: "aero",
              title: "Active Aerodynamics",
              content:
                "Adaptive front splitter, active rear wing, and underbody venturi tunnels. The system generates over 1,000kg of downforce at 250 km/h while maintaining a drag coefficient of 0.32.",
            },
            {
              id: "interior",
              title: "Interior",
              content:
                "Anodized aluminum surfaces replace traditional leather and plastic. A single piece of Gorilla Glass spans the instrument panel. Every physical control has been designed with distinct tactile feedback.",
            },
            {
              id: "production",
              title: "Production",
              disabled: true,
              content: null,
            },
          ]}
          defaultOpen={["powertrain"]}
        />
      </Section>

      {/* ── Multiple Mode ─────────────────────────────────────────── */}
      <Section title="Multiple Mode">
        <Accordion
          multiple
          items={[
            {
              id: "suspension",
              title: "Suspension Settings",
              content:
                "Ride height: 55mm front, 72mm rear. Spring rate: 220 N/mm. Damper: 8 clicks compression, 6 rebound.",
            },
            {
              id: "brakes",
              title: "Brake Balance",
              content:
                "Front bias: 58%. Brake pressure: 85 bar. Duct opening: front 60%, rear 40%.",
            },
            {
              id: "ers",
              title: "ERS Configuration",
              content:
                "Deploy mode: Qualifying. Recovery target: 80%. Motor generator unit HP active.",
            },
          ]}
          defaultOpen={["suspension", "brakes"]}
        />
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Stack gap="sm">
          <p
            style={{
              margin: 0,
              fontSize: "var(--rialto-text-sm)",
              color: "var(--rialto-text-secondary)",
            }}
          >
            Use <strong>single mode</strong> (default) for structured content where only one section
            is relevant at a time — FAQs, settings panels. Use <strong>multiple mode</strong> when
            users need to compare content across sections.
          </p>
        </Stack>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "items",
              type: "AccordionItem[]",
              description: "Array of accordion panels.",
            },
            {
              name: "multiple",
              type: "boolean",
              default: "false",
              description: "Allows multiple panels to be open simultaneously.",
            },
            {
              name: "defaultOpen",
              type: "string[]",
              description: "IDs of panels open by default (uncontrolled).",
            },
            {
              name: "value",
              type: "string[]",
              description: "Controlled open panel IDs.",
            },
            {
              name: "onValueChange",
              type: "(value: string[]) => void",
              description: "Called when open panels change.",
            },
          ]}
        />
      </Section>

      {/* ── AccordionItem Type ────────────────────────────────────── */}
      <Section title="AccordionItem Type">
        <PropsTable
          props={[
            {
              name: "id",
              type: "string",
              description: "Unique identifier.",
            },
            {
              name: "title",
              type: "string",
              description: "Panel header text.",
            },
            {
              name: "content",
              type: "ReactNode",
              description: "Panel body content.",
            },
            {
              name: "disabled",
              type: "boolean",
              description: "Prevents panel from opening.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Pattern", value: "WAI-ARIA Accordion pattern" },
            { label: "Trigger", value: "button with aria-expanded and aria-controls" },
            { label: "Panel", value: "role=region with aria-labelledby" },
            { label: "Keyboard", value: "Enter/Space to toggle, Tab to navigate" },
            {
              label: "Screen reader",
              value:
                "Each trigger announced as 'button' + expanded/collapsed state via aria-expanded; panel content announced when expanded; Enter/Space toggles",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

AccordionPage.displayName = "AccordionPage";

import { Button, DataList, Stack, Steps, Text } from "@mattbutlerengineering/rialto";
import { useState } from "react";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";
import styles from "../components/ComponentPageLayout.module.css";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const RACE_STEPS = [
  { label: "Scrutineering", description: "Technical inspection" },
  { label: "Free Practice", description: "Setup & data collection" },
  { label: "Qualifying", description: "Grid position" },
  { label: "Warm-up", description: "Final checks" },
  { label: "Race", description: "Lights out" },
];

export function StepsPage() {
  const [wizardStep, setWizardStep] = useState(2);
  const [onboardingStep, setOnboardingStep] = useState(1);

  return (
    <ComponentPageLayout
      name="Steps"
      description="Multi-step progress with connected nodes — gold fill for completed, glowing ring for current. Click any step to navigate. Horizontal and vertical orientations."
    >
      {/* ── Interactive ───────────────────────────────────────────── */}
      <Section title="Interactive">
        <Stack gap="md">
          <Steps steps={RACE_STEPS} currentStep={wizardStep} onStepClick={setWizardStep} />
          <div className={styles.row}>
            <Button
              variant="ghost"
              size="sm"
              disabled={wizardStep === 0}
              onClick={() => setWizardStep((s) => s - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={wizardStep === RACE_STEPS.length - 1}
              onClick={() => setWizardStep((s) => s + 1)}
            >
              Next Step
            </Button>
          </div>
        </Stack>
      </Section>

      {/* ── Vertical ──────────────────────────────────────────────── */}
      <Section title="Vertical Orientation">
        <Stack direction="row" gap="sm" align="start" wrap>
          <Steps
            orientation="vertical"
            steps={[
              { label: "Pre-season testing" },
              { label: "Race weekend" },
              { label: "Post-race debrief" },
              { label: "Development cycle" },
            ]}
            currentStep={1}
          />
          <Steps
            orientation="vertical"
            compact
            steps={[
              { label: "Upload telemetry" },
              { label: "Run analysis" },
              { label: "Generate report" },
              { label: "Share with team" },
            ]}
            currentStep={2}
          />
        </Stack>
      </Section>

      {/* ── Usage Example ─────────────────────────────────────────── */}
      <Section title="Usage Example">
        <Stack gap="md">
          <Text variant="label" color="primary">
            Team Registration Wizard
          </Text>
          <Steps
            steps={[
              { label: "Team Details", description: "Name and category" },
              { label: "Members", description: "Add drivers and staff" },
              { label: "Vehicles", description: "Register cars" },
              { label: "Review", description: "Confirm and submit" },
            ]}
            currentStep={onboardingStep}
            onStepClick={setOnboardingStep}
          />
          <div
            style={{
              padding: "var(--rialto-space-lg)",
              background: "var(--rialto-surface-recessed)",
              borderRadius: "var(--rialto-radius-soft)",
              minHeight: 80,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text variant="caption" color="tertiary">
              Step {onboardingStep + 1} content area
            </Text>
          </div>
          <div className={styles.row} style={{ justifyContent: "space-between" }}>
            <Button
              variant="ghost"
              size="sm"
              disabled={onboardingStep === 0}
              onClick={() => setOnboardingStep((s) => s - 1)}
            >
              Back
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setOnboardingStep((s) => Math.min(s + 1, 3))}
            >
              {onboardingStep === 3 ? "Submit" : "Continue"}
            </Button>
          </div>
        </Stack>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Props">
        <PropsTable
          props={[
            {
              name: "steps",
              type: "Array<{ label: string; description?: string }>",
              description: "Step definitions.",
            },
            {
              name: "currentStep",
              type: "number",
              description: "Zero-based index of the current step.",
            },
            {
              name: "onStepClick",
              type: "(index: number) => void",
              description: "Called when a completed step is clicked for navigation.",
            },
            {
              name: "orientation",
              type: '"horizontal" | "vertical"',
              default: '"horizontal"',
              description: "Layout direction.",
            },
            {
              name: "compact",
              type: "boolean",
              default: "false",
              description: "Reduced spacing between steps.",
            },
          ]}
        />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            { label: "Role", value: "role=list with role=listitem for each step" },
            { label: "State", value: "aria-current='step' on current step" },
            { label: "Completed", value: "Completed steps have role=button for click navigation" },
            { label: "Keyboard", value: "Tab to navigate between clickable steps" },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

StepsPage.displayName = "StepsPage";

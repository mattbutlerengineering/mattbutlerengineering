import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  DataList,
  Input,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Steps,
  Text,
  Toggle,
} from "@mattbutlerengineering/rialto";
import { CompositionNote, ExamplePageLayout } from "./ExamplePageLayout";
import {
  completionPercent,
  FIRST_STEP_INDEX,
  INITIAL_ONBOARDING_STATE,
  isFinalStep,
  launchSummary,
  ONBOARDING_STEPS,
  nextStep,
  previousStep,
  PROPERTY_TYPES,
  SPACE_PRESETS,
  type OnboardingState,
  type PropertyType,
} from "./onboarding";
import styles from "./OnboardingExamplePage.module.css";

/* ── Source snippet + composition notes ──────── */

const SOURCE_JSX = `const [index, setIndex] = useState(0);
const [answers, setAnswers] = useState(INITIAL_ONBOARDING_STATE);

<Text as="p" variant="label">Step {index + 1} of {ONBOARDING_STEPS.length}</Text>
<Progress value={completionPercent(index)} aria-label="Setup progress" size="sm" />
<Steps steps={ONBOARDING_STEPS} currentStep={index} orientation="vertical" />

<section aria-labelledby={HEADING_ID}>
  <Text as="h2" id={HEADING_ID} ref={headingRef} tabIndex={-1}>{step.heading}</Text>
  {/* one panel per step: property → spaces → preferences → launch */}
</section>

<Button variant="ghost" disabled={index === 0} onClick={() => setIndex(previousStep(index))}>
  Back
</Button>
<Button variant="primary" onClick={() => setIndex(nextStep(index))}>Next</Button>`;

const COMPOSITION_NOTES: ReactNode = (
  <Stack gap="sm">
    <CompositionNote>
      The rail is persistent: a vertical <code>Steps</code> list, a <code>Progress</code> bar, and a
      plain “Step 2 of 4” count stay on screen for the whole flow, so progress is legible three ways
      — position, proportion, and number — rather than by colour alone.
    </CompositionNote>
    <CompositionNote>
      Only one step renders at a time, but every answer lives in one piece of state above the
      panels, so <code>Back</code> returns to a step with its values intact. Advancing and
      retreating are the pure <code>nextStep</code> / <code>previousStep</code> functions in{" "}
      <code>onboarding.ts</code>, unit-tested without React; there are no network calls and no
      router coupling.
    </CompositionNote>
    <CompositionNote>
      Changing step moves focus to the new panel&apos;s heading, so screen-reader and keyboard users
      are told the step changed instead of being left at the button they just pressed. Focus never
      moves on first mount. Every colour, space, and radius comes from Rialto tokens, so the flow
      inherits light and dark themes untouched.
    </CompositionNote>
  </Stack>
);

/* ── Step panels ─────────────────────────────── */

interface PanelProps {
  answers: OnboardingState;
  onChange: (patch: Partial<OnboardingState>) => void;
}

function PropertyPanel({ answers, onChange }: PanelProps) {
  return (
    <Stack gap="lg">
      <Input
        label="Property name"
        value={answers.propertyName}
        onChange={(e) => onChange({ propertyName: e.target.value })}
      />
      <div className={styles.field}>
        <Text as="span" variant="label" color="secondary">
          Property type
        </Text>
        <SegmentedControl
          aria-label="Property type"
          segments={PROPERTY_TYPES}
          value={answers.propertyType}
          onChange={(id) => onChange({ propertyType: id as PropertyType })}
        />
      </div>
    </Stack>
  );
}

function SpacesPanel({ answers, onChange }: PanelProps) {
  return (
    <Select
      label="Spaces you offer"
      options={SPACE_PRESETS}
      value={answers.spacePreset}
      onChange={(spacePreset) => onChange({ spacePreset })}
    />
  );
}

function PreferencesPanel({ answers, onChange }: PanelProps) {
  return (
    <div className={styles.toggles}>
      <Toggle
        label="Instant booking"
        checked={answers.instantBooking}
        onCheckedChange={(instantBooking) => onChange({ instantBooking })}
      />
      <Toggle
        label="Require a deposit"
        checked={answers.requireDeposit}
        onCheckedChange={(requireDeposit) => onChange({ requireDeposit })}
      />
    </div>
  );
}

function LaunchPanel({ answers }: { answers: OnboardingState }) {
  return (
    <Stack gap="lg">
      {/* Announced on arrival — the flow's outcome, not just another panel. */}
      <div className={styles.launchStatus} role="status">
        <Badge variant="success" dot>
          Live
        </Badge>
      </div>
      <DataList items={launchSummary(answers)} orientation="horizontal" striped />
    </Stack>
  );
}

/* ── Page ────────────────────────────────────── */

const HEADING_ID = "onboarding-step-heading";

export function OnboardingExamplePage() {
  const [index, setIndex] = useState(FIRST_STEP_INDEX);
  const [answers, setAnswers] = useState<OnboardingState>(INITIAL_ONBOARDING_STATE);

  const headingRef = useRef<HTMLElement>(null);
  const announcedIndexRef = useRef(index);

  // Announce a step change by moving focus to the new panel's heading, so
  // keyboard and screen-reader users learn the step changed instead of being
  // left on the button they just pressed. The refs start in sync, so focus is
  // never stolen on first mount.
  useEffect(() => {
    if (announcedIndexRef.current === index) return;
    announcedIndexRef.current = index;
    headingRef.current?.focus();
  }, [index]);

  const step = ONBOARDING_STEPS[index]!;
  const patch = (next: Partial<OnboardingState>) =>
    setAnswers((previous) => ({ ...previous, ...next }));
  const handleRestart = () => {
    setAnswers(INITIAL_ONBOARDING_STATE);
    setIndex(FIRST_STEP_INDEX);
  };

  return (
    <ExamplePageLayout
      name="Onboarding"
      description="Four-step getting-started flow with a persistent progress rail, state-preserving back-navigation, and a launch state"
      sourceJsx={SOURCE_JSX}
      compositionNotes={COMPOSITION_NOTES}
    >
      <div className={styles.flow}>
        <aside className={styles.rail} aria-label="Setup">
          <Text as="p" variant="label" color="secondary">
            Step {index + 1} of {ONBOARDING_STEPS.length}
          </Text>
          <Progress value={completionPercent(index)} aria-label="Setup progress" size="sm" />
          {/* Steps repeats the count visually and marks completed steps with a check. */}
          <Steps steps={ONBOARDING_STEPS} currentStep={index} orientation="vertical" />
        </aside>

        <section className={styles.panelRegion} aria-labelledby={HEADING_ID}>
          <Card className={styles.panel}>
            <Stack gap="lg">
              <div className={styles.panelHead}>
                <Text as="h2" variant="display" id={HEADING_ID} ref={headingRef} tabIndex={-1}>
                  {step.heading}
                </Text>
                <Text variant="body" color="secondary">
                  {step.blurb}
                </Text>
              </div>
              {step.id === "property" && <PropertyPanel answers={answers} onChange={patch} />}
              {step.id === "spaces" && <SpacesPanel answers={answers} onChange={patch} />}
              {step.id === "preferences" && <PreferencesPanel answers={answers} onChange={patch} />}
              {step.id === "launch" && <LaunchPanel answers={answers} />}
            </Stack>
          </Card>

          <div className={styles.actions}>
            <Button
              variant="ghost"
              disabled={index === FIRST_STEP_INDEX}
              onClick={() => setIndex(previousStep(index))}
            >
              Back
            </Button>
            {isFinalStep(index) ? (
              <Button variant="secondary" onClick={handleRestart}>
                Start over
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setIndex(nextStep(index))}>
                Next
              </Button>
            )}
          </div>
        </section>
      </div>
    </ExamplePageLayout>
  );
}

OnboardingExamplePage.displayName = "OnboardingExamplePage";

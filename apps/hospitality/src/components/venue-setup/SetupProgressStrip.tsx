import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@mattbutlerengineering/rialto";
import type { SetupStep, VenueReadiness } from "../../hooks/useVenueReadiness.js";
import styles from "./VenueSetup.module.css";

const STEPS: readonly { readonly id: SetupStep }[] = [
  { id: "onboarding" },
  { id: "operating-hours" },
  { id: "floor-plan" },
];

export interface SetupProgressStripProps {
  readonly readiness: Pick<VenueReadiness, "completedSteps" | "nextStep">;
}

/**
 * Before launch, a Manager's three launch steps and where they stand. Status is text, not colour
 * alone. The first unset step's button is on the tree below (it is the primary action there).
 */
export function SetupProgressStrip({ readiness }: SetupProgressStripProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const stepLabel = (id: SetupStep) =>
    id === "onboarding"
      ? t("setup.hub.strip.steps.venueBasics")
      : id === "operating-hours"
        ? t("setup.hub.strip.steps.regularWeek")
        : t("setup.hub.strip.steps.floorPlan");
  const stateLabel = (state: "done" | "next" | "later") =>
    state === "done"
      ? t("setup.hub.strip.state.done")
      : state === "next"
        ? t("setup.hub.strip.state.next")
        : t("setup.hub.strip.state.later");
  const done = STEPS.filter((s) => readiness.completedSteps.includes(s.id)).length;

  return (
    <section className={styles.strip} aria-labelledby={headingId}>
      <div className={styles.stripHeader}>
        <Text as="h2" variant="label" id={headingId}>
          {t("setup.hub.strip.title")}
        </Text>
        <Text variant="caption" color="secondary">
          {t("setup.hub.strip.count", { done, total: STEPS.length })}
        </Text>
      </div>
      <ol className={styles.steps}>
        {STEPS.map((step) => {
          const state = readiness.completedSteps.includes(step.id)
            ? "done"
            : readiness.nextStep === step.id
              ? "next"
              : "later";
          return (
            <li key={step.id} className={styles.step}>
              <Text as="span" variant="caption">
                {stepLabel(step.id)}
              </Text>
              <Text as="span" variant="caption" color="secondary" className={styles.stepState}>
                {stateLabel(state)}
              </Text>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

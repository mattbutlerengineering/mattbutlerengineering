import { useTranslation } from "react-i18next";
import { ONBOARDING_STEPS } from "./onboarding-steps";
import styles from "./venue-onboarding.module.css";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  /** The highest step the user has reached — steps up to this value are navigable. */
  highestStepReached?: number;
  onStepClick?: (step: number) => void;
}

export function StepIndicator({
  currentStep,
  totalSteps,
  highestStepReached = currentStep,
  onStepClick,
}: StepIndicatorProps) {
  const { t } = useTranslation();
  return (
    <div
      className={styles.stepIndicator}
      role="navigation"
      aria-label={t("onboarding.progress.wizard")}
    >
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNumber = i + 1;
        const isActive = stepNumber === currentStep;
        const isCompleted = stepNumber < currentStep;
        const isReachable = stepNumber <= highestStepReached && stepNumber !== currentStep;
        const isClickable = isReachable && onStepClick;

        const dotClass = isActive
          ? styles.stepDotActive
          : isCompleted
            ? styles.stepDotCompleted
            : isReachable
              ? styles.stepDotReachable
              : styles.stepDotPending;

        const dotProps = isClickable
          ? {
              role: "link" as const,
              tabIndex: 0,
              onClick: () => onStepClick(stepNumber),
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onStepClick(stepNumber);
                }
              },
              style: { cursor: "pointer" },
            }
          : {};

        const stepId = ONBOARDING_STEPS[i]?.id;
        const label = stepId ? t(`onboarding.steps.${stepId}.label`) : "";
        const ariaLabel = t(
          isClickable ? "onboarding.progress.stepLabelNavigable" : "onboarding.progress.stepLabel",
          { step: stepNumber, label }
        );

        return (
          <span key={stepNumber} style={{ display: "contents" }}>
            <span
              className={`${styles.stepDot} ${dotClass}`}
              aria-current={isActive ? "step" : undefined}
              aria-label={ariaLabel}
              {...dotProps}
            >
              {isCompleted ? "\u2713" : stepNumber}
            </span>
            {stepNumber < totalSteps && (
              <span
                className={`${styles.stepConnector} ${stepNumber < highestStepReached ? styles.stepConnectorCompleted : ""}`}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

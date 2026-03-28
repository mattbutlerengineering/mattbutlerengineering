import styles from "./venue-onboarding.module.css";

const STEP_LABELS = ["Info", "Location", "Hours", "Settings", "Review"];

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return (
    <div className={styles.stepIndicator} role="navigation" aria-label="Wizard progress">
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNumber = i + 1;
        const isActive = stepNumber === currentStep;
        const isCompleted = stepNumber < currentStep;

        const dotClass = isActive
          ? styles.stepDotActive
          : isCompleted
            ? styles.stepDotCompleted
            : styles.stepDotPending;

        return (
          <span key={stepNumber} style={{ display: "contents" }}>
            <span
              className={`${styles.stepDot} ${dotClass}`}
              aria-current={isActive ? "step" : undefined}
              aria-label={`Step ${stepNumber}: ${STEP_LABELS[i] ?? ""}`}
            >
              {isCompleted ? "\u2713" : stepNumber}
            </span>
            {stepNumber < totalSteps && (
              <span
                className={`${styles.stepConnector} ${isCompleted ? styles.stepConnectorCompleted : ""}`}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

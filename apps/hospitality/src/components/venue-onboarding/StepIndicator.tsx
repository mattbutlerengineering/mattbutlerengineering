import styles from "./venue-onboarding.module.css";

const STEP_LABELS = ["Info", "Location", "Hours", "Settings", "Review"];

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  onStepClick?: (step: number) => void;
}

export function StepIndicator({ currentStep, totalSteps, onStepClick }: StepIndicatorProps) {
  return (
    <div className={styles.stepIndicator} role="navigation" aria-label="Wizard progress">
      {Array.from({ length: totalSteps }, (_, i) => {
        const stepNumber = i + 1;
        const isActive = stepNumber === currentStep;
        const isCompleted = stepNumber < currentStep;
        const isClickable = isCompleted && onStepClick;

        const dotClass = isActive
          ? styles.stepDotActive
          : isCompleted
            ? styles.stepDotCompleted
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

        return (
          <span key={stepNumber} style={{ display: "contents" }}>
            <span
              className={`${styles.stepDot} ${dotClass}`}
              aria-current={isActive ? "step" : undefined}
              aria-label={`Step ${stepNumber}: ${STEP_LABELS[i] ?? ""}${isClickable ? " (click to edit)" : ""}`}
              {...dotProps}
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

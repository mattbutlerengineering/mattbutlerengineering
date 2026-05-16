import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useVenueReadiness } from "../hooks/useVenueReadiness.js";
import { useVenue } from "../contexts/VenueContext.js";
import { PageHeader } from "../components/PageHeader.js";
import styles from "./SetupPage.module.css";

const STEP_CONFIG = [
  {
    id: "onboarding" as const,
    label: "Venue Basics",
    description: "Set up your venue name, timezone, and currency.",
    path: "/onboarding",
    ctaLabel: "Review Venue Details",
  },
  {
    id: "operating-hours" as const,
    label: "Set Operating Hours",
    description: "Configure which days and hours your venue is open.",
    path: "/setup/hours",
    ctaLabel: "Set Operating Hours",
  },
  {
    id: "floor-plan" as const,
    label: "Create Floor Plan",
    description: "Add a floor plan with at least one table to enable reservations.",
    path: "/floor-plans",
    ctaLabel: "Create Floor Plan",
  },
];

export function SetupPage() {
  const navigate = useNavigate();
  const readiness = useVenueReadiness();
  const { selectedVenue } = useVenue();

  // Auto-redirect to timeline when fully operational
  useEffect(() => {
    if (readiness.status === "operational") {
      navigate("/timeline", { replace: true });
    }
  }, [readiness.status, navigate]);

  const venueName = selectedVenue?.name ?? "your venue";

  return (
    <div className={styles.root}>
      <PageHeader
        title={`Welcome to ${venueName}`}
        description="Complete a few setup steps to start taking reservations."
      />

      <div className={styles.progressBar} role="progressbar" aria-valuenow={readiness.progress} aria-valuemin={0} aria-valuemax={100}>
        <div className={styles.progressFill} style={{ width: `${readiness.progress}%` }} />
      </div>
      <p className={styles.progressLabel}>{readiness.progress}% complete</p>

      <ol className={styles.stepList} aria-label="Setup steps">
        {STEP_CONFIG.map((step) => {
          const isCompleted = readiness.completedSteps.includes(step.id);
          const isCurrent = readiness.nextStep === step.id;

          let statusLabel: string;
          let stepClass: string;
          if (isCompleted) {
            statusLabel = "Completed";
            stepClass = styles.stepCompleted;
          } else if (isCurrent) {
            statusLabel = "Current step";
            stepClass = styles.stepCurrent;
          } else {
            statusLabel = "Not yet available";
            stepClass = styles.stepLocked;
          }

          return (
            <li key={step.id} className={`${styles.step} ${stepClass}`} aria-label={`${step.label} — ${statusLabel}`}>
              <div className={styles.stepIcon} aria-hidden="true">
                {isCompleted ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : isCurrent ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
              </div>

              <div className={styles.stepContent}>
                <h2 className={styles.stepTitle}>{step.label}</h2>
                <p className={styles.stepDescription}>{step.description}</p>

                {isCurrent && (
                  <button
                    type="button"
                    className={styles.ctaButton}
                    onClick={() => navigate(step.path)}
                  >
                    {step.ctaLabel}
                  </button>
                )}
                {isCompleted && (
                  <button
                    type="button"
                    className={styles.reviewButton}
                    onClick={() => navigate(step.path)}
                  >
                    Review
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

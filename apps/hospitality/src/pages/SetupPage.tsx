import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useVenueReadiness } from "../hooks/useVenueReadiness.js";
import { useVenue } from "../contexts/VenueContext.js";
import { PageHeader } from "../components/PageHeader.js";
import styles from "./SetupPage.module.css";

const STEP_CONFIG = [
  {
    id: "onboarding" as const,
    labelKey: "setup.steps.onboarding.label" as const,
    descriptionKey: "setup.steps.onboarding.description" as const,
    path: "/onboarding",
    ctaKey: "setup.steps.onboarding.cta" as const,
    // No read-only review view exists yet — /onboarding is create-only, so
    // routing "Review" there re-opens the wizard on a blank Step 1 instead
    // of showing what was already saved (#4984). Render a static Done row
    // for the completed state until a review view exists.
    reviewPath: null,
  },
  {
    id: "operating-hours" as const,
    labelKey: "setup.steps.hours.label" as const,
    descriptionKey: "setup.steps.hours.description" as const,
    path: "/setup/hours",
    ctaKey: "setup.steps.hours.cta" as const,
    reviewPath: "/setup/hours",
  },
  {
    id: "floor-plan" as const,
    labelKey: "setup.steps.floorPlan.label" as const,
    descriptionKey: "setup.steps.floorPlan.description" as const,
    path: "/floor-plans",
    ctaKey: "setup.steps.floorPlan.cta" as const,
    reviewPath: "/floor-plans",
  },
];

export function SetupPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const readiness = useVenueReadiness();
  const { selectedVenue } = useVenue();

  // Auto-redirect to timeline when fully operational.
  // Same useEffect-redirect class as #3889 (DashboardLayout), but lower
  // severity: SetupPage is only reached once already inside DashboardLayout's
  // chrome (which is itself gated correctly now), so this only flashes the
  // setup step list, not the dashboard shell around a not-yet-verified
  // state. Scoped out of #3889 rather than converting to a render-time
  // <Navigate> here, since this component's tests mock react-router with
  // only `useNavigate` — converting would require updating that mock too,
  // which is out of this issue's stated file list.
  useEffect(() => {
    if (readiness.status === "operational") {
      navigate("/timeline", { replace: true });
    }
  }, [readiness.status, navigate]);

  const venueName = selectedVenue?.name ?? t("setup.yourVenue");

  return (
    <div className={styles.root}>
      <PageHeader title={t("setup.welcome", { venueName })} description={t("setup.intro")} />

      <div
        className={styles.progressBar}
        role="progressbar"
        aria-valuenow={readiness.progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={styles.progressFill} style={{ width: `${readiness.progress}%` }} />
      </div>
      <p className={styles.progressLabel}>{t("setup.progress", { percent: readiness.progress })}</p>

      <ol className={styles.stepList} aria-label={t("setup.stepsLabel")}>
        {STEP_CONFIG.map((step) => {
          const isCompleted = readiness.completedSteps.includes(step.id);
          const isCurrent = readiness.nextStep === step.id;

          let statusLabel: string;
          let stepClass: string;
          if (isCompleted) {
            statusLabel = t("setup.status.completed");
            stepClass = styles.stepCompleted ?? "";
          } else if (isCurrent) {
            statusLabel = t("setup.status.current");
            stepClass = styles.stepCurrent ?? "";
          } else {
            statusLabel = t("setup.status.locked");
            stepClass = styles.stepLocked ?? "";
          }

          return (
            <li
              key={step.id}
              className={`${styles.step} ${stepClass}`}
              aria-label={t("setup.stepAria", { label: t(step.labelKey), status: statusLabel })}
            >
              <div className={styles.stepIcon} aria-hidden="true">
                {isCompleted ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : isCurrent ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                ) : (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
              </div>

              <div className={styles.stepContent}>
                <h2 className={styles.stepTitle}>{t(step.labelKey)}</h2>
                <p className={styles.stepDescription}>{t(step.descriptionKey)}</p>

                {isCurrent && (
                  <button
                    type="button"
                    className={styles.ctaButton}
                    onClick={() => navigate(step.path)}
                  >
                    {t(step.ctaKey)}
                  </button>
                )}
                {isCompleted && step.reviewPath && (
                  <button
                    type="button"
                    className={styles.reviewButton}
                    onClick={() => navigate(step.reviewPath)}
                  >
                    {t("setup.review")}
                  </button>
                )}
                {isCompleted && !step.reviewPath && (
                  <p className={styles.doneLabel}>{t("setup.done", { venueName })}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Alert, Button } from "@mattbutlerengineering/rialto";
import { rehearsalNavigation } from "./rehearsal-route";
import { useOnboardingAlertDismissal } from "./use-onboarding-alert-dismissal";

export interface OnboardingRehearsalAlertProps {
  venueId: string;
  floorPlanId: string;
  /** The alert is for a room with tables; an empty plan has nothing to rehearse on. */
  hasTables: boolean;
}

function cameFromOnboarding(state: unknown): boolean {
  return typeof state === "object" && state !== null && "fromOnboarding" in state
    ? state.fromOnboarding === true
    : false;
}

/** The floor plan editor's one-time offer to run a Friday night, right after Launch. */
export function OnboardingRehearsalAlert({
  venueId,
  floorPlanId,
  hasTables,
}: OnboardingRehearsalAlertProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [dismissed, dismiss] = useOnboardingAlertDismissal(venueId);

  if (!cameFromOnboarding(location.state) || !hasTables || dismissed) return null;

  return (
    <Alert
      variant="info"
      title={t("rehearsal.onboardingAlert.title")}
      dismissible
      onDismiss={dismiss}
      actions={
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(...rehearsalNavigation({ profile: "friday", floorPlanId }))}
        >
          {t("rehearsal.cta.run")}
        </Button>
      }
    >
      {t("rehearsal.onboardingAlert.body")}
    </Alert>
  );
}

import { useState } from "react";

export const onboardingAlertKey = (venueId: string): string =>
  `rehearsal.onboardingAlert.dismissed.${venueId}`;

function readDismissed(venueId: string): boolean {
  try {
    return localStorage.getItem(onboardingAlertKey(venueId)) === "1";
  } catch {
    // Storage blocked (private window, cleared site data): the alert simply shows again.
    return false;
  }
}

/**
 * Per-venue, per-browser dismissal of the onboarding alert. A convenience, not state: every
 * storage access is guarded, and when storage fails dismissal lasts for the mounted page only.
 */
export function useOnboardingAlertDismissal(venueId: string): readonly [boolean, () => void] {
  const [dismissed, setDismissed] = useState(() => readDismissed(venueId));
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(onboardingAlertKey(venueId), "1");
    } catch {
      // See readDismissed: nothing depends on the write landing.
    }
  };
  return [dismissed, dismiss];
}

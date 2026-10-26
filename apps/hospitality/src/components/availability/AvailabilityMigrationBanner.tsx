import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@mattbutlerengineering/rialto";

const storageKey = (venueId: string) => `mbe-availability-migration-banner:${venueId}`;

function wasDismissed(venueId: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(venueId)) === "dismissed";
  } catch {
    // Storage can be blocked (private mode); the banner then shows each visit, which is harmless.
    return false;
  }
}

/** Not remembered when storage is blocked: the banner is then hidden for this visit only. */
function remember(venueId: string): boolean {
  try {
    window.localStorage.setItem(storageKey(venueId), "dismissed");
    return true;
  } catch {
    return false;
  }
}

/**
 * F11: a venue whose hours still come from the legacy column (`source: "legacy"`) is told once
 * that they were carried over unchanged. Dismissal is remembered per venue on this device; the
 * first save writes the hours as rows, after which the page stops rendering this at all.
 */
export function AvailabilityMigrationBanner({ venueId }: { readonly venueId: string }) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => wasDismissed(venueId));
  if (dismissed) return null;

  const dismiss = () => {
    remember(venueId);
    setDismissed(true);
  };

  return (
    <Alert variant="info" dismissible onDismiss={dismiss}>
      {t("availability.migrationBanner")}
    </Alert>
  );
}

import { useState } from "react";
import type { AvailabilityConfigSaveResult } from "@mbe/types";

/**
 * Whether the config on hand is behind a save this drawer made, or may be about to be. A draft
 * made on it would be checked against the old version and refused as a conflict with the
 * Manager's own save, so editing waits. Comparing versions rather than watching the query covers
 * a reload in flight and a failed one alike, and the Retry beside a failed one is what ends it.
 */
export function useReloadHold(venueId: string | undefined, version: number | undefined) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ venueId: string | undefined; version: number } | null>(null);

  const onOwnSave = (save: Promise<AvailabilityConfigSaveResult | null>) => {
    setSaving(true);
    void save.then(
      (result) => {
        setSaving(false);
        if (result) setSaved({ venueId, version: result.version });
      },
      // The save's own caller reports the refusal; it moved nothing, so there is nothing to wait for.
      () => setSaving(false)
    );
  };

  const reloadDue =
    saved !== null && saved.venueId === venueId && version !== undefined && saved.version > version;

  return { behind: saving || reloadDue, onOwnSave };
}

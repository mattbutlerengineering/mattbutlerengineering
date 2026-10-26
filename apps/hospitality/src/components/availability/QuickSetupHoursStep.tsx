import { useState } from "react";
import { Text } from "@mattbutlerengineering/rialto";
import type { OperatingHours } from "@mbe/types";
import type { OperatingHoursValidationErrors } from "../venue-onboarding/OperatingHoursStep.js";
import { QuickSetupForm } from "./QuickSetupForm.js";
import {
  draftFromLegacyHours,
  draftToLegacyHours,
  validateDraft,
  type QuickSetupDraft,
} from "./quick-setup-draft.js";

interface QuickSetupHoursStepProps {
  readonly data: OperatingHours;
  /** The wizard's "at least one day open" gate. */
  readonly errors?: OperatingHoursValidationErrors;
  readonly onChange: (hours: OperatingHours) => void;
}

/**
 * F-ONB: the wizard's hours step is the quick-setup form, unchanged. The venue does not exist
 * yet, so there is no config to save; the wizard keeps the legacy `operatingHours` shape the
 * create call sends, and the server reads it back as the venue's regular week. An incomplete
 * or invalid draft reports no hours, so Next stays gated until the card is right.
 */
export function QuickSetupHoursStep({ data, errors, onChange }: QuickSetupHoursStepProps) {
  const [draft, setDraft] = useState<QuickSetupDraft>(() =>
    draftFromLegacyHours(data, crypto.randomUUID())
  );
  const [touched, setTouched] = useState(false);
  const issues = validateDraft(draft);

  const handleChange = (next: QuickSetupDraft) => {
    setDraft(next);
    setTouched(true);
    onChange(validateDraft(next).length === 0 ? draftToLegacyHours(next) : {});
  };

  return (
    <>
      {[errors?.global, ...Object.values(errors?.days ?? {})].map(
        (message) =>
          message && (
            <Text key={message} variant="caption" color="error" role="alert">
              {message}
            </Text>
          )
      )}
      <QuickSetupForm draft={draft} onChange={handleChange} issues={touched ? issues : []} />
    </>
  );
}

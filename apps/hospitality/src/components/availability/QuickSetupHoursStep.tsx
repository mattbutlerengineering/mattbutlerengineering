import { useState } from "react";
import { Text } from "@mattbutlerengineering/rialto";
import type { OperatingHoursValidationErrors } from "../venue-onboarding/OperatingHoursStep.js";
import { QuickSetupForm } from "./QuickSetupForm.js";
import { validateDraft, type QuickSetupDraft, type QuickSetupIssue } from "./quick-setup-draft.js";

interface QuickSetupHoursStepProps {
  /** Owned by the wizard so Back/Next remounts this step without dropping names. */
  readonly draft: QuickSetupDraft;
  /** Set when Next rejected the step. Field errors stay visible after that. */
  readonly errors?: OperatingHoursValidationErrors;
  readonly onChange: (draft: QuickSetupDraft) => void;
}

function sameDays(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a);
  return b.every((day) => left.has(day));
}

/**
 * F-ONB: the wizard's hours step is the quick-setup form. The venue does not exist yet, so the
 * wizard derives the legacy `operatingHours` the create call sends. The draft itself (service
 * names, several services, a custom last seating) lives in wizard state — legacy hours have no
 * name, and rebuilding from them on remount wiped the Service name field.
 *
 * A service's own errors show after that service is edited, or after Next. Adding a service
 * does not count as editing it. Day errors also show once any service has been edited, which
 * is how choosing Dinner with no days open reports "Choose at least one day."
 */
export function QuickSetupHoursStep({ draft, errors, onChange }: QuickSetupHoursStepProps) {
  const [editedServices, setEditedServices] = useState<ReadonlySet<string>>(() => new Set());
  const [daysEdited, setDaysEdited] = useState(false);
  const [attempted, setAttempted] = useState(false);
  if (errors != null && !attempted) setAttempted(true);

  const issues = validateDraft(draft, { legacyReader: true });

  const handleChange = (next: QuickSetupDraft) => {
    const previous = new Map(draft.services.map((service) => [service.id, service]));
    const edited = new Set(editedServices);
    for (const service of next.services) {
      const prior = previous.get(service.id);
      if (prior && prior !== service) edited.add(service.id);
    }
    for (const id of edited) {
      if (!next.services.some((service) => service.id === id)) edited.delete(id);
    }
    setEditedServices(edited);
    if (!sameDays(draft.days, next.days)) setDaysEdited(true);
    onChange(next);
  };

  const showService = (id: string | null) => attempted || (id !== null && editedServices.has(id));
  const showDays = attempted || daysEdited || editedServices.size > 0;
  const visible = issues.filter((issue: QuickSetupIssue) =>
    issue.field === "days" ? showDays : showService(issue.serviceId)
  );

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
      <QuickSetupForm draft={draft} onChange={handleChange} issues={visible} />
    </>
  );
}

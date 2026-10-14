import { useState, type FormEvent } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Card,
  Collapsible,
  Input,
  NumberInput,
  SegmentedControl,
  TextArea,
} from "@mattbutlerengineering/rialto";
import type { Driver } from "./DriverContext";
import styles from "./DriverForm.module.css";

const TEAM_OPTIONS = [
  { value: "Ferrari", label: "Ferrari" },
  { value: "Red Bull Racing", label: "Red Bull Racing" },
  { value: "McLaren", label: "McLaren" },
  { value: "Mercedes", label: "Mercedes" },
  { value: "Williams", label: "Williams" },
  { value: "Alpine", label: "Alpine" },
  { value: "Aston Martin", label: "Aston Martin" },
  { value: "Haas", label: "Haas" },
  { value: "RB", label: "RB" },
  { value: "Sauber", label: "Sauber" },
];

const STATUS_SEGMENTS = [
  { id: "active", label: "Active" },
  { id: "reserve", label: "Reserve" },
  { id: "retired", label: "Retired" },
];

/** The editable slice of a {@link Driver} — what the form collects and saves. */
export type DriverFormValues = Pick<
  Driver,
  "name" | "number" | "team" | "nationality" | "status" | "bio" | "dob"
>;

type FormField = "name" | "number" | "team" | "nationality";
type FieldErrors = Partial<Record<FormField, string>>;

/** Local form state: the car number is `null` until the user enters one. */
interface DraftState {
  name: string;
  number: number | null;
  team: string;
  nationality: string;
  status: Driver["status"];
  bio: string;
  dob: string;
}

const EMPTY_DRAFT: DraftState = {
  name: "",
  number: null,
  team: "",
  nationality: "",
  status: "active",
  bio: "",
  dob: "",
};

function validateField(field: FormField, draft: DraftState): string | undefined {
  switch (field) {
    case "name":
      return draft.name.trim() ? undefined : "Name is required.";
    case "number":
      return draft.number !== null && draft.number >= 1 && draft.number <= 99
        ? undefined
        : "Must be between 1 and 99.";
    case "team":
      return draft.team ? undefined : "Team is required.";
    case "nationality":
      return draft.nationality.trim() ? undefined : "Nationality is required.";
  }
}

const VALIDATED_FIELDS: FormField[] = ["name", "number", "team", "nationality"];

function validateAll(draft: DraftState): FieldErrors {
  return VALIDATED_FIELDS.reduce<FieldErrors>((errs, field) => {
    const msg = validateField(field, draft);
    return msg ? { ...errs, [field]: msg } : errs;
  }, {});
}

function draftFrom(initial?: Partial<DriverFormValues>): DraftState {
  return {
    name: initial?.name ?? EMPTY_DRAFT.name,
    number: initial?.number ?? EMPTY_DRAFT.number,
    team: initial?.team ?? EMPTY_DRAFT.team,
    nationality: initial?.nationality ?? EMPTY_DRAFT.nationality,
    status: initial?.status ?? EMPTY_DRAFT.status,
    bio: initial?.bio ?? EMPTY_DRAFT.bio,
    dob: initial?.dob ?? EMPTY_DRAFT.dob,
  };
}

function isDirtyAgainst(draft: DraftState, initial?: Partial<DriverFormValues>): boolean {
  const baseline = draftFrom(initial);
  return (Object.keys(baseline) as (keyof DraftState)[]).some((k) => draft[k] !== baseline[k]);
}

interface DriverFormProps {
  /** Starting values; omit for a blank create form. */
  initial?: Partial<DriverFormValues>;
  submitLabel: string;
  submittingLabel: string;
  /** When true, Save stays disabled and an "unsaved changes" notice shows until the draft differs. */
  requireChanges?: boolean;
  /** Placeholders on name/nationality (create flow only). */
  showPlaceholders?: boolean;
  /** Called with validated, normalized values. */
  onSubmit: (values: DriverFormValues) => void;
  /** Called with whether the draft has unsaved changes. */
  onCancel: (isDirty: boolean) => void;
}

/** Shared create/update driver form: every validated field renders its error. */
export function DriverForm({
  initial,
  submitLabel,
  submittingLabel,
  requireChanges = false,
  showPlaceholders = false,
  onSubmit,
  onCancel,
}: DriverFormProps) {
  const [draft, setDraft] = useState<DraftState>(() => draftFrom(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const isDirty = isDirtyAgainst(draft, initial);

  function update(patch: Partial<DraftState>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    // Editing a field retires its stale error; the next blur/submit re-checks.
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !(k in patch))));
  }

  function blur(field: FormField) {
    const msg = validateField(field, draft);
    setErrors((prev) => {
      const { [field]: _removed, ...rest } = prev;
      return msg ? { ...rest, [field]: msg } : rest;
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validateAll(draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    onSubmit({
      name: draft.name.trim(),
      number: draft.number as number, // validated above: non-null, 1-99
      team: draft.team,
      nationality: draft.nationality.trim(),
      status: draft.status,
      bio: draft.bio.trim() || undefined,
      dob: draft.dob || undefined,
    });
  }

  return (
    <Card variant="elevated" className={styles.formCard}>
      {requireChanges && isDirty && (
        <Alert variant="info" title="Unsaved changes">
          You have unsaved changes. Save or discard before leaving.
        </Alert>
      )}

      {/* noValidate: the form owns validation so every error renders inline,
          instead of the browser's native bubble pre-empting it. */}
      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <div className={styles.fieldRow}>
          <Input
            label="Full Name"
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            onBlur={() => blur("name")}
            error={!!errors.name}
            hint={errors.name}
            required
            placeholder={showPlaceholders ? "e.g. Charles Leclerc" : undefined}
          />
          <NumberInput
            label="Car Number"
            // NumberInput is number-typed, but its native <input type="number">
            // renders "" as empty — the car number starts blank, not 0.
            value={(draft.number ?? "") as number}
            onChange={(number) => update({ number })}
            min={1}
            max={99}
            error={!!errors.number}
            hint={errors.number}
            required
          />
        </div>

        <div className={styles.fieldRow}>
          <Autocomplete
            label="Team"
            options={TEAM_OPTIONS}
            value={draft.team}
            onChange={(team) => update({ team })}
            onSelect={(opt) => update({ team: opt.value })}
            aria-invalid={errors.team ? true : undefined}
            hint={errors.team}
            required
            emptyText="No matching teams"
          />
          <Input
            label="Nationality"
            value={draft.nationality}
            onChange={(e) => update({ nationality: e.target.value })}
            onBlur={() => blur("nationality")}
            error={!!errors.nationality}
            hint={errors.nationality}
            required
            placeholder={showPlaceholders ? "e.g. Monégasque" : undefined}
          />
        </div>

        <SegmentedControl
          segments={STATUS_SEGMENTS}
          value={draft.status}
          onChange={(v) => update({ status: v as Driver["status"] })}
        />

        <Collapsible trigger="Additional Details" defaultOpen={false}>
          <div className={styles.form}>
            <Input
              label="Date of Birth"
              type="date"
              value={draft.dob}
              onChange={(e) => update({ dob: e.target.value })}
            />
            <TextArea
              label="Bio"
              value={draft.bio}
              onChange={(e) => update({ bio: e.target.value })}
              autoResize
              maxLength={500}
              showOptional
              hint="Brief career summary"
            />
          </div>
        </Collapsible>

        <div className={styles.formActions}>
          <Button variant="secondary" type="button" onClick={() => onCancel(isDirty)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={(requireChanges && !isDirty) || submitting}
          >
            {submitting ? submittingLabel : submitLabel}
          </Button>
        </div>
      </form>
    </Card>
  );
}

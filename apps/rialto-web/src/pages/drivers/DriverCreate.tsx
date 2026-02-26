import { useState, useCallback, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useDrivers } from "./DriverContext";
import { DriverLayout } from "./DriverLayout";
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
  useToast,
} from "@mbe/rialto";
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

type FieldErrors = Record<string, string>;

function validateField(field: string, value: unknown): string | undefined {
  switch (field) {
    case "name":
      return !(value as string).trim() ? "Name is required." : undefined;
    case "number":
      return (value as number) < 1 || (value as number) > 99
        ? "Must be between 1 and 99."
        : undefined;
    case "team":
      return !(value as string) ? "Team is required." : undefined;
    case "nationality":
      return !(value as string).trim() ? "Nationality is required." : undefined;
    default:
      return undefined;
  }
}

export function DriverCreate() {
  const { addDriver } = useDrivers();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [number, setNumber] = useState(0);
  const [team, setTeam] = useState("");
  const [nationality, setNationality] = useState("");
  const [status, setStatus] = useState<"active" | "reserve" | "retired">("active");
  const [bio, setBio] = useState("");
  const [dob, setDob] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleBlur = useCallback((field: string, value: unknown) => {
    const msg = validateField(field, value);
    setErrors((prev) => {
      const next = { ...prev };
      if (msg) next[field] = msg;
      else delete next[field];
      return next;
    });
  }, []);

  function validateAll(): FieldErrors {
    const errs: FieldErrors = {};
    const fields: [string, unknown][] = [
      ["name", name],
      ["number", number],
      ["team", team],
      ["nationality", nationality],
    ];
    for (const [field, value] of fields) {
      const msg = validateField(field, value);
      if (msg) errs[field] = msg;
    }
    return errs;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validateAll();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    setErrors({});

    // Simulate network delay
    setTimeout(() => {
      const driver = addDriver({
        name: name.trim(),
        number,
        team,
        nationality: nationality.trim(),
        status,
        points: 0,
        wins: 0,
        podiums: 0,
      });

      toast({ title: `${driver.name} added`, variant: "success" });
      navigate(`/drivers/${driver.id}`);
    }, 400);
  }

  return (
    <DriverLayout
      title="Add Driver"
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Drivers", href: "/drivers" },
        { label: "Add Driver" },
      ]}
    >
      <Card variant="elevated" className={styles.formCard}>
        <form onSubmit={handleSubmit} className={styles.form}>
          {submitError && (
            <Alert variant="error" title="Error">
              {submitError}
            </Alert>
          )}

          <div className={styles.fieldRow}>
            <Input
              label="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => handleBlur("name", name)}
              error={!!errors.name}
              hint={errors.name}
              required
              placeholder="e.g. Charles Leclerc"
            />
            <NumberInput label="Car Number" value={number} onChange={setNumber} min={1} max={99} />
          </div>

          <div className={styles.fieldRow}>
            <Autocomplete
              label="Team"
              options={TEAM_OPTIONS}
              value={team}
              onChange={setTeam}
              onSelect={(opt) => setTeam(opt.value)}
              emptyText="No matching teams"
            />
            <Input
              label="Nationality"
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              onBlur={() => handleBlur("nationality", nationality)}
              error={!!errors.nationality}
              hint={errors.nationality}
              required
              placeholder="e.g. Monégasque"
            />
          </div>

          <SegmentedControl
            segments={STATUS_SEGMENTS}
            value={status}
            onChange={(v) => setStatus(v as "active" | "reserve" | "retired")}
          />

          <Collapsible trigger="Additional Details" defaultOpen={false}>
            <div className={styles.form}>
              <Input
                label="Date of Birth"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
              <TextArea
                label="Bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                autoResize
                maxLength={500}
                showOptional
                hint="Brief career summary"
              />
            </div>
          </Collapsible>

          <div className={styles.formActions}>
            <Button variant="secondary" type="button" onClick={() => navigate("/drivers")}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? "Adding..." : "Add Driver"}
            </Button>
          </div>
        </form>
      </Card>
    </DriverLayout>
  );
}

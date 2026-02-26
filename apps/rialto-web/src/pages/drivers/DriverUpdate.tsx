import { useState, useMemo, useCallback, type FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDrivers } from "./DriverContext";
import { DriverLayout } from "./DriverLayout";
import {
  Alert,
  Autocomplete,
  Button,
  Card,
  Collapsible,
  ConfirmDialog,
  EmptyState,
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

export function DriverUpdate() {
  const { id } = useParams<{ id: string }>();
  const { getDriver, updateDriver } = useDrivers();
  const { toast } = useToast();
  const navigate = useNavigate();

  const driver = getDriver(id ?? "");

  const [name, setName] = useState(driver?.name ?? "");
  const [number, setNumber] = useState(driver?.number ?? 0);
  const [team, setTeam] = useState(driver?.team ?? "");
  const [nationality, setNationality] = useState(driver?.nationality ?? "");
  const [status, setStatus] = useState<"active" | "reserve" | "retired">(
    driver?.status ?? "active"
  );
  const [bio, setBio] = useState("");
  const [dob, setDob] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [discardDialog, setDiscardDialog] = useState(false);

  const isDirty = useMemo(() => {
    if (!driver) return false;
    return (
      name !== driver.name ||
      number !== driver.number ||
      team !== driver.team ||
      nationality !== driver.nationality ||
      status !== driver.status ||
      bio !== "" ||
      dob !== ""
    );
  }, [driver, name, number, team, nationality, status, bio, dob]);

  const handleBlur = useCallback((field: string, value: unknown) => {
    const msg = validateField(field, value);
    setErrors((prev) => {
      const next = { ...prev };
      if (msg) next[field] = msg;
      else delete next[field];
      return next;
    });
  }, []);

  if (!driver) {
    return (
      <DriverLayout
        title="Driver Not Found"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Drivers", href: "/drivers" },
          { label: "Not Found" },
        ]}
      >
        <EmptyState
          title="Driver not found"
          description="This driver may have been removed or the link is invalid."
          action={
            <Button variant="primary" size="sm" onClick={() => navigate("/drivers")}>
              View All Drivers
            </Button>
          }
        />
      </DriverLayout>
    );
  }

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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validateAll();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    setErrors({});

    setTimeout(() => {
      updateDriver(driver.id, {
        name: name.trim(),
        number,
        team,
        nationality: nationality.trim(),
        status,
      });

      toast({ title: `${name.trim()} updated`, variant: "success" });
      navigate(`/drivers/${driver.id}`);
    }, 400);
  };

  const handleCancel = () => {
    if (isDirty) {
      setDiscardDialog(true);
    } else {
      navigate(`/drivers/${driver.id}`);
    }
  };

  return (
    <DriverLayout
      title={`Edit ${driver.name}`}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Drivers", href: "/drivers" },
        { label: driver.name, href: `/drivers/${driver.id}` },
        { label: "Edit" },
      ]}
    >
      <Card variant="elevated" className={styles.formCard}>
        {isDirty && (
          <Alert variant="info" title="Unsaved changes">
            You have unsaved changes. Save or discard before leaving.
          </Alert>
        )}

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
            <Button variant="secondary" type="button" onClick={handleCancel}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={!isDirty || submitting}>
              {submitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </Card>

      {/* ── Discard confirmation ─────────────── */}
      <ConfirmDialog
        open={discardDialog}
        onConfirm={() => navigate(`/drivers/${driver.id}`)}
        onCancel={() => setDiscardDialog(false)}
        title="Discard changes?"
        description="You have unsaved changes that will be lost."
        confirmLabel="Discard"
        variant="destructive"
      />
    </DriverLayout>
  );
}

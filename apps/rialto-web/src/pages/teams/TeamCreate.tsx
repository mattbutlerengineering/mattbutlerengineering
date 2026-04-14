import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { DriverLayout } from "../drivers/DriverLayout";
import {
  Alert,
  Badge,
  Button,
  Card,
  DataList,
  Divider,
  Input,
  NumberInput,
  Select,
  Steps,
  Text,
  useToast,
} from "@mattbutlerengineering/rialto";
import styles from "./TeamCreate.module.css";

const ENGINES = [
  { value: "", label: "Select engine..." },
  { value: "Ferrari", label: "Ferrari" },
  { value: "Mercedes", label: "Mercedes" },
  { value: "Honda RBPT", label: "Honda RBPT" },
  { value: "Renault", label: "Renault" },
];

const COLORS = [
  { value: "", label: "Select color..." },
  { value: "Red", label: "Red" },
  { value: "Silver", label: "Silver" },
  { value: "Orange", label: "Orange" },
  { value: "Blue", label: "Blue" },
  { value: "Green", label: "Green" },
  { value: "White", label: "White" },
  { value: "Black", label: "Black" },
];

interface TeamFormData {
  name: string;
  baseCity: string;
  principal: string;
  founded: number;
  chassis: string;
  engine: string;
  liveryColor: string;
}

const INITIAL_DATA: TeamFormData = {
  name: "",
  baseCity: "",
  principal: "",
  founded: 2024,
  chassis: "",
  engine: "",
  liveryColor: "",
};

const STEP_ITEMS = [
  { label: "Team Info", description: "Name & leadership" },
  { label: "Car Setup", description: "Chassis & livery" },
  { label: "Review", description: "Confirm & submit" },
];

function validateStep(step: number, data: TeamFormData): string[] {
  if (step === 0) {
    const errs: string[] = [];
    if (!data.name.trim()) errs.push("Team name is required.");
    if (!data.baseCity.trim()) errs.push("Base city is required.");
    if (!data.principal.trim()) errs.push("Team principal is required.");
    if (data.founded < 1950 || data.founded > 2026) errs.push("Founded year must be 1950–2026.");
    return errs;
  }
  if (step === 1) {
    const errs: string[] = [];
    if (!data.chassis.trim()) errs.push("Chassis designation is required.");
    if (!data.engine) errs.push("Engine supplier is required.");
    if (!data.liveryColor) errs.push("Livery color is required.");
    return errs;
  }
  return [];
}

export function TeamCreate() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<TeamFormData>(INITIAL_DATA);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof TeamFormData>(key: K, value: TeamFormData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function handleNext(e: FormEvent) {
    e.preventDefault();
    const errs = validateStep(currentStep, data);
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setCurrentStep((s) => s + 1);
  }

  function handleBack() {
    setErrors([]);
    setCurrentStep((s) => s - 1);
  }

  function handleStepClick(index: number) {
    if (index < currentStep) {
      setErrors([]);
      setCurrentStep(index);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => {
      toast({ title: `${data.name} registered`, variant: "success" });
      navigate("/");
    }, 400);
  }

  return (
    <DriverLayout
      title="Register Team"
      breadcrumbs={[{ label: "Home", href: "/" }, { label: "Register Team" }]}
    >
      <Steps
        steps={STEP_ITEMS}
        currentStep={currentStep}
        onStepClick={handleStepClick}
        className={styles.steps}
      />

      <Card variant="elevated" className={styles.wizardCard}>
        {errors.length > 0 && (
          <Alert variant="error" title="Please fix the following:">
            <ul style={{ margin: 0, paddingLeft: "var(--rialto-space-md)" }}>
              {errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </Alert>
        )}

        {currentStep === 0 && (
          <form onSubmit={handleNext} className={styles.form}>
            <div className={styles.fieldRow}>
              <Input
                label="Team Name"
                value={data.name}
                onChange={(e) => update("name", e.target.value)}
                required
                placeholder="e.g. Scuderia Ferrari"
              />
              <Input
                label="Base City"
                value={data.baseCity}
                onChange={(e) => update("baseCity", e.target.value)}
                required
                placeholder="e.g. Maranello"
              />
            </div>
            <div className={styles.fieldRow}>
              <Input
                label="Team Principal"
                value={data.principal}
                onChange={(e) => update("principal", e.target.value)}
                required
                placeholder="e.g. Frédéric Vasseur"
              />
              <NumberInput
                label="Founded"
                value={data.founded}
                onChange={(v) => update("founded", v)}
                min={1950}
                max={2026}
              />
            </div>
            <div className={styles.formActions}>
              <Button variant="secondary" type="button" onClick={() => navigate("/")}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                Next
              </Button>
            </div>
          </form>
        )}

        {currentStep === 1 && (
          <form onSubmit={handleNext} className={styles.form}>
            <Input
              label="Chassis Designation"
              value={data.chassis}
              onChange={(e) => update("chassis", e.target.value)}
              required
              placeholder="e.g. SF-24"
            />
            <div className={styles.fieldRow}>
              <Select
                label="Engine Supplier"
                value={data.engine}
                onChange={(v) => update("engine", v)}
                options={ENGINES}
              />
              <Select
                label="Primary Livery Color"
                value={data.liveryColor}
                onChange={(v) => update("liveryColor", v)}
                options={COLORS}
              />
            </div>
            <div className={styles.formActions}>
              <Button variant="secondary" type="button" onClick={handleBack}>
                Back
              </Button>
              <Button variant="primary" type="submit">
                Next
              </Button>
            </div>
          </form>
        )}

        {currentStep === 2 && (
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.reviewGroup}>
              <div className={styles.reviewHeader}>
                <Text variant="label">Team Info</Text>
                <Button variant="ghost" size="sm" onClick={() => setCurrentStep(0)}>
                  Edit
                </Button>
              </div>
              <DataList
                items={[
                  { label: "Team Name", value: data.name },
                  { label: "Base City", value: data.baseCity },
                  { label: "Team Principal", value: data.principal },
                  { label: "Founded", value: String(data.founded) },
                ]}
                striped
              />
            </div>

            <Divider />

            <div className={styles.reviewGroup}>
              <div className={styles.reviewHeader}>
                <Text variant="label">Car Setup</Text>
                <Button variant="ghost" size="sm" onClick={() => setCurrentStep(1)}>
                  Edit
                </Button>
              </div>
              <DataList
                items={[
                  { label: "Chassis", value: data.chassis },
                  { label: "Engine", value: data.engine },
                  {
                    label: "Livery Color",
                    value: (
                      <Badge variant="neutral" size="sm">
                        {data.liveryColor}
                      </Badge>
                    ),
                  },
                ]}
                striped
              />
            </div>

            <div className={styles.formActions}>
              <Button variant="secondary" type="button" onClick={handleBack}>
                Back
              </Button>
              <Button variant="primary" type="submit" disabled={submitting}>
                {submitting ? "Registering..." : "Register Team"}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </DriverLayout>
  );
}

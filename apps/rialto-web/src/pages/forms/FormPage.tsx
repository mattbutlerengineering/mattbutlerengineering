import { useState } from "react";
import {
  Button,
  Card,
  DataList,
  Form,
  FormField,
  Input,
  NumberInput,
  Select,
  Stack,
  Text,
  TextArea,
} from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import { PropsTable } from "../components/PropsTable";

// ---------------------------------------------------------------------------
// Playground — every supported field primitive wired through FormField
// ---------------------------------------------------------------------------

function RegistrationFormDemo() {
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [seats, setSeats] = useState(0);
  const [team, setTeam] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <Card variant="flat" style={{ padding: "var(--rialto-space-xl)" }}>
      <Form onValidSubmit={() => setSubmitted(true)} style={{ maxWidth: "360px" }}>
        <FormField name="email" validate={() => (email ? undefined : "Email is required")}>
          <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField name="bio" validate={() => (bio ? undefined : "Bio is required")}>
          <TextArea label="Bio" value={bio} onChange={(e) => setBio(e.target.value)} />
        </FormField>
        <FormField name="seats" validate={() => (seats > 0 ? undefined : "Pick at least 1 seat")}>
          <NumberInput label="Seats" value={seats} onChange={setSeats} min={0} max={10} />
        </FormField>
        <FormField name="team" validate={() => (team ? undefined : "Team is required")}>
          <Select
            label="Team"
            value={team}
            onChange={setTeam}
            options={[
              { value: "ferrari", label: "Ferrari" },
              { value: "mclaren", label: "McLaren" },
              { value: "mercedes", label: "Mercedes" },
            ]}
          />
        </FormField>
        <Button type="submit">Submit</Button>
        {submitted && (
          <Text variant="caption" color="success">
            Submitted!
          </Text>
        )}
      </Form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function FormPage() {
  return (
    <ComponentPageLayout
      name="Form"
      description="Form and FormField wrap the field primitives with shared submit-time validation. A field's error is announced through its own live region; a failed submit also announces an assertive summary above the fields."
    >
      {/* ── Interactive ───────────────────────────────────────────── */}
      <Section title="Interactive">
        <RegistrationFormDemo />
      </Section>

      {/* ── Usage ─────────────────────────────────────────────────── */}
      <Section title="Usage">
        <Stack gap="sm">
          <Text variant="caption" color="secondary">
            Wrap each field element in a <code>FormField</code> with a unique <code>name</code> and
            a <code>validate</code> function. <code>Form</code> blocks submission and shows an error
            summary while any field is invalid.
          </Text>
        </Stack>
      </Section>

      {/* ── Props Table ───────────────────────────────────────────── */}
      <Section title="Form Props">
        <PropsTable component="Form" />
      </Section>

      <Section title="FormField Props">
        <PropsTable component="FormField" />
      </Section>

      {/* ── Accessibility ─────────────────────────────────────────── */}
      <Section title="Accessibility">
        <DataList
          items={[
            {
              label: "Per-field error",
              value: "Announced via the field's own polite live region (role=status)",
            },
            {
              label: "Error summary",
              value:
                "An assertive alert region (role=alert, aria-live=assertive), always mounted so screen readers register it before the first announcement",
            },
            {
              label: "Field state",
              value: "aria-invalid and aria-describedby wired through the field's own useField",
            },
          ]}
        />
      </Section>
    </ComponentPageLayout>
  );
}

FormPage.displayName = "FormPage";

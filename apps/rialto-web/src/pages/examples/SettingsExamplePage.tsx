import { useState } from "react";
import {
  Input,
  Select,
  Toggle,
  Button,
  Card,
  Stack,
  Text,
  Divider,
} from "@mattbutlerengineering/rialto";
import { ExamplePageLayout, CompositionNote } from "./ExamplePageLayout";
import { validateProfile, type ProfileErrors } from "./settings-example";
import styles from "./SettingsExamplePage.module.css";

/* ── Source JSX constant ─────────────────────── */
// Keep in sync with component below

const SETTINGS_EXAMPLE_JSX = `<Stack gap="xl" className={styles.sections}>
  {/* Profile */}
  <Card variant="elevated" className={styles.sectionCard}>
    <Stack gap="md">
      <Text variant="label" as="h2">Profile</Text>
      <Input
        label="Full Name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        error={Boolean(errors.fullName)}
        hint={errors.fullName}
        placeholder="Your name"
      />
      <Input
        label="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={Boolean(errors.email)}
        hint={errors.email}
        placeholder="Email address"
      />
      <Select
        label="Role"
        options={[
          { value: "operations-manager", label: "Operations Manager" },
          { value: "front-desk", label: "Front Desk" },
          { value: "housekeeping-lead", label: "Housekeeping Lead" },
          { value: "general-manager", label: "General Manager" },
        ]}
        value="operations-manager"
        onChange={setRole}
      />
      <Select
        label="Timezone"
        options={[
          { value: "America/Chicago", label: "America/Chicago" },
          { value: "America/New_York", label: "America/New_York" },
          { value: "America/Los_Angeles", label: "America/Los_Angeles" },
          { value: "Europe/London", label: "Europe/London" },
        ]}
        value="America/Chicago"
        onChange={setTimezone}
      />
    </Stack>
    <Divider />
    <Stack direction="row" justify="end">
      {saved && <Text role="status">Profile saved.</Text>}
      <Button variant="primary" size="md" onClick={handleSave}>Save Profile</Button>
    </Stack>
  </Card>

  {/* Notifications */}
  <Card variant="elevated" className={styles.sectionCard}>
    <Stack gap="md">
      <Text variant="label" as="h2">Notifications</Text>
      <Toggle label="Booking alerts" checked={bookingAlerts} onCheckedChange={setBookingAlerts} />
      <Toggle label="Maintenance requests" checked={maintenanceAlerts} onCheckedChange={setMaintenanceAlerts} />
      <Toggle label="Revenue reports" checked={revenueAlerts} onCheckedChange={setRevenueAlerts} />
    </Stack>
  </Card>

  {/* Display */}
  <Card variant="elevated" className={styles.sectionCard}>
    <Stack gap="md">
      <Text variant="label" as="h2">Display</Text>
      <Select
        label="Date format"
        options={[
          { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
          { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
          { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
        ]}
        value="MM/DD/YYYY"
        onChange={setDateFormat}
      />
      <Select
        label="Currency"
        options={[
          { value: "USD", label: "USD ($)" },
          { value: "EUR", label: "EUR (\u20ac)" },
          { value: "GBP", label: "GBP (\u00a3)" },
        ]}
        value="USD"
        onChange={setCurrency}
      />
      <Toggle label="Compact table view" checked={compactView} onCheckedChange={setCompactView} />
    </Stack>
  </Card>
</Stack>`;

/* ── Component ───────────────────────────────── */

const ROLE_OPTIONS = [
  { value: "operations-manager", label: "Operations Manager" },
  { value: "front-desk", label: "Front Desk" },
  { value: "housekeeping-lead", label: "Housekeeping Lead" },
  { value: "general-manager", label: "General Manager" },
];

const TIMEZONE_OPTIONS = [
  { value: "America/Chicago", label: "America/Chicago" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles" },
  { value: "Europe/London", label: "Europe/London" },
];

const DATE_FORMAT_OPTIONS = [
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
];

const CURRENCY_OPTIONS = [
  { value: "USD", label: "USD ($)" },
  { value: "EUR", label: "EUR (\u20ac)" },
  { value: "GBP", label: "GBP (\u00a3)" },
];

const compositionNotes = (
  <Stack gap="sm">
    <CompositionNote>
      Card + Divider creates visual sections without nested forms — each Card is a self-contained
      settings group, and Divider separates the field stack from the save action within the same
      Card.
    </CompositionNote>
    <CompositionNote>
      Toggle is used for binary preferences that take immediate effect — no &ldquo;Save&rdquo;
      button needed for notification switches. Save Profile checks the name and email: a blank name
      or an address that is not an email is shown on the field, and a valid save confirms.
    </CompositionNote>
    <CompositionNote>
      Stack gap=&ldquo;xl&rdquo; between sections provides consistent vertical rhythm;
      gap=&ldquo;md&rdquo; inside each Card keeps form fields tightly grouped within their section.
    </CompositionNote>
  </Stack>
);

export function SettingsExamplePage() {
  const [fullName, setFullName] = useState("Marcus Winters");
  const [email, setEmail] = useState("m.winters@grandlakehotel.com");
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saved, setSaved] = useState(false);
  const [role, setRole] = useState("operations-manager");
  const [timezone, setTimezone] = useState("America/Chicago");
  const [bookingAlerts, setBookingAlerts] = useState(true);
  const [maintenanceAlerts, setMaintenanceAlerts] = useState(false);
  const [revenueAlerts, setRevenueAlerts] = useState(true);
  const [dateFormat, setDateFormat] = useState("MM/DD/YYYY");
  const [currency, setCurrency] = useState("USD");
  const [compactView, setCompactView] = useState(false);

  const handleSave = () => {
    const next = validateProfile({ fullName, email });
    setErrors(next);
    setSaved(Object.keys(next).length === 0);
  };

  return (
    <ExamplePageLayout
      name="Settings"
      description="Account settings page with profile, notifications, and display preferences"
      sourceJsx={SETTINGS_EXAMPLE_JSX}
      compositionNotes={compositionNotes}
    >
      <Stack gap="xl" className={styles.sections}>
        {/* Profile */}
        <Card variant="elevated" className={styles.sectionCard}>
          <Stack gap="md">
            <Text variant="label" as="h2">
              Profile
            </Text>
            <Input
              label="Full Name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              error={Boolean(errors.fullName)}
              hint={errors.fullName}
              placeholder="Your name"
            />
            <Input
              label="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={Boolean(errors.email)}
              hint={errors.email}
              placeholder="Email address"
            />
            <Select label="Role" options={ROLE_OPTIONS} value={role} onChange={setRole} />
            <Select
              label="Timezone"
              options={TIMEZONE_OPTIONS}
              value={timezone}
              onChange={setTimezone}
            />
          </Stack>
          <Divider />
          <Stack direction="row" justify="end" align="center">
            {saved ? (
              <Text variant="caption" color="success" role="status">
                Profile saved.
              </Text>
            ) : null}
            <Button variant="primary" size="md" onClick={handleSave}>
              Save Profile
            </Button>
          </Stack>
        </Card>

        {/* Notifications */}
        <Card variant="elevated" className={styles.sectionCard}>
          <Stack gap="md">
            <Text variant="label" as="h2">
              Notifications
            </Text>
            <Toggle
              label="Booking alerts"
              checked={bookingAlerts}
              onCheckedChange={setBookingAlerts}
            />
            <Toggle
              label="Maintenance requests"
              checked={maintenanceAlerts}
              onCheckedChange={setMaintenanceAlerts}
            />
            <Toggle
              label="Revenue reports"
              checked={revenueAlerts}
              onCheckedChange={setRevenueAlerts}
            />
          </Stack>
        </Card>

        {/* Display Preferences */}
        <Card variant="elevated" className={styles.sectionCard}>
          <Stack gap="md">
            <Text variant="label" as="h2">
              Display
            </Text>
            <Select
              label="Date format"
              options={DATE_FORMAT_OPTIONS}
              value={dateFormat}
              onChange={setDateFormat}
            />
            <Select
              label="Currency"
              options={CURRENCY_OPTIONS}
              value={currency}
              onChange={setCurrency}
            />
            <Toggle
              label="Compact table view"
              checked={compactView}
              onCheckedChange={setCompactView}
            />
          </Stack>
        </Card>
      </Stack>
    </ExamplePageLayout>
  );
}

SettingsExamplePage.displayName = "SettingsExamplePage";

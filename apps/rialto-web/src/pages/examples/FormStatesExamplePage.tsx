import { Card, Stack, Input, Select, Button, Spinner } from "@mbe/rialto";
import { ExamplePageLayout, StatePanel, CompositionNote } from "./ExamplePageLayout";
import styles from "./FormStatesExamplePage.module.css";

/* ── Source JSX constant ─────────────────────── */
// Keep in sync with component below

const FORM_STATES_EXAMPLE_JSX = `<Stack gap="xl">
  {/* Default */}
  <StatePanel label="Default">
    <Card variant="elevated">
      <Stack gap="md">
        <Input label="Guest Name" placeholder="Full name" />
        <Input label="Email Address" placeholder="guest@hotel.com" />
        <Select
          label="Room Type"
          options={ROOM_TYPE_OPTIONS}
          placeholder="Select room type\u2026"
        />
        <Stack direction="row" justify="end">
          <Button variant="primary">Submit Reservation</Button>
        </Stack>
      </Stack>
    </Card>
  </StatePanel>

  {/* Error */}
  <StatePanel label="Error">
    <Card variant="elevated">
      <Stack gap="md">
        <Input label="Guest Name" value="" error hint="Guest name is required" />
        <Input label="Email Address" value="invalid-email" error hint="Enter a valid email address" />
        <Select
          label="Room Type"
          options={ROOM_TYPE_OPTIONS}
          placeholder="Select room type\u2026"
        />
        <Stack direction="row" justify="end">
          <Button variant="primary">Submit Reservation</Button>
        </Stack>
      </Stack>
    </Card>
  </StatePanel>

  {/* Disabled */}
  <StatePanel label="Disabled">
    <Card variant="elevated">
      <Stack gap="md">
        <Input label="Guest Name" value="Elena Marchetti" disabled />
        <Input label="Email Address" value="e.marchetti@resort.com" disabled />
        <Select
          label="Room Type"
          options={ROOM_TYPE_OPTIONS}
          value="suite"
          disabled
        />
        <Stack direction="row" justify="end">
          <Button variant="primary" disabled>Submit Reservation</Button>
        </Stack>
      </Stack>
    </Card>
  </StatePanel>

  {/* Loading */}
  <StatePanel label="Loading">
    <Card variant="elevated">
      <Stack gap="md">
        <Input label="Guest Name" value="Sophie Laurent" readOnly />
        <Input label="Email Address" value="s.laurent@grandlake.com" readOnly />
        <Select
          label="Room Type"
          options={ROOM_TYPE_OPTIONS}
          value="deluxe"
          disabled
        />
        <Stack direction="row" align="center" gap="sm" justify="end">
          <Spinner size="sm" label="Submitting\u2026" />
          <Button variant="primary" disabled>Submitting\u2026</Button>
        </Stack>
      </Stack>
    </Card>
  </StatePanel>
</Stack>`;

/* ── Component ───────────────────────────────── */

const ROOM_TYPE_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "deluxe", label: "Deluxe" },
  { value: "suite", label: "Suite" },
  { value: "penthouse", label: "Penthouse" },
];

const compositionNotes = (
  <Stack gap="sm">
    <CompositionNote>
      All four states are rendered as static siblings — no useState or interaction is needed to see
      every state. This makes the example useful as a reference without requiring clicks or tab
      switching.
    </CompositionNote>
    <CompositionNote>
      Error state uses the Input <code>error</code> prop combined with <code>hint</code> for
      validation messages — the hint text replaces helper text and turns red when error is true.
    </CompositionNote>
    <CompositionNote>
      Loading state is shown via Spinner adjacent to a disabled Button — Button has no loading prop,
      so the spinner is placed inline using Stack direction=&ldquo;row&rdquo; to communicate the in-flight
      request without mutating the button itself.
    </CompositionNote>
  </Stack>
);

export function FormStatesExamplePage() {
  return (
    <ExamplePageLayout
      name="Form States"
      description="Every form input state rendered simultaneously — default, error, disabled, and loading"
      sourceJsx={FORM_STATES_EXAMPLE_JSX}
      compositionNotes={compositionNotes}
    >
      <div className={styles.statePanels}>
        {/* Default */}
        <StatePanel label="Default">
          <Card variant="elevated">
            <Stack gap="md">
              <Input label="Guest Name" placeholder="Full name" />
              <Input label="Email Address" placeholder="guest@hotel.com" />
              <Select
                label="Room Type"
                options={ROOM_TYPE_OPTIONS}
                placeholder="Select room type\u2026"
              />
              <Stack direction="row" justify="end">
                <Button variant="primary">Submit Reservation</Button>
              </Stack>
            </Stack>
          </Card>
        </StatePanel>

        {/* Error */}
        <StatePanel label="Error">
          <Card variant="elevated">
            <Stack gap="md">
              <Input label="Guest Name" value="" error hint="Guest name is required" readOnly />
              <Input
                label="Email Address"
                value="invalid-email"
                error
                hint="Enter a valid email address"
                readOnly
              />
              <Select
                label="Room Type"
                options={ROOM_TYPE_OPTIONS}
                placeholder="Select room type\u2026"
              />
              <Stack direction="row" justify="end">
                <Button variant="primary">Submit Reservation</Button>
              </Stack>
            </Stack>
          </Card>
        </StatePanel>

        {/* Disabled */}
        <StatePanel label="Disabled">
          <Card variant="elevated">
            <Stack gap="md">
              <Input label="Guest Name" value="Elena Marchetti" disabled />
              <Input label="Email Address" value="e.marchetti@resort.com" disabled />
              <Select
                label="Room Type"
                options={ROOM_TYPE_OPTIONS}
                value="suite"
                disabled
              />
              <Stack direction="row" justify="end">
                <Button variant="primary" disabled>
                  Submit Reservation
                </Button>
              </Stack>
            </Stack>
          </Card>
        </StatePanel>

        {/* Loading */}
        <StatePanel label="Loading">
          <Card variant="elevated">
            <Stack gap="md">
              <Input label="Guest Name" value="Sophie Laurent" readOnly />
              <Input label="Email Address" value="s.laurent@grandlake.com" readOnly />
              <Select
                label="Room Type"
                options={ROOM_TYPE_OPTIONS}
                value="deluxe"
                disabled
              />
              <Stack direction="row" align="center" gap="sm" justify="end">
                <Spinner size="sm" label="Submitting\u2026" />
                <Button variant="primary" disabled>
                  Submitting&hellip;
                </Button>
              </Stack>
            </Stack>
          </Card>
        </StatePanel>
      </div>
    </ExamplePageLayout>
  );
}

FormStatesExamplePage.displayName = "FormStatesExamplePage";

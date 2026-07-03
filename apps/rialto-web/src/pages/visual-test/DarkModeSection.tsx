import {
  Alert,
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
  Input,
  TapeChart,
  Text,
  Toggle,
} from "@mattbutlerengineering/rialto";
import { Section } from "./Section";
import { tapeChartDefaultReservations, tapeChartDefaultRooms } from "./fixtures";
import styles from "./VisualTest.module.css";

/**
 * Dark-mode demo section of the Visual Test Harness — re-renders a subset of
 * components under `data-theme="dark"` for dark-mode screenshot regression.
 */
export function DarkModeSection() {
  return (
    <div data-theme="dark" data-testid="dark-mode-section">
      <div
        className={styles.page}
        style={{
          background: "#1a1918",
          borderRadius: "var(--rialto-radius-soft)",
        }}
      >
        <Section id="dark-buttons" title="Dark — Buttons">
          <div className={styles.card}>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
        </Section>

        <Section id="dark-inputs" title="Dark — Inputs">
          <div className={styles.cardColumn}>
            <Input label="Default" placeholder="Placeholder" />
            <Input label="Error" error />
          </div>
        </Section>

        <Section id="dark-alerts" title="Dark — Alerts">
          <div className={styles.cardColumn}>
            <Alert variant="info">Info in dark mode.</Alert>
            <Alert variant="success">Success in dark mode.</Alert>
            <Alert variant="warning">Warning in dark mode.</Alert>
            <Alert variant="error">Error in dark mode.</Alert>
          </div>
        </Section>

        <Section id="dark-toggles" title="Dark — Toggles & Checkboxes">
          <div className={styles.card}>
            <Toggle label="Off" />
            <Toggle label="On" defaultChecked />
            <Checkbox label="Unchecked" />
            <Checkbox label="Checked" checked />
          </div>
        </Section>

        <Section id="dark-badges" title="Dark — Badges">
          <div className={styles.card}>
            <Badge variant="neutral">Neutral</Badge>
            <Badge variant="accent">Accent</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="error">Error</Badge>
          </div>
        </Section>

        <Section id="dark-cards" title="Dark — Card">
          <div className={styles.card}>
            <Card title="Dark Card">
              <Text>Content in dark mode.</Text>
            </Card>
          </div>
        </Section>

        <Section id="dark-banner" title="Dark — Banner">
          <div className={styles.cardColumn}>
            <Banner variant="info">Info banner in dark mode.</Banner>
            <Banner variant="warning">Warning banner in dark mode.</Banner>
          </div>
        </Section>

        <Section id="dark-avatar" title="Dark — Avatar">
          <div className={styles.card}>
            <Avatar name="Alice" size="md" status="online" />
            <Avatar name="Bob" size="md" status="busy" />
            <Avatar name="Carol" size="md" />
          </div>
        </Section>

        <Section id="dark-tape-chart" title="Dark — TapeChart">
          <div className={styles.card}>
            <TapeChart
              startDate="2026-01-15"
              endDate="2026-01-22"
              rooms={tapeChartDefaultRooms}
              reservations={tapeChartDefaultReservations}
              currency="USD"
              density="comfortable"
              viewMode="grid"
              onReservationClick={() => {}}
            />
          </div>
        </Section>
      </div>
    </div>
  );
}

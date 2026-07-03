/**
 * Visual Test Harness
 *
 * Renders core components in all meaningful states for Playwright screenshot tests.
 * Each section has a data-testid for targeted screenshots.
 * This page is only used in dev/test — not included in production builds.
 */

import { Divider, Text } from "@mattbutlerengineering/rialto";
import { DarkModeSection } from "./DarkModeSection";
import { DisplaySections } from "./DisplaySections";
import { FeedbackOverlaySections } from "./FeedbackOverlaySections";
import { FormSections } from "./FormSections";
import { TabsAccordionSections } from "./TabsAccordionSections";
import { TapeChartSections } from "./TapeChartSections";
import styles from "./VisualTest.module.css";

export function VisualTest() {
  return (
    <div className={styles.page}>
      <Text variant="display">Visual Test Harness</Text>
      <Text variant="caption" color="secondary">
        Stable rendering of core components for screenshot regression tests.
      </Text>
      <Divider spacing="spacious" />

      <FormSections />
      <TabsAccordionSections />
      <DisplaySections />
      <FeedbackOverlaySections />
      <TapeChartSections />

      {/* ── Dark Mode Section ──────────────── */}
      <Divider label="Dark Mode" spacing="spacious" />

      <DarkModeSection />
    </div>
  );
}

VisualTest.displayName = "VisualTest";

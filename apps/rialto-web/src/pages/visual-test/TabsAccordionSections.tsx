import { Accordion, Tabs, Text } from "@mattbutlerengineering/rialto";
import { Section } from "./Section";
import styles from "./VisualTest.module.css";

/**
 * Tabs and Accordion sections of the Visual Test Harness.
 */
export function TabsAccordionSections() {
  return (
    <>
      {/* ── Tabs ───────────────────────────── */}
      <Section id="tabs-default" title="Tabs">
        <div className={styles.card}>
          <Tabs
            tabs={[
              {
                id: "tab1",
                label: "Overview",
                content: <Text>Overview content</Text>,
              },
              {
                id: "tab2",
                label: "Details",
                content: <Text>Details content</Text>,
              },
              {
                id: "tab3",
                label: "Settings",
                content: <Text>Settings content</Text>,
              },
            ]}
          />
        </div>
      </Section>

      {/* ── Accordion ────────────────────────── */}
      <Section id="accordion-default" title="Accordion">
        <div className={styles.cardColumn}>
          <Accordion
            items={[
              {
                id: "a",
                title: "Section A",
                content: <Text>Content for section A.</Text>,
              },
              {
                id: "b",
                title: "Section B",
                content: <Text>Content for section B.</Text>,
              },
              {
                id: "c",
                title: "Section C (Disabled)",
                content: <Text>Hidden.</Text>,
                disabled: true,
              },
            ]}
            defaultOpen={["a"]}
          />
        </div>
      </Section>
    </>
  );
}

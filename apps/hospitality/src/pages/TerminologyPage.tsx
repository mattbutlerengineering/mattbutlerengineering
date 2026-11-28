import { useTranslation } from "react-i18next";
import type { ParseKeys } from "i18next";
import { Link } from "react-router";
import { Heading, Text } from "@mattbutlerengineering/rialto";
import { PageHeader } from "../components/PageHeader.js";
import { TerminologyDiagram } from "../components/terminology/TerminologyDiagram.js";
import { TERM_GROUPS, type TermGroup } from "../i18n/terminology.js";
import styles from "./TerminologyPage.module.css";

/**
 * `terminology`: what each word the dashboard uses means, grouped by area. The terms come from
 * the glossary modules (`i18n/terminology.ts`), so the page cannot drift from the app's labels;
 * `terminology.test.ts` fails on a glossary entry with no definition.
 */
export function TerminologyPage() {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <PageHeader
        title={t("terminology.title")}
        description={t("terminology.description")}
        aside={
          <Link to="/settings" className={styles.link}>
            {t("terminology.back")}
          </Link>
        }
      />
      {TERM_GROUPS.map((group) => (
        <TermSection key={group.id} group={group} />
      ))}
      <section aria-labelledby="terminology-diagram" className={styles.section}>
        <Heading level={2} id="terminology-diagram">
          {t("terminology.diagram.title")}
        </Heading>
        <TerminologyDiagram />
      </section>
    </div>
  );
}

TerminologyPage.displayName = "TerminologyPage";

function TermSection({ group }: { group: TermGroup }) {
  const { t } = useTranslation();
  const headingId = `terminology-${group.id}`;
  return (
    <section aria-labelledby={headingId} className={styles.section}>
      <Heading level={2} id={headingId}>
        {t(`terminology.groups.${group.id}` as ParseKeys)}
      </Heading>
      <dl className={styles.terms}>
        {group.terms.map(({ id }) => (
          <div key={id} className={styles.term}>
            <Text as="dt" variant="label" color="primary">
              {t(`terminology.terms.${id}` as ParseKeys)}
            </Text>
            <Text
              as="dd"
              variant="body"
              color="primary"
              className={`${styles.definition} ${styles.prose}`}
            >
              {t(`terminology.definitions.${id}` as ParseKeys)}
            </Text>
          </div>
        ))}
      </dl>
    </section>
  );
}

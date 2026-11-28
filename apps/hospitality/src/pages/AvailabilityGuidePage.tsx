import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ParseKeys } from "i18next";
import { Link } from "react-router";
import { Card, Heading, Text } from "@mattbutlerengineering/rialto";
import { availabilityPath } from "../components/availability/availability-address.js";
import {
  GUIDE_EXAMPLES,
  runGuideCheck,
  type GuideExample,
  type OfferedTime,
} from "../components/availability-guide/availability-guide-examples.js";
import { PageHeader } from "../components/PageHeader.js";
import { formatLocalTime } from "../utils/format.js";
import styles from "./AvailabilityGuidePage.module.css";

/**
 * `help/availability`: a staff-facing guide to how the availability engine (`@mbe/availability`)
 * turns hours, closures and booking rules into the times a guest can book. Sections follow the
 * Availability rail: overview, When you're open, Where guests sit, then examples and a checklist.
 * Every worked example is run through the engine (`availability-guide-examples.ts`).
 */

type Key = ParseKeys;

const G = "availabilityHub.guide";

const OVERVIEW_LAYERS = [
  "availabilityHub.guide.overview.layers.regular",
  "availabilityHub.guide.overview.layers.seasonal",
  "availabilityHub.guide.overview.layers.otherHours",
  "availabilityHub.guide.overview.layers.special",
  "availabilityHub.guide.overview.layers.closures",
  "availabilityHub.guide.overview.layers.tonight",
] as const satisfies readonly Key[];

const CLOSURE_KINDS = [
  "availabilityHub.guide.closures.kinds.venue",
  "availabilityHub.guide.closures.kinds.service",
  "availabilityHub.guide.closures.kinds.window",
  "availabilityHub.guide.closures.kinds.pause",
] as const satisfies readonly Key[];

const BOOKING_RULES = [
  "availabilityHub.guide.bookingRules.items.spacing",
  "availabilityHub.guide.bookingRules.items.bookedBy",
  "availabilityHub.guide.bookingRules.items.removed",
  "availabilityHub.guide.bookingRules.items.partySize",
  "availabilityHub.guide.bookingRules.items.stay",
  "availabilityHub.guide.bookingRules.items.pacing",
  "availabilityHub.guide.bookingRules.items.kept",
  "availabilityHub.guide.bookingRules.items.override",
  "availabilityHub.guide.bookingRules.items.window",
] as const satisfies readonly Key[];

const TROUBLESHOOTING = [
  "availabilityHub.guide.troubleshooting.steps.checkDate",
  "availabilityHub.guide.troubleshooting.steps.special",
  "availabilityHub.guide.troubleshooting.steps.otherHours",
  "availabilityHub.guide.troubleshooting.steps.seasonal",
  "availabilityHub.guide.troubleshooting.steps.regular",
  "availabilityHub.guide.troubleshooting.steps.seatEvery",
  "availabilityHub.guide.troubleshooting.steps.bookedBy",
  "availabilityHub.guide.troubleshooting.steps.closures",
  "availabilityHub.guide.troubleshooting.steps.pause",
  "availabilityHub.guide.troubleshooting.steps.tonight",
  "availabilityHub.guide.troubleshooting.steps.tables",
  "availabilityHub.guide.troubleshooting.steps.pacing",
  "availabilityHub.guide.troubleshooting.steps.window",
  "availabilityHub.guide.troubleshooting.steps.whyThisDay",
] as const satisfies readonly Key[];

export function AvailabilityGuidePage() {
  const { t } = useTranslation();
  return (
    <div className={styles.page}>
      <PageHeader
        title={t("availabilityHub.guide.title")}
        description={t("availabilityHub.guide.description")}
        aside={
          <Link to={availabilityPath({ view: "hub" })} className={styles.link}>
            {t("availabilityHub.seasonal.back")}
          </Link>
        }
      />
      <Overview />
      <WhenOpen />
      <WhereGuestsSit />
      <Examples />
      <Troubleshooting />
    </div>
  );
}

AvailabilityGuidePage.displayName = "AvailabilityGuidePage";

function GuideSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={styles.section}>
      <Heading level={2} id={id}>
        {title}
      </Heading>
      {children}
    </section>
  );
}

function Topic({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.topic}>
      <Heading level={3}>{title}</Heading>
      {children}
    </div>
  );
}

function Paragraphs({ keys }: { keys: readonly Key[] }) {
  const { t } = useTranslation();
  return (
    <>
      {keys.map((key) => (
        <Text key={key} variant="body" color="primary" className={styles.prose}>
          {t(key)}
        </Text>
      ))}
    </>
  );
}

function Items({ keys, ordered = false }: { keys: readonly Key[]; ordered?: boolean }) {
  const { t } = useTranslation();
  const List = ordered ? "ol" : "ul";
  return (
    <List className={styles.list}>
      {keys.map((key) => (
        <li key={key}>
          <Text variant="body" color="primary" className={styles.prose}>
            {t(key)}
          </Text>
        </li>
      ))}
    </List>
  );
}

function Overview() {
  const { t } = useTranslation();
  return (
    <GuideSection id="guide-overview" title={t("availabilityHub.guide.overview.heading")}>
      <Paragraphs
        keys={["availabilityHub.guide.overview.intro", "availabilityHub.guide.overview.layersLead"]}
      />
      <Items keys={OVERVIEW_LAYERS} ordered />
      <Paragraphs
        keys={[
          "availabilityHub.guide.overview.closuresAlwaysWin",
          "availabilityHub.guide.overview.bookingRulesNote",
        ]}
      />
    </GuideSection>
  );
}

function WhenOpen() {
  const { t } = useTranslation();
  return (
    <GuideSection id="guide-open" title={t("availabilityHub.guide.whenOpen.heading")}>
      <Paragraphs keys={["availabilityHub.guide.whenOpen.intro"]} />
      <Topic title={t("availabilityHub.routes.regularHours")}>
        <Paragraphs
          keys={[
            "availabilityHub.guide.regular.what",
            "availabilityHub.guide.regular.uncovered",
            "availabilityHub.guide.regular.pastMidnight",
          ]}
        />
      </Topic>
      <Topic title={t("availabilityHub.routes.seasonalHours")}>
        <Paragraphs
          keys={[
            "availabilityHub.guide.seasonal.what",
            "availabilityHub.guide.seasonal.replaces",
            "availabilityHub.guide.seasonal.overlap",
          ]}
        />
      </Topic>
      <Topic title={t("availabilityHub.routes.specialDates")}>
        <Paragraphs
          keys={[
            "availabilityHub.guide.special.what",
            "availabilityHub.guide.special.replaces",
            "availabilityHub.guide.special.otherHours",
            "availabilityHub.guide.special.repeat",
            "availabilityHub.guide.special.overlap",
          ]}
        />
      </Topic>
      <Topic title={t("availabilityHub.closuresPage.title")}>
        <Paragraphs keys={["availabilityHub.guide.closures.what"]} />
        <Items keys={CLOSURE_KINDS} />
        <Paragraphs
          keys={[
            "availabilityHub.guide.closures.separate",
            "availabilityHub.guide.closures.overlap",
            "availabilityHub.guide.closures.tonight",
          ]}
        />
      </Topic>
      <Topic title={t("availabilityHub.routes.bookingRules")}>
        <Paragraphs keys={["availabilityHub.guide.bookingRules.what"]} />
        <Items keys={BOOKING_RULES} />
      </Topic>
    </GuideSection>
  );
}

function WhereGuestsSit() {
  const { t } = useTranslation();
  return (
    <GuideSection id="guide-sit" title={t("availabilityHub.guide.sections.heading")}>
      <Paragraphs
        keys={[
          "availabilityHub.guide.sections.what",
          "availabilityHub.guide.sections.tables",
          "availabilityHub.guide.sections.membership",
          "availabilityHub.guide.sections.blockedTable",
        ]}
      />
    </GuideSection>
  );
}

function Examples() {
  const { t } = useTranslation();
  return (
    <GuideSection id="guide-examples" title={t("availabilityHub.guide.examples.heading")}>
      <Paragraphs keys={["availabilityHub.guide.examples.intro"]} />
      {GUIDE_EXAMPLES.map((example) => (
        <ExampleCard key={example.id} example={example} />
      ))}
    </GuideSection>
  );
}

function ExampleCard({ example }: { example: GuideExample }) {
  const { t } = useTranslation();
  const at = (field: string) => `${G}.examples.${example.id}.${field}` as Key;
  return (
    <Card title={t(at("title"))} headingLevel={3} data-testid="guide-example">
      <div className={styles.example}>
        <Text variant="body" color="primary" className={styles.prose}>
          {t(at("scenario"))}
        </Text>
        <ul className={styles.list}>
          {example.checks.map((check) => (
            <li key={check.id}>
              <Text variant="label" color="primary" className={styles.prose}>
                {t(at(`checks.${check.id}`))}
              </Text>
              <Outcome offered={runGuideCheck(example, check).offered} />
            </li>
          ))}
        </ul>
        <Text variant="body" color="secondary" className={styles.prose}>
          {t(at("why"))}
        </Text>
      </div>
    </Card>
  );
}

/** One line for the bookable times and one per reason a listed time is full. */
function Outcome({ offered }: { offered: readonly OfferedTime[] }) {
  const { t, i18n } = useTranslation();
  const formatMinute = (minute: number) =>
    formatLocalTime(
      `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, "0")}`,
      i18n.language
    );
  const times = (list: readonly OfferedTime[]) =>
    list.map((o) => formatMinute(o.minute)).join(", ");
  const bookable = offered.filter((o) => o.available);
  const full = (reason: "no_table" | "pacing") =>
    offered.filter((o) => !o.available && o.reason === reason);
  const noTable = full("no_table");
  const paced = full("pacing");

  return (
    <div className={styles.outcome}>
      {offered.length === 0 && (
        <Text variant="body" color="secondary">
          {t("availabilityHub.guide.outcome.none")}
        </Text>
      )}
      {bookable.length > 0 && (
        <Text variant="body" color="secondary">
          {t("availabilityHub.guide.outcome.bookable", { times: times(bookable) })}
        </Text>
      )}
      {noTable.length > 0 && (
        <Text variant="body" color="secondary">
          {t("availabilityHub.guide.outcome.noTable", { times: times(noTable) })}
        </Text>
      )}
      {paced.length > 0 && (
        <Text variant="body" color="secondary">
          {t("availabilityHub.guide.outcome.pacing", { times: times(paced) })}
        </Text>
      )}
    </div>
  );
}

function Troubleshooting() {
  const { t } = useTranslation();
  return (
    <GuideSection
      id="guide-troubleshooting"
      title={t("availabilityHub.guide.troubleshooting.heading")}
    >
      <Paragraphs keys={["availabilityHub.guide.troubleshooting.lead"]} />
      <Items keys={TROUBLESHOOTING} ordered />
    </GuideSection>
  );
}

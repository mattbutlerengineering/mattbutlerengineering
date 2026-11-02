import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  Checkbox,
  Collapsible,
  Heading,
  Radio,
  RadioGroup,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import type { ClosureImpact, ClosureImpactGroup, ClosureImpactReservation } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { clockHourOfInstant } from "./clock-hour.js";
import { actionsFor, unmovable, type ChoiceMap, type GroupChoice } from "./close-draft.js";
import { CloseNoticePreview } from "./CloseNoticePreview.js";
import styles from "./CloseDialog.module.css";

const COLLAPSED_ROWS = 5;
const STUCK_NAMED_MAX = 5;

export interface CloseStepTwoProps {
  readonly venueId: string;
  readonly impact: ClosureImpact;
  readonly choices: ChoiceMap;
  readonly onChoose: (groupKey: string, choice: GroupChoice) => void;
  readonly urgent: boolean;
  readonly guestMessage: string;
  /** The message of each group's own closure, when the groups come from several (Add special dates). */
  readonly messageFor?: (groupKey: string) => string;
}

function GroupBlock(props: {
  readonly venueId: string;
  readonly group: ClosureImpactGroup;
  readonly choice: GroupChoice | undefined;
  readonly onChoose: (choice: GroupChoice) => void;
  readonly guestMessage: string;
}) {
  const { venueId, group, choice, onChoose, guestMessage } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const [showAll, setShowAll] = useState(false);
  const count = group.reservations.length;
  const date = format.formatCalendarDate(group.date, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const bookingText = (r: ClosureImpactReservation): string =>
    t("availability.close.step2.booking", {
      time: format.formatTime(r.startTime),
      name: r.guestName ?? t("availability.close.step2.guestUnnamed"),
      size: r.partySize,
    });
  const stuck = unmovable(group);
  // Named in full, not only the rows on show: the choice is for the whole group.
  const stuckNames = [
    ...stuck.slice(0, STUCK_NAMED_MAX).map(bookingText),
    ...(stuck.length > STUCK_NAMED_MAX
      ? [t("availability.close.moveUnavailableMore", { count: stuck.length - STUCK_NAMED_MAX })]
      : []),
  ].join("; ");
  const optionHint = (a: string): string | undefined => {
    if (a === "cancel") return t("availability.close.step2.cancelHint");
    return a === "move" && stuck.length > 0
      ? t("availability.close.step2.moveBlocked", {
          count: stuck.length,
          total: count,
          bookings: stuckNames,
        })
      : undefined;
  };
  const rows = showAll ? group.reservations : group.reservations.slice(0, COLLAPSED_ROWS);
  const action = choice?.action;

  const moveNote = (r: ClosureImpactReservation, chosen: GroupChoice["action"]): string => {
    if (r.proposedStart === null) return ` · ${t("availability.close.step2.noOpenTime")}`;
    return chosen === "move" && r.proposedStart
      ? ` · ${t("availability.close.step2.movesTo", {
          time: format.formatTime(r.proposedStart),
          count: clockHourOfInstant(r.proposedStart, format),
        })}`
      : "";
  };

  return (
    <section className={styles.group} aria-labelledby={`close-group-${group.groupKey}`}>
      <Heading level={3} size={4} id={`close-group-${group.groupKey}`}>
        {t(`availability.close.step2.group.${group.kind}`, { date, count })}
      </Heading>
      <ul className={styles.bookings}>
        {rows.map((r) => (
          <li key={r.id}>
            <Text as="span" variant="body" color="primary">
              {bookingText(r)}
              {r.deposit
                ? ` · ${t("availability.close.step2.deposit", { amount: format.formatMoney(r.deposit.amountCents) })}`
                : ""}
              {r.runsIntoClosure ? ` · ${t("availability.close.step2.runsInto")}` : ""}
              {moveNote(r, action)}
            </Text>
          </li>
        ))}
      </ul>
      {count > COLLAPSED_ROWS && !showAll && (
        <Button variant="secondary" onClick={() => setShowAll(true)}>
          {t("availability.close.step2.showAll", { count })}
        </Button>
      )}
      <RadioGroup
        label={t("availability.close.step2.choose")}
        name={`close-choice-${group.groupKey}`}
        value={action ?? ""}
        onChange={(value) =>
          onChoose({ action: value as GroupChoice["action"], acknowledged: false })
        }
      >
        {actionsFor(group.kind).map((a) => (
          <Radio
            key={a}
            value={a}
            label={t(`availability.close.step2.action.${a}`)}
            description={optionHint(a)}
            disabled={a === "move" && stuck.length > 0}
          />
        ))}
      </RadioGroup>
      {action === "keep_silent" && (
        <Checkbox
          label={t("availability.close.step2.acknowledge", { count })}
          checked={choice?.acknowledged ?? false}
          onCheckedChange={(acknowledged) => onChoose({ action, acknowledged })}
        />
      )}
      {action && action !== "keep_silent" && (
        <Collapsible trigger={t("availability.close.step2.preview")}>
          <CloseNoticePreview
            venueId={venueId}
            group={group}
            action={action}
            guestMessage={guestMessage}
          />
        </Collapsible>
      )}
    </section>
  );
}

/** Step 2 of 2 (ux.md S7): the totals, then one required choice per affected group. */
export function CloseStepTwo(props: CloseStepTwoProps) {
  const { venueId, impact, choices, onChoose, urgent, guestMessage, messageFor } = props;
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      {urgent && <Alert variant="warning">{t("availability.close.step2.urgent")}</Alert>}
      <Text variant="body" color="primary">
        {t("availability.close.step2.header", {
          count: impact.reservations,
          guests: impact.covers,
          deposits: impact.depositsHeld,
        })}
      </Text>
      {impact.groups.map((group) => (
        <GroupBlock
          key={group.groupKey}
          venueId={venueId}
          group={group}
          choice={choices[group.groupKey]}
          guestMessage={messageFor ? messageFor(group.groupKey) : guestMessage}
          onChoose={(choice) => onChoose(group.groupKey, choice)}
        />
      ))}
    </Stack>
  );
}

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
import type { ClosureImpact, ClosureImpactGroup } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { actionsFor, type ChoiceMap, type GroupChoice } from "./close-draft.js";
import styles from "./CloseDialog.module.css";

const COLLAPSED_ROWS = 5;

export interface CloseStepTwoProps {
  readonly impact: ClosureImpact;
  readonly choices: ChoiceMap;
  readonly onChoose: (groupKey: string, choice: GroupChoice) => void;
  readonly urgent: boolean;
  readonly guestMessage: string;
}

function GroupBlock(props: {
  readonly group: ClosureImpactGroup;
  readonly choice: GroupChoice | undefined;
  readonly onChoose: (choice: GroupChoice) => void;
  readonly guestMessage: string;
}) {
  const { group, choice, onChoose, guestMessage } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const [showAll, setShowAll] = useState(false);
  const count = group.reservations.length;
  const date = format.formatCalendarDate(group.date, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const rows = showAll ? group.reservations : group.reservations.slice(0, COLLAPSED_ROWS);
  const action = choice?.action;

  return (
    <section className={styles.group} aria-labelledby={`close-group-${group.groupKey}`}>
      <Heading level={3} size={4} id={`close-group-${group.groupKey}`}>
        {t(`availability.close.step2.group.${group.kind}`, { date, count })}
      </Heading>
      <ul className={styles.bookings}>
        {rows.map((r) => (
          <li key={r.id}>
            <Text as="span" variant="body" color="primary">
              {t("availability.close.step2.booking", {
                time: format.formatTime(r.startTime),
                name: r.guestName ?? t("availability.close.step2.guestUnnamed"),
                size: r.partySize,
              })}
              {r.deposit
                ? ` · ${t("availability.close.step2.deposit", { amount: format.formatMoney(r.deposit.amountCents) })}`
                : ""}
              {r.runsIntoClosure ? ` · ${t("availability.close.step2.runsInto")}` : ""}
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
            description={a === "cancel" ? t("availability.close.step2.cancelHint") : undefined}
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
          <Text className={styles.preview}>
            {t(`availability.close.step2.previewText.${action}`, {
              date,
              message: guestMessage.trim(),
            }).trim()}
          </Text>
        </Collapsible>
      )}
    </section>
  );
}

/** Step 2 of 2 (ux.md S7): the totals, then one required choice per affected group. */
export function CloseStepTwo(props: CloseStepTwoProps) {
  const { impact, choices, onChoose, urgent, guestMessage } = props;
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
          group={group}
          choice={choices[group.groupKey]}
          guestMessage={guestMessage}
          onChoose={(choice) => onChoose(group.groupKey, choice)}
        />
      ))}
    </Stack>
  );
}

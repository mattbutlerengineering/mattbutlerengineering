/**
 * GuestHistoryStrip — what the Host sees once a returning guest is picked (linked) or recognised:
 * the title, a Clear button, segment/visits/no-show/risk signals and dietary tags, with allergies
 * marked (ux.md § Strip). Fed by the `Guest` from the search row; owns no state.
 */
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Stack, Tag, Text } from "@mattbutlerengineering/rialto";
import type { Guest } from "@mbe/types";
import {
  riskText,
  segmentText,
  getRiskVariant,
  getSegmentLabel,
  getSegmentVariant,
  isAllergyTag,
} from "./guest-signals.js";
import {
  noShowsSentence,
  stripTitle,
  visitsSentence,
  type GuestLookupMode,
} from "./guest-lookup-rows.js";
import styles from "./GuestHistoryStrip.module.css";

export interface GuestHistoryStripProps {
  guest: Guest;
  mode: GuestLookupMode;
  /** Surface-specific line under the signals, e.g. the reservation dialog's link-only note. */
  caption?: string;
  onClear: () => void;
}

export function GuestHistoryStrip({ guest, mode, caption, onClear }: GuestHistoryStripProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const segmentLabel = getSegmentLabel(guest.visitCount, guest.tags);
  const noShows = noShowsSentence(guest.noShowCount, t);
  const restrictions = guest.dietaryRestrictions ?? [];

  return (
    <div role="group" aria-labelledby={titleId} className={styles.strip}>
      <Stack gap="xs">
        <Stack direction="row" gap="sm" align="center" justify="between">
          <Text id={titleId} variant="caption" color="primary">
            {stripTitle(mode, guest.name, t)}
          </Text>
          <Button
            variant="ghost"
            aria-label={t("crm.clearAria", { name: guest.name })}
            onClick={onClear}
          >
            {t("crm.clear")}
          </Button>
        </Stack>
        <Stack direction="row" gap="xs" align="center" wrap>
          {segmentLabel !== "New" && (
            <Badge variant={getSegmentVariant(segmentLabel)}>{segmentText(segmentLabel, t)}</Badge>
          )}
          <Text variant="caption" color="secondary">
            {visitsSentence(guest.visitCount, t)}
          </Text>
          {noShows && (
            <>
              <Text variant="caption" color="secondary">
                {noShows}
              </Text>
              <Badge variant={getRiskVariant(guest.riskScore)}>
                {riskText(guest.riskScore, t)}
              </Badge>
            </>
          )}
        </Stack>
        {restrictions.length > 0 && (
          <Stack direction="row" gap="xs" wrap>
            {restrictions.map((restriction) =>
              isAllergyTag(restriction) ? (
                <Tag key={restriction} variant="error">
                  {t("crm.allergy", { restriction })}
                </Tag>
              ) : (
                <Tag key={restriction}>{restriction}</Tag>
              )
            )}
          </Stack>
        )}
        {caption && (
          <Text variant="caption" color="secondary">
            {caption}
          </Text>
        )}
      </Stack>
    </div>
  );
}

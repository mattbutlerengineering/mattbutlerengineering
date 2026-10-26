import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Button,
  DateRangePicker,
  Drawer,
  EmptyState,
  Select,
  Skeleton,
  Stack,
  Tag,
  Text,
  useToast,
  type DateRangeValue,
} from "@mattbutlerengineering/rialto";
import { useAuth } from "@mbe/auth/react";
import type { AvailabilityChangeEntry, AvailabilityChangesQuery, TeamRole } from "@mbe/types";
import {
  useAvailabilityChanges,
  useAvailabilityConfig,
  useRevertAvailabilityChange,
} from "../../hooks/useAvailability.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { revertErrorText } from "./revert-error.js";
import styles from "./AvailabilityHistoryDrawer.module.css";

/** Entries per page; "Show more" grows the window by one page. */
const PAGE_SIZE = 25;

const ALL = "all";
const ME = "me";

export interface AvailabilityHistoryDrawerProps {
  readonly open: boolean;
  readonly venueId: string;
  /** `undefined` while the Team read is in flight; only a Manager is offered Revert. */
  readonly viewerRole: TeamRole | undefined;
  readonly onClose: () => void;
  /** Open the calendar's drawer for a service date. */
  readonly onOpenDay: (date: string) => void;
}

interface EntryRowProps {
  readonly entry: AvailabilityChangeEntry;
  readonly mine: boolean;
  readonly canRevert: boolean;
  readonly reverting: boolean;
  readonly onRevert: (id: string) => void;
  readonly onOpenDay: (date: string) => void;
}

function EntryRow({ entry, mine, canRevert, reverting, onRevert, onOpenDay }: EntryRowProps) {
  const { t } = useTranslation();
  const format = useVenueFormat();
  const when = format.formatInstant(entry.at, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <li className={styles.entry}>
      <Text variant="body" color="primary">
        {entry.summary}
      </Text>
      <Text variant="caption" color="secondary">
        {t("availability.history.byWhen", {
          who: mine ? t("availability.history.you") : t("availability.history.teammate"),
          when,
        })}
      </Text>
      {(entry.notifiedGuests || entry.revertedById) && (
        <div className={styles.tags}>
          {entry.notifiedGuests && <Tag>{t("availability.history.guestsTold")}</Tag>}
          {entry.revertedById && <Tag>{t("availability.history.undone")}</Tag>}
        </div>
      )}
      <div className={styles.actions}>
        {entry.affectedFrom && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenDay(entry.affectedFrom as string)}
          >
            {t("availability.history.viewDay")}
          </Button>
        )}
        {canRevert && entry.revertible && (
          <Button
            variant="secondary"
            size="sm"
            disabled={reverting}
            onClick={() => onRevert(entry.id)}
          >
            {t("availability.history.revert")}
          </Button>
        )}
      </div>
    </li>
  );
}

/** History (F12): who changed availability, when and what, newest first, with Revert. */
export function AvailabilityHistoryDrawer(props: AvailabilityHistoryDrawerProps) {
  const { open, venueId, viewerRole, onClose, onOpenDay } = props;
  const { t } = useTranslation();
  const { toast } = useToast();
  const format = useVenueFormat();
  const { user } = useAuth();
  const revert = useRevertAvailabilityChange();
  const config = useAvailabilityConfig({ venueId });

  const [kind, setKind] = useState(ALL);
  const [person, setPerson] = useState(ALL);
  const [range, setRange] = useState<DateRangeValue>({ start: null, end: null });
  const [pages, setPages] = useState(1);
  const [revertingId, setRevertingId] = useState<string | null>(null);

  const query: AvailabilityChangesQuery = {
    limit: PAGE_SIZE * pages,
    offset: 0,
    ...(kind !== ALL ? { kind } : {}),
    ...(person === ME && user ? { actorId: user.id } : {}),
    ...(range.start && range.end ? { from: range.start, to: range.end } : {}),
  };
  const history = useAvailabilityChanges({ venueId, query, enabled: open });
  const items = history.data?.items ?? [];
  const filtered = kind !== ALL || person !== ALL || range.start !== null;

  const onRevert = async (changeId: string) => {
    if (!config.data) return;
    setRevertingId(changeId);
    try {
      await revert.mutateAsync({ venueId, changeId, expectedVersion: config.data.version });
      toast({ title: t("availability.undo.done"), variant: "success", duration: 5000 });
    } catch (error) {
      toast({ title: revertErrorText(error, t), variant: "error", duration: 8000 });
    } finally {
      setRevertingId(null);
    }
  };

  let body;
  if (history.error) {
    const failure = describeApiError(history.error);
    body = (
      <Alert variant="error" title={t("availability.history.loadError")}>
        <Stack gap="sm">
          <Text variant="body">{failure.detail}</Text>
          <Button variant="secondary" size="sm" onClick={() => void history.refetch()}>
            {t("availability.history.retry")}
          </Button>
        </Stack>
      </Alert>
    );
  } else if (history.isLoading || !history.data) {
    body = <Skeleton variant="text" lines={4} />;
  } else if (items.length === 0) {
    body = (
      <EmptyState
        heading={filtered ? t("availability.history.noMatch") : t("availability.history.empty")}
        headingLevel={3}
      />
    );
  } else {
    body = (
      <Stack gap="md">
        <ol className={styles.list}>
          {items.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              mine={user?.id === entry.actorId}
              canRevert={viewerRole === "manager" && config.data != null}
              reverting={revertingId === entry.id}
              onRevert={(id) => void onRevert(id)}
              onOpenDay={onOpenDay}
            />
          ))}
        </ol>
        {history.data.total > items.length && (
          <Button variant="secondary" onClick={() => setPages(pages + 1)}>
            {t("availability.history.showMore")}
          </Button>
        )}
      </Stack>
    );
  }

  return (
    <Drawer open={open} onClose={onClose} title={t("availability.history.title")}>
      <Stack gap="md">
        <div className={styles.filters}>
          <Select
            label={t("availability.history.typeLabel")}
            value={kind}
            onChange={(value) => {
              setKind(value);
              setPages(1);
            }}
            options={[
              { value: ALL, label: t("availability.history.typeAll") },
              { value: "config", label: t("availability.history.typeConfig") },
              { value: "closure", label: t("availability.history.typeClosure") },
              { value: "reopen", label: t("availability.history.typeReopen") },
              { value: "tonight", label: t("availability.history.typeTonight") },
              { value: "tonight_end", label: t("availability.history.typeTonightEnded") },
              { value: "revert", label: t("availability.history.typeRevert") },
            ]}
          />
          <Select
            label={t("availability.history.personLabel")}
            value={person}
            onChange={(value) => {
              setPerson(value);
              setPages(1);
            }}
            options={[
              { value: ALL, label: t("availability.history.personAll") },
              { value: ME, label: t("availability.history.personMe") },
            ]}
          />
          <DateRangePicker
            label={t("availability.history.rangeLabel")}
            placeholder={t("availability.history.rangePlaceholder")}
            locale={format.locale}
            value={range}
            onChange={(value) => {
              setRange(value);
              setPages(1);
            }}
          />
        </div>
        {body}
      </Stack>
    </Drawer>
  );
}

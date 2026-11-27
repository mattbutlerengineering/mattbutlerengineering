import type { TimeSlot, BookingPaused } from "@mbe/types";
import {
  Button,
  Alert,
  Skeleton,
  SkeletonGroup,
  EmptyState,
  Heading,
  Text,
} from "@mattbutlerengineering/rialto";
import { useTranslation } from "react-i18next";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { addDays, venueDate } from "../../utils/service-day.js";
import { TimeSlotListbox } from "./TimeSlotListbox.js";
import type { ClosedMidBooking } from "./useBookingFlow.js";
import styles from "./TimeSlotPicker.module.css";

export interface TimeSlotPickerProps {
  slots: TimeSlot[];
  selectedSlot: TimeSlot | null;
  isLoading: boolean;
  error: string | null;
  onSelectSlot: (slot: TimeSlot) => void;
  onBack: () => void;
  date: string;
  partySize: number;
  /** When provided and slots are empty, shows a "Join Waitlist" option */
  onJoinWaitlist?: () => void;
  /** Estimated wait minutes to display in the no-availability state */
  estimatedWaitMinutes?: number;
  /**
   * Whether the venue has operating hours configured. Defaults to `true`
   * (assume configured) so callers that haven't checked keep the existing
   * "fully booked" messaging when slots are empty.
   */
  hasOperatingHours?: boolean;
  /** Who is viewing this picker — staff get a prompt to configure hours. */
  audience?: "staff" | "guest";
  /** Staff-only: navigates to the operating-hours setup page. */
  onSetHours?: () => void;
  /**
   * IANA timezone the venue operates in (e.g. "America/New_York"). When
   * provided, slot times are grouped and displayed in this zone rather than
   * the guest's device timezone (#4976). Omit only when unknown — falls
   * back to device-local.
   */
  venueTimezone?: string;
  /** The venue's message when this date is closed (ux.md F9.2). */
  closure?: string;
  /** Online booking is paused venue-wide (ux.md F9.3). */
  bookingPaused?: BookingPaused | null;
  /** A closure landed after the guest chose a time (ux.md F9.5). */
  closedMidBooking?: ClosedMidBooking | null;
  /** Venue contact phone, offered when nothing is configured online. */
  phone?: string;
}

const SKELETON_SLOT_COUNT = 8;
/** How many nearby times a mid-booking closure offers (ux.md F9.5). */
const MAX_ALTERNATIVES = 3;

type SlotService = NonNullable<TimeSlot["service"]>;

interface ServiceGroup {
  key: string;
  /** The venue's service name as typed; null when the slots carry no service. */
  name: string | null;
  slots: TimeSlot[];
}

const byTime = (a: TimeSlot, b: TimeSlot) =>
  new Date(a.time).getTime() - new Date(b.time).getTime();

/**
 * Slots in time order, grouped by venue service in the order services open.
 * Groups only when EVERY slot names its service (legacy-hours venues send
 * none); otherwise one unnamed group, so a slot is never orphaned (ux.md F9.6).
 */
function groupByService(slots: readonly TimeSlot[]): ServiceGroup[] {
  const sorted = [...slots].sort(byTime);
  const withService = sorted.filter(
    (slot): slot is TimeSlot & { service: SlotService } => slot.service !== undefined
  );
  if (withService.length !== sorted.length) return [{ key: "all", name: null, slots: sorted }];
  return [...new Set(withService.map((slot) => slot.service.id))].map((id) => {
    const groupSlots = withService.filter((slot) => slot.service.id === id);
    return { key: id, name: groupSlots[0]?.service.name ?? null, slots: groupSlots };
  });
}

/** The `max` slots nearest `lostTime`, back in time order. */
function nearestSlots(slots: TimeSlot[], lostTime: string, max: number): TimeSlot[] {
  const target = new Date(lostTime).getTime();
  return [...slots]
    .sort(
      (a, b) =>
        Math.abs(new Date(a.time).getTime() - target) -
        Math.abs(new Date(b.time).getTime() - target)
    )
    .slice(0, max)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

export function TimeSlotPicker({
  slots: allSlots,
  selectedSlot,
  isLoading,
  error,
  onSelectSlot,
  onBack,
  date,
  partySize,
  onJoinWaitlist,
  estimatedWaitMinutes,
  hasOperatingHours = true,
  audience = "guest",
  onSetHours,
  venueTimezone,
  closure,
  bookingPaused,
  closedMidBooking,
  phone,
}: TimeSlotPickerProps) {
  const { t } = useTranslation();
  const format = useVenueFormat({ ianaTimezone: venueTimezone ?? "", currencyCode: "USD" });
  const formattedDate = format.formatLongDate(date);

  // The server owns the booking window; this only guards a slot that went
  // stale while the picker sat open (or a cached response) from being offered.
  const nowMs = Date.now();
  const slots = allSlots.filter((slot) => new Date(slot.time).getTime() >= nowMs);

  // #4979: a wait estimate ("~30 min") only means anything for a walk-in
  // today — showing it for a date days out promised a wait time that has no
  // relationship to reality. `date` is a future date (not just "not today")
  // so a stale/past `date` prop (never selectable via the real UI) keeps the
  // pre-existing behavior rather than being newly suppressed.
  const isFutureDate = date > venueDate(new Date(), venueTimezone);

  // A slot on the venue's next calendar day is after midnight; it gets its own
  // list inside its service, named for that day (ux.md F9.6).
  const isAfterMidnight = (slot: TimeSlot) => venueDate(new Date(slot.time), venueTimezone) > date;

  if (isLoading) {
    return (
      <SkeletonGroup className={styles.loadingContainer}>
        <div className={styles.slotGrid}>
          {Array.from({ length: SKELETON_SLOT_COUNT }, (_, i) => (
            <Skeleton key={i} variant="rect" width="100%" height={38} />
          ))}
        </div>
      </SkeletonGroup>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <Alert
          variant="error"
          actions={
            <Button variant="ghost" size="sm" onClick={onBack} type="button">
              {t("bookingWidget.timeSlot.changeSearch")}
            </Button>
          }
        >
          {error}
        </Alert>
      </div>
    );
  }

  const renderListbox = (periodSlots: TimeSlot[], label: string) => (
    <TimeSlotListbox
      slots={periodSlots}
      selectedSlot={selectedSlot}
      onSelectSlot={onSelectSlot}
      label={label}
      venueTimezone={venueTimezone}
    />
  );

  const renderEmpty = () => {
    if (bookingPaused) {
      return (
        <EmptyState
          heading={t("bookingWidget.timeSlot.pausedHeading")}
          description={
            bookingPaused.phone
              ? `${bookingPaused.message} ${t("bookingWidget.timeSlot.pausedCall", { phone: bookingPaused.phone })}`
              : bookingPaused.message
          }
        />
      );
    }
    if (closure) {
      return (
        <EmptyState
          heading={t("bookingWidget.timeSlot.closedHeading", { date: formattedDate })}
          description={closure}
          action={
            <Button variant="primary" onClick={onBack} type="button">
              {t("bookingWidget.timeSlot.seeOtherDates")}
            </Button>
          }
        />
      );
    }
    if (!hasOperatingHours) {
      return audience === "staff" ? (
        <EmptyState
          heading={t("bookingWidget.timeSlot.noHoursStaffHeading")}
          description={t("bookingWidget.timeSlot.noHoursStaffDescription")}
          action={
            <Button variant="primary" onClick={onSetHours} type="button">
              {t("bookingWidget.timeSlot.setHours")}
            </Button>
          }
        />
      ) : (
        <EmptyState
          heading={t("bookingWidget.timeSlot.noHoursGuestHeading")}
          description={
            phone
              ? t("bookingWidget.timeSlot.noHoursGuestCall", { phone })
              : t("bookingWidget.timeSlot.noHoursGuestDescription")
          }
        />
      );
    }
    if (onJoinWaitlist) {
      return (
        <div className={styles.noAvailabilityContainer}>
          <EmptyState
            heading={t("bookingWidget.timeSlot.noTimesHeading")}
            description={
              estimatedWaitMinutes != null && !isFutureDate
                ? t("bookingWidget.estimatedWait", { minutes: estimatedWaitMinutes })
                : t("bookingWidget.timeSlot.tryDifferent")
            }
          />
          <Button variant="primary" onClick={onJoinWaitlist} type="button">
            {t("bookingWidget.timeSlot.joinWaitlist")}
          </Button>
        </div>
      );
    }
    return (
      <EmptyState
        heading={t("bookingWidget.timeSlot.noTimesHeading")}
        description={t("bookingWidget.timeSlot.tryDifferent")}
      />
    );
  };

  const renderMidBooking = (notice: ClosedMidBooking) => {
    const alternatives = nearestSlots(slots, notice.lostTime, MAX_ALTERNATIVES);
    return (
      <div className={styles.periods}>
        <Alert variant="warning">
          <strong>{t("bookingWidget.timeSlot.justClosed")}</strong> {notice.message}
        </Alert>
        {alternatives.length > 0 && (
          <div>
            <Heading className={styles.periodLabel}>
              {t("bookingWidget.timeSlot.otherTimes")}
            </Heading>
            {renderListbox(alternatives, t("bookingWidget.timeSlot.otherTimes"))}
          </div>
        )}
        <Button variant="secondary" onClick={onBack} type="button">
          {t("bookingWidget.timeSlot.pickAnotherDate")}
        </Button>
      </div>
    );
  };

  /** The same-day and after-midnight lists' names; a service's name only when it is headed. */
  const listLabels = (service: string | null): [string, string] => {
    const nextDay = format.formatLongDate(addDays(date, 1));
    return service
      ? [
          t("bookingWidget.timeSlot.serviceTimes", { service }),
          t("bookingWidget.timeSlot.serviceTimesAfterMidnight", { service, date: nextDay }),
        ]
      : [
          t("bookingWidget.timeSlot.availableTimes"),
          t("bookingWidget.timeSlot.availableTimesAfterMidnight", { date: nextDay }),
        ];
  };

  const renderGroups = () => {
    const groups = groupByService(slots);
    const headed = groups.length > 1;
    return (
      <div className={styles.periods}>
        {groups.map((group) => {
          const name = headed ? group.name : null;
          const [sameDayLabel, afterMidnightLabel] = listLabels(name);
          const lists: Array<[TimeSlot[], string]> = [
            [group.slots.filter((slot) => !isAfterMidnight(slot)), sameDayLabel],
            [group.slots.filter(isAfterMidnight), afterMidnightLabel],
          ];
          return (
            <div key={group.key}>
              {/* The venue's own word for its service, shown as typed — never through t(). */}
              {name && <Heading className={styles.periodLabel}>{name}</Heading>}
              {lists
                .filter(([listSlots]) => listSlots.length > 0)
                .map(([listSlots, label]) => (
                  <div key={label}>{renderListbox(listSlots, label)}</div>
                ))}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <Button variant="ghost" size="sm" onClick={onBack} type="button">
          {t("bookingWidget.back")}
        </Button>
        <div className={styles.summaryRight}>
          <div className={styles.summaryDate}>{formattedDate}</div>
          <div className={styles.summaryParty}>
            {t("bookingWidget.guests", { count: partySize })}
          </div>
        </div>
      </div>

      {closedMidBooking
        ? renderMidBooking(closedMidBooking)
        : slots.length === 0
          ? renderEmpty()
          : renderGroups()}

      {selectedSlot && (
        <div className={styles.selectedSummary}>
          <Text className={styles.selectedSummaryText}>
            {t("bookingWidget.timeSlot.selected")}{" "}
            <strong>{format.formatTime(selectedSlot.time)}</strong>
            {selectedSlot.tables && selectedSlot.tables.length > 0 && (
              <Text as="span" className={styles.selectedSummaryNote}>
                {" "}
                -{" "}
                {t("bookingWidget.timeSlot.tablesAvailable", {
                  count: selectedSlot.tables.length,
                })}
              </Text>
            )}
          </Text>
        </div>
      )}
    </div>
  );
}

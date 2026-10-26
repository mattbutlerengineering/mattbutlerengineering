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
import { getHourIn } from "../../utils/format.js";
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

type Period = "lunch" | "dinner" | "late" | "afterMidnight";

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

  // Get hour from ISO datetime for grouping — in the venue's timezone when
  // known, otherwise the device's (#4976).
  const getHour = (isoTime: string) => {
    return venueTimezone ? getHourIn(isoTime, venueTimezone) : new Date(isoTime).getHours();
  };

  // A slot on the venue's next calendar day is after midnight and belongs
  // with Late Night, not lunch (ux.md F9.6).
  const periodOf = (isoTime: string): Period => {
    if (venueDate(new Date(isoTime), venueTimezone) > date) return "afterMidnight";
    const hour = getHour(isoTime);
    if (hour < 15) return "lunch";
    return hour < 20 ? "dinner" : "late";
  };

  const groupedSlots = slots.reduce(
    (groups, slot) => {
      const period = periodOf(slot.time);
      return { ...groups, [period]: [...groups[period], slot] };
    },
    {
      lunch: [] as TimeSlot[],
      dinner: [] as TimeSlot[],
      late: [] as TimeSlot[],
      afterMidnight: [] as TimeSlot[],
    }
  );

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

  const renderPeriods = () => {
    const showLate = groupedSlots.late.length > 0 || groupedSlots.afterMidnight.length > 0;
    const sections: Array<{
      key: string;
      heading: Exclude<Period, "afterMidnight">;
      lists: Array<[TimeSlot[], string]>;
    }> = [
      {
        key: "lunch",
        heading: "lunch",
        lists: [[groupedSlots.lunch, t("bookingWidget.timeSlot.periodTimes.lunch")]],
      },
      {
        key: "dinner",
        heading: "dinner",
        lists: [[groupedSlots.dinner, t("bookingWidget.timeSlot.periodTimes.dinner")]],
      },
      {
        key: "late",
        heading: "late",
        lists: [
          [groupedSlots.late, t("bookingWidget.timeSlot.periodTimes.late")],
          [
            groupedSlots.afterMidnight,
            t("bookingWidget.timeSlot.periodTimes.lateAfterMidnight", {
              date: format.formatLongDate(addDays(date, 1)),
            }),
          ],
        ],
      },
    ];
    return (
      <div className={styles.periods}>
        {sections.map(({ key, heading, lists }) => {
          const visible = lists.filter(([periodSlots]) => periodSlots.length > 0);
          if (visible.length === 0 || (key === "late" && !showLate)) return null;
          return (
            <div key={key}>
              <Heading className={styles.periodLabel}>
                {t(`bookingWidget.timeSlot.periods.${heading}`)}
              </Heading>
              {visible.map(([periodSlots, label]) => (
                <div key={label}>{renderListbox(periodSlots, label)}</div>
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
          : renderPeriods()}

      {selectedSlot && (
        <div className={styles.selectedSummary}>
          <Text className={styles.selectedSummaryText}>
            {t("bookingWidget.timeSlot.selected")}{" "}
            <strong>{format.formatTime(selectedSlot.time)}</strong>
            {selectedSlot.tables && selectedSlot.tables.length > 0 && (
              <Text className={styles.selectedSummaryNote}>
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

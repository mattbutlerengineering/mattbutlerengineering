import { useTranslation } from "react-i18next";
import {
  Alert,
  Checkbox,
  DatePicker,
  Input,
  Radio,
  RadioGroup,
  Select,
  Skeleton,
  Stack,
  Tag,
  Text,
  TextArea,
} from "@mattbutlerengineering/rialto";
import { GUEST_MESSAGE_MAX_LENGTH, type ClosureImpact, type VenueService } from "@mbe/types";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { addDays } from "../../utils/service-day.js";
import { minuteText } from "./closure-band.js";
import type { BookingChannel, CloseForm, CloseWhat, CloseWhen } from "./close-draft.js";
import styles from "./CloseDialog.module.css";

const CHANNELS: readonly BookingChannel[] = ["online", "phone", "waitlist"];
const SUGGESTIONS = ["private", "weather", "holiday"] as const;
const HALF_HOURS = Array.from({ length: 48 }, (_, i) => i * 30);
/** 2026-01-04 is a Sunday; weekday index n is that date plus n days. */
const SUNDAY = "2026-01-04";
const ALL_DAY = "all";
/** Matches the Availability calendar, which is Monday-first. */
const WEEK_STARTS_ON = 1;

export interface CloseStepOneProps {
  readonly form: CloseForm;
  readonly onChange: (form: CloseForm) => void;
  readonly services: readonly VenueService[];
  readonly today: string;
  /** `true` while the impact lookup is in flight. */
  readonly impactLoading: boolean;
  readonly impactFailed: boolean;
  readonly impact: ClosureImpact | null | undefined;
  /** Dates in the closure that already carry special hours. */
  readonly replacedDate: string | null;
  readonly invalid: "what" | "when" | "guestMessage" | null;
  /** A Host's emergency close: What and When are fixed to the whole venue, tonight. */
  readonly locked?: boolean;
  /** An edit of one date of a series: When is fixed to that single date (the engine applies it on its start only). */
  readonly dateLocked?: boolean;
}

function whenKindDefaults(kind: CloseWhen["kind"], today: string): CloseWhen {
  switch (kind) {
    case "tonight":
      return { kind };
    case "date":
      return { kind, date: today };
    case "range":
      return { kind, from: today, to: addDays(today, 6) };
    case "repeats":
      return { kind, weekdays: [], from: today, to: addDays(today, 90) };
    default:
      return { kind: "until-reopen", from: today };
  }
}

function whatKindDefaults(kind: string, services: readonly VenueService[]): CloseWhat {
  if (kind === "service") return { kind, serviceId: services[0]?.id ?? "" };
  if (kind === "booking") return { kind, types: ["online"] };
  return { kind: "venue" };
}

export function CloseStepOne(props: CloseStepOneProps) {
  const { form, onChange, services, today, impact, impactLoading, impactFailed } = props;
  const { t } = useTranslation();
  const format = useVenueFormat();
  const patch = (next: Partial<CloseForm>) => onChange({ ...form, ...next });
  const { what, when } = form;

  const fullDate = (date: string) =>
    format.formatCalendarDate(date, { weekday: "short", month: "short", day: "numeric" });
  const dateField = (label: string, value: string, set: (v: string) => void) => (
    <DatePicker
      label={label}
      value={value || null}
      min={today}
      locale={format.locale}
      weekStartsOn={WEEK_STARTS_ON}
      onChange={(v) => set(v ?? "")}
    />
  );
  const firstDate =
    when.kind === "date"
      ? when.date
      : when.kind === "tonight"
        ? today
        : "from" in when
          ? when.from
          : "";

  return (
    <Stack gap="md">
      {props.locked && (
        <dl className={styles.locked}>
          <dt>{t("availability.close.what.label")}</dt>
          <dd>{t("availability.close.what.venue")}</dd>
          <dt>{t("availability.close.when.label")}</dt>
          <dd>{t("availability.close.when.tonight")}</dd>
        </dl>
      )}
      {!props.locked && (
        <>
          <RadioGroup
            label={t("availability.close.what.label")}
            name="close-what"
            value={what.kind}
            onChange={(kind) => patch({ what: whatKindDefaults(kind, services) })}
          >
            <Radio value="venue" label={t("availability.close.what.venue")} />
            <Radio
              value="service"
              label={t("availability.close.what.service")}
              disabled={services.length === 0}
            />
            <Radio value="booking" label={t("availability.close.what.booking")} />
          </RadioGroup>
          {what.kind === "service" && (
            <Select
              label={t("availability.close.what.pickService")}
              value={what.serviceId}
              options={services.map((s) => ({ value: s.id, label: s.name }))}
              onChange={(serviceId) => patch({ what: { kind: "service", serviceId } })}
            />
          )}
          {what.kind === "booking" && (
            <Stack gap="xs">
              {CHANNELS.map((channel) => (
                <Checkbox
                  key={channel}
                  label={t(`availability.close.what.channel.${channel}`)}
                  checked={what.types.includes(channel)}
                  onCheckedChange={(on) =>
                    patch({
                      what: {
                        kind: "booking",
                        types: on
                          ? [...what.types, channel]
                          : what.types.filter((c) => c !== channel),
                      },
                    })
                  }
                />
              ))}
              {props.invalid === "what" && (
                <Text variant="caption" color="secondary" role="alert">
                  {t("availability.close.what.channelRequired")}
                </Text>
              )}
            </Stack>
          )}

          {props.dateLocked && when.kind === "date" ? (
            <dl className={styles.locked}>
              <dt>{t("availability.close.when.label")}</dt>
              <dd>{fullDate(when.date)}</dd>
            </dl>
          ) : (
            <>
              <RadioGroup
                label={t("availability.close.when.label")}
                name="close-when"
                value={when.kind}
                onChange={(kind) =>
                  patch({ when: whenKindDefaults(kind as CloseWhen["kind"], firstDate || today) })
                }
              >
                <Radio value="tonight" label={t("availability.close.when.tonight")} />
                <Radio value="date" label={t("availability.close.when.date")} />
                <Radio value="range" label={t("availability.close.when.range")} />
                <Radio value="repeats" label={t("availability.close.when.repeats")} />
                <Radio value="until-reopen" label={t("availability.close.when.untilReopen")} />
              </RadioGroup>
              <div className={styles.row}>
                {when.kind === "date" &&
                  dateField(t("availability.close.when.dateLabel"), when.date, (date) =>
                    patch({ when: { kind: "date", date } })
                  )}
                {when.kind === "until-reopen" &&
                  dateField(t("availability.close.when.startingLabel"), when.from, (from) =>
                    patch({ when: { kind: "until-reopen", from } })
                  )}
                {(when.kind === "range" || when.kind === "repeats") && (
                  <>
                    {dateField(t("availability.close.when.fromLabel"), when.from, (from) =>
                      patch({ when: { ...when, from } })
                    )}
                    {dateField(t("availability.close.when.toLabel"), when.to, (to) =>
                      patch({ when: { ...when, to } })
                    )}
                  </>
                )}
              </div>
              {when.kind === "repeats" && (
                <fieldset className={styles.weekdays}>
                  <legend className={styles.legend}>{t("availability.close.when.weekdays")}</legend>
                  {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                    <Checkbox
                      key={day}
                      label={format.formatCalendarDate(addDays(SUNDAY, day), { weekday: "short" })}
                      checked={when.weekdays.includes(day)}
                      onCheckedChange={(on) =>
                        patch({
                          when: {
                            ...when,
                            weekdays: on
                              ? [...when.weekdays, day]
                              : when.weekdays.filter((d) => d !== day),
                          },
                        })
                      }
                    />
                  ))}
                </fieldset>
              )}
            </>
          )}
          {props.invalid === "when" && (
            <Text variant="caption" color="secondary" role="alert">
              {t("availability.close.when.invalid")}
            </Text>
          )}
        </>
      )}
      <Select
        label={t("availability.close.window.label")}
        value={form.fromMinute === null ? ALL_DAY : String(form.fromMinute)}
        options={[
          { value: ALL_DAY, label: t("availability.close.window.allDay") },
          ...HALF_HOURS.map((m) => ({
            value: String(m),
            label: t("availability.close.window.from", { time: minuteText(m, t, format) }),
          })),
        ]}
        onChange={(v) => patch({ fromMinute: v === ALL_DAY ? null : Number(v) })}
      />

      <Input
        label={t("availability.close.staffNote")}
        value={form.staffNote}
        maxLength={500}
        showOptional
        onChange={(e) => patch({ staffNote: e.target.value })}
      />
      <TextArea
        label={t("availability.close.guestMessage")}
        value={form.guestMessage}
        maxLength={GUEST_MESSAGE_MAX_LENGTH}
        error={props.invalid === "guestMessage"}
        showOptional
        onChange={(e) => patch({ guestMessage: e.target.value })}
      />
      <div className={styles.chips}>
        {SUGGESTIONS.map((key) => {
          const text = t(`availability.close.suggestions.${key}`);
          return (
            <Tag
              key={key}
              selected={form.guestMessage === text}
              onClick={() => patch({ guestMessage: text })}
            >
              {text}
            </Tag>
          );
        })}
      </div>

      {props.replacedDate && (
        <Alert variant="warning">
          {t("availability.close.replaces", { date: fullDate(props.replacedDate) })}
        </Alert>
      )}
      <section
        className={styles.impact}
        aria-live="polite"
        aria-label={t("availability.close.impactLabel")}
      >
        {impactLoading && <Skeleton variant="text" width="60%" />}
        {impactFailed && (
          <Text variant="body" color="secondary">
            {t("availability.close.impactError")}
          </Text>
        )}
        {impact && !impactLoading && (
          <Text variant="body" color="primary">
            {impact.reservations === 0
              ? t("availability.close.impactNone")
              : t("availability.close.impact", {
                  count: impact.reservations,
                  guests: impact.covers,
                })}
          </Text>
        )}
        {firstDate && what.kind !== "booking" && (
          <Text variant="caption" color="secondary">
            {form.guestMessage.trim()
              ? t("availability.close.guestsWillSeeMessage", {
                  date: fullDate(firstDate),
                  message: form.guestMessage.trim(),
                })
              : t("availability.close.guestsWillSee", { date: fullDate(firstDate) })}
          </Text>
        )}
      </section>
    </Stack>
  );
}

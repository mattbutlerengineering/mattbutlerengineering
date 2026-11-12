import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, EmptyState, Input, Stack, Text } from "@mattbutlerengineering/rialto";
import { ApiClientError, type InviteData, type InviteRsvp } from "@mbe/api-client";
import { usePublicApiClient } from "../hooks/usePublicApiClient.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";
import { WidgetLocaleScope, WidgetLocalePicker } from "../components/booking-widget/index.js";
import { formatLocalTime, formatLongDateWithYear } from "../utils/format.js";
import { buildReservationIcs, downloadIcsFile } from "../utils/ics.js";
import { homeUrl } from "../lib/host-brand.js";
import styles from "./InvitePage.module.css";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const FALLBACK_HOME_URL = homeUrl();

/** The invite view carries no end time; the calendar entry assumes a two-hour sitting. */
const ASSUMED_DURATION_MS = 2 * 60 * 60 * 1000;

class InviteLoadError extends Error {
  constructor(public readonly type: "ended" | "notFound") {
    super(type);
    this.name = "InviteLoadError";
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * The invite view has venue-local wall-clock date and time but no timezone, so the file
 * carries a floating local time (no TZID): the device shows the same wall time the card does.
 */
function buildInviteIcs(invite: InviteData): string {
  const start = new Date(`${invite.date}T${invite.time}:00Z`);
  const end = new Date(start.getTime() + ASSUMED_DURATION_MS);
  const ics = buildReservationIcs(
    {
      id: `invite-${invite.venue.slug}-${invite.date}T${invite.time}`,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      partySize: invite.partySize,
    },
    { name: invite.venue.name, ianaTimezone: "UTC" }
  );
  return ics.replace(/;TZID=UTC:/g, ":");
}

function EndedState({ heading, description }: { heading: string; description: string }) {
  const { t } = useTranslation();
  return (
    <main>
      <Stack align="center" justify="center" style={{ minHeight: "100vh", padding: "2rem" }}>
        <EmptyState
          variant="elevated"
          headingLevel={1}
          heading={heading}
          description={description}
          action={
            <a className={styles.homeLink} href={FALLBACK_HOME_URL}>
              {t("manageReservation.homeLink")}
            </a>
          }
        />
      </Stack>
    </main>
  );
}

/** Login-free party invitation at /i/:token. Never grants manage or cancel rights. */
export function InvitePage() {
  return (
    <WidgetLocaleScope>
      <InvitePageContent />
    </WidgetLocaleScope>
  );
}

function InvitePageContent() {
  const { t, i18n } = useTranslation();
  const { token = "" } = useParams();
  const [searchParams] = useSearchParams();
  // Kept for later attribution (a guest who books after an invite); nothing consumes it yet.
  const ref = searchParams.get("ref") ?? "";
  const api = usePublicApiClient({ baseUrl: API_BASE, maxRetries: 3 });
  const queryClient = useQueryClient();
  const queryKey = ["invite", token];
  const [firstName, setFirstName] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [reveal] = useState(() => (prefersReducedMotion() ? "static" : "animated"));

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async (): Promise<InviteData> => {
      try {
        return await api.reservations.getInvite(token);
      } catch (err) {
        if (err instanceof ApiClientError && err.statusCode === 410) {
          throw new InviteLoadError("ended");
        }
        throw new InviteLoadError("notFound");
      }
    },
    enabled: token !== "",
    retry: false,
  });

  const rsvp = useMutation({
    mutationFn: (reply: InviteRsvp) => api.reservations.rsvpInvite(token, reply),
    onSuccess: (_result, reply) => {
      queryClient.setQueryData<InviteData>(queryKey, (prev) =>
        prev ? { ...prev, rsvps: [...prev.rsvps, reply] } : prev
      );
      setFirstName("");
      setMessage({ kind: "success", text: t("invite.replied", { name: reply.firstName }) });
    },
    onError: (err) => {
      const status = err instanceof ApiClientError ? err.statusCode : 0;
      if (status === 410 || status === 404) {
        void queryClient.invalidateQueries({ queryKey });
        return;
      }
      setMessage({
        kind: "error",
        text: status === 409 ? t("invite.full") : t("invite.error"),
      });
    },
  });

  useDocumentTitle(
    data ? t("invite.venueDocumentTitle", { venue: data.venue.name }) : t("invite.documentTitle")
  );

  const submit = (status: InviteRsvp["status"]) => {
    const name = firstName.trim();
    if (!name) {
      setMessage({ kind: "error", text: t("invite.firstNameRequired") });
      return;
    }
    setMessage(null);
    rsvp.mutate({ firstName: name, status });
  };

  if (isLoading || (token !== "" && !data && !error)) {
    return (
      <main data-ref={ref || undefined}>
        <Text variant="body" color="secondary" role="status">
          {t("invite.loading")}
        </Text>
      </main>
    );
  }

  if (!data) {
    const ended = error instanceof InviteLoadError && error.type === "ended";
    return (
      <EndedState
        heading={ended ? t("invite.endedHeading") : t("invite.notFoundHeading")}
        description={ended ? t("invite.endedDescription") : t("invite.notFoundDescription")}
      />
    );
  }

  return (
    <main className={styles.page} data-ref={ref || undefined}>
      <Stack gap="lg" className={styles.column}>
        <Stack direction="row" justify="end">
          <WidgetLocalePicker />
        </Stack>

        <Card
          className={styles.card}
          data-testid="invite-card"
          data-reveal={reveal}
          role="group"
          aria-label={t("invite.cardLabel", { venue: data.venue.name })}
        >
          <Stack gap="sm" className={styles.cardInset}>
            <Text as="h1" variant="label" color="secondary">
              {t("invite.heading")}
            </Text>
            <Text as="p" variant="display">
              {data.venue.name}
            </Text>
            <Text variant="body">{formatLongDateWithYear(data.date, i18n.language)}</Text>
            <Text variant="body">{formatLocalTime(data.time, i18n.language)}</Text>
            <Text variant="body" color="secondary">
              {t("bookingWidget.guests", { count: data.partySize })}
            </Text>
          </Stack>
        </Card>

        <Card>
          <Stack gap="md" className={styles.cardInset}>
            <Text as="h2" variant="label">
              {t("invite.rsvpTitle")}
            </Text>
            {data.rsvps.length === 0 ? (
              <Text variant="body" color="secondary">
                {t("invite.noReplies")}
              </Text>
            ) : (
              <ul className={styles.rsvpList}>
                {data.rsvps.map((r, i) => (
                  <li key={`${r.firstName}-${i}`} className={styles.rsvpRow}>
                    <Text variant="body" dir="auto">
                      {r.firstName}
                    </Text>
                    <Text variant="caption" color="secondary">
                      {r.status === "IN" ? t("invite.statusIn") : t("invite.statusOut")}
                    </Text>
                  </li>
                ))}
              </ul>
            )}

            <Input
              label={t("invite.firstNameLabel")}
              placeholder={t("invite.firstNamePlaceholder")}
              value={firstName}
              maxLength={40}
              autoComplete="given-name"
              onChange={(e) => setFirstName(e.target.value)}
            />
            {message && (
              <Alert variant={message.kind === "error" ? "error" : "success"}>{message.text}</Alert>
            )}
            <div className={styles.actions}>
              <Button onClick={() => submit("IN")} disabled={rsvp.isPending}>
                {t("invite.imIn")}
              </Button>
              <Button variant="secondary" onClick={() => submit("OUT")} disabled={rsvp.isPending}>
                {t("invite.cantMakeIt")}
              </Button>
            </div>
          </Stack>
        </Card>

        <Card>
          <Stack gap="md" className={styles.cardInset}>
            <Text as="h2" variant="label">
              {t("bookingWidget.calendar.title")}
            </Text>
            <Button
              variant="secondary"
              onClick={() =>
                downloadIcsFile(buildInviteIcs(data), `invitation-${data.venue.slug}.ics`)
              }
            >
              {t("bookingWidget.calendar.downloadIcs")}
            </Button>
          </Stack>
        </Card>
      </Stack>
    </main>
  );
}

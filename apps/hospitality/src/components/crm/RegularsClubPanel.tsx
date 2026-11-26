import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Badge,
  Button,
  Card,
  Heading,
  Input,
  Skeleton,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import { useVenue } from "../../contexts/VenueContext.js";
import { describeApiError } from "../../lib/describe-api-error.js";
import { useVenueFormat } from "../../hooks/useVenueFormat.js";
import { useInviteMember, useMembers, useRevokeMember } from "../../hooks/useRegularsClub.js";
import styles from "./RegularsClubPanel.module.css";

/** Statuses where the server's own `detail` says what happened (the invitation email was not sent). */
const SERVER_REASON_STATUSES: ReadonlySet<number> = new Set([424]);

function failureMessage(error: unknown): string {
  const { statusCode, problemDetails } = (error ?? {}) as {
    statusCode?: unknown;
    problemDetails?: { detail?: unknown };
  };
  const detail = typeof problemDetails?.detail === "string" ? problemDetails.detail.trim() : "";
  if (typeof statusCode === "number" && SERVER_REASON_STATUSES.has(statusCode) && detail) {
    return detail;
  }
  return describeApiError(error).detail;
}

/**
 * Regulars Club: invite a guest by email, see each member's status, revoke. Revoking kills the
 * member link at once (the server checks the membership when the link is used).
 */
export function RegularsClubPanel() {
  const { t } = useTranslation();
  const { selectedVenueId } = useVenue();
  const fmt = useVenueFormat();
  const { data: members = [], isLoading, error } = useMembers({ venueId: selectedVenueId });
  const invite = useInviteMember();
  const revoke = useRevokeMember();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedVenueId) return;
    setSentTo(null);
    setFailure(null);
    const address = email.trim();
    try {
      await invite.mutateAsync({ venueId: selectedVenueId, email: address, name: name.trim() });
      setSentTo(address);
      setName("");
      setEmail("");
    } catch (err) {
      setFailure(failureMessage(err));
    }
  };

  const handleRevoke = async (guestId: string) => {
    setSentTo(null);
    setFailure(null);
    try {
      await revoke.mutateAsync(guestId);
    } catch (err) {
      setFailure(failureMessage(err));
    }
  };

  const canInvite = name.trim().length > 0 && email.trim().length > 0 && !invite.isPending;

  return (
    <Card className={styles.panel} data-testid="regulars-club">
      <Stack gap="md">
        <div>
          <Heading level={2} size={5}>
            {t("guests.regulars.title")}
          </Heading>
          <Text variant="caption" color="secondary">
            {t("guests.regulars.description")}
          </Text>
        </div>

        <form onSubmit={handleInvite} className={styles.form}>
          <Input
            label={t("guests.regulars.name")}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label={t("guests.regulars.email")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={!canInvite}>
            {invite.isPending ? t("guests.regulars.sending") : t("guests.regulars.invite")}
          </Button>
        </form>

        {sentTo && <Alert variant="success">{t("guests.regulars.sent", { email: sentTo })}</Alert>}
        {failure && <Alert variant="error">{failure}</Alert>}
        {error && !failure && <Alert variant="error">{describeApiError(error).detail}</Alert>}

        {isLoading ? (
          <Skeleton variant="card" width="100%" height={80} />
        ) : members.length === 0 ? (
          <Text color="secondary">{t("guests.regulars.empty")}</Text>
        ) : (
          <ul className={styles.list}>
            {members.map((member) => (
              <li key={member.id} className={styles.row}>
                <div className={styles.who}>
                  <Text variant="body" color="primary">
                    {member.guestName}
                  </Text>
                  {member.guestEmail && (
                    <Text variant="caption" color="secondary">
                      {member.guestEmail}
                    </Text>
                  )}
                </div>
                <Badge variant={member.status === "ACTIVE" ? "success" : "neutral"} size="sm">
                  {member.status === "ACTIVE"
                    ? t("guests.regulars.statusActive")
                    : t("guests.regulars.statusRevoked")}
                </Badge>
                <Text variant="caption" color="secondary">
                  {t("guests.regulars.invitedOn", {
                    date: fmt.formatInstant(member.invitedAt, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    }),
                  })}
                </Text>
                {member.status === "ACTIVE" && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={revoke.isPending}
                    aria-label={t("guests.regulars.revokeAria", { name: member.guestName })}
                    onClick={() => handleRevoke(member.guestId)}
                  >
                    {t("guests.regulars.revoke")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Stack>
    </Card>
  );
}

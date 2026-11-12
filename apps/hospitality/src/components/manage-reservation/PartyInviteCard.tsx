import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Stack, Text } from "@mattbutlerengineering/rialto";
import type { ManagedInviteSummary } from "@mbe/api-client";
import { usePublicApiClient } from "../../hooks/usePublicApiClient.js";
import { appUrl } from "../../lib/host-brand.js";
import styles from "./PartyInviteCard.module.css";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export interface PartyInviteCardProps {
  /** The manage token; authorises minting the invite and reading the RSVP counts. */
  token: string;
}

/**
 * "Invite your party" (The Invitation, #8665): lazily mints a forwardable invite link on first
 * share, hands it to the native share sheet (or copies it), and shows how many have said yes.
 * The invite link never grants manage or cancel rights.
 */
export function PartyInviteCard({ token }: PartyInviteCardProps) {
  const { t } = useTranslation();
  const api = usePublicApiClient({ baseUrl: API_BASE });
  const [summary, setSummary] = useState<ManagedInviteSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const inviteUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    api.reservations
      .getManagedInviteSummary(token)
      .then((s) => {
        if (live) setSummary(s);
      })
      .catch(() => {
        // The count is a nicety; the share action still works without it.
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the client is rebuilt each render; the token is the only input
  }, [token]);

  const share = async (): Promise<void> => {
    setPending(true);
    setFailed(false);
    setCopied(false);
    try {
      if (inviteUrlRef.current === null) {
        const inviteToken = await api.reservations.createManagedInvite(token);
        inviteUrlRef.current = appUrl(`/i/${encodeURIComponent(inviteToken)}`);
        api.reservations
          .getManagedInviteSummary(token)
          .then(setSummary)
          .catch(() => undefined);
      }
      const url = inviteUrlRef.current;
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ title: t("partyInvite.shareTitle"), url });
        } catch (err) {
          // Dismissing the share sheet is not a failure.
          if (!(err instanceof DOMException && err.name === "AbortError")) throw err;
        }
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <Stack gap="md" style={{ padding: "1.5rem" }}>
        <Text as="h2" variant="label">
          {t("partyInvite.heading")}
        </Text>
        <Text variant="body" color="secondary">
          {t("partyInvite.hint")}
        </Text>
        {summary?.invited && (
          <Text variant="body" className={styles.summary}>
            {t("partyInvite.summary", { confirmed: summary.confirmed, total: summary.partySize })}
          </Text>
        )}
        <Button variant="secondary" onClick={() => void share()} disabled={pending}>
          {t("partyInvite.share")}
        </Button>
        {failed && <Alert variant="error">{t("partyInvite.failed")}</Alert>}
        <div role="status">{copied ? t("partyInvite.copied") : null}</div>
      </Stack>
    </Card>
  );
}

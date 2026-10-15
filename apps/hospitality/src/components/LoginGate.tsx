import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@mbe/auth/react";
import { Button, DepartureBoard, Handshake, Stack, Text } from "@mattbutlerengineering/rialto";
import styles from "./LoginGate.module.css";

/** Query param + value the marketing homepage's Hospitality project link appends (`?ref=marketing`). */
const REFERRER_PARAM = "ref";
const REFERRER_MARKETING = "marketing";

/**
 * Branded sign-in gate for the unauthenticated shell. Atmosphere + grain
 * backdrop and a machined card per the rialto house style, with a split-flap
 * departure board cycling the product's domains.
 *
 * E2E contract (auth.spec.ts / auth.setup.ts): data-testid="login-prompt" on a
 * visible element, and a button whose accessible name is exactly "Sign In"
 * (en-US; the e2e suite runs in en-US).
 * DepartureBoard handles prefers-reduced-motion internally (static phrase,
 * no cycling) — no extra handling needed here. The board's charset is
 * A-Z/0-9 plus a little punctuation, so its phrases are unaccented in every
 * locale; the accessible label carries the properly accented text.
 *
 * Once `signIn()` starts the redirect (`activeNavigator === "signinRedirect"`)
 * the board gives way to a Handshake in flight and the button goes busy, so
 * the second or two before the browser leaves reads as progress, not a dead
 * click. The button's resting name stays exactly "Sign In" in en-US.
 */
export interface LoginGateProps {
  /** When true, swaps in the signed-out tagline (a sign-out round-trip landed back here). */
  signedOut?: boolean;
}

export function LoginGate({ signedOut = false }: LoginGateProps = {}) {
  const { t } = useTranslation();
  const { signIn, activeNavigator } = useAuth();
  const inFlight = activeNavigator === "signinRedirect";
  const referredFromMarketing =
    new URLSearchParams(window.location.search).get(REFERRER_PARAM) === REFERRER_MARKETING;

  // Tagline priority: signed-out > referred-from > default.
  const tagline = signedOut
    ? t("auth.login.taglineSignedOut")
    : referredFromMarketing
      ? t("auth.login.taglineReferred")
      : t("auth.login.taglineDefault");

  // Stable identity per language so the board's cycle isn't reset by re-renders.
  const boardPhrases = useMemo(
    () => [
      t("auth.login.boardPhrases.reservations"),
      t("auth.login.boardPhrases.guests"),
      t("auth.login.boardPhrases.floorPlans"),
      t("auth.login.boardPhrases.waitlist"),
      t("auth.login.boardPhrases.timeline"),
    ],
    [t]
  );
  const stations = [t("auth.stations.browser"), t("auth.stations.identity")] as const;

  // The landing title replaces the dashboard's; restored on unmount so the
  // authenticated dashboard keeps its own title.
  useEffect(() => {
    document.title = t("auth.login.documentTitle");
    return () => {
      document.title = t("shell.dashboardDocumentTitle");
    };
  }, [t]);

  return (
    <div className={styles.gate} data-testid="login-prompt">
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />

      <div className={styles.card}>
        <Stack gap="lg" align="center">
          <Stack gap="sm" align="center">
            <Text as="h1" variant="display" color="primary">
              {t("auth.login.title")}
            </Text>
            <Text variant="body" color="secondary">
              {tagline}
            </Text>
          </Stack>

          {inFlight ? (
            <Handshake
              className={styles.handshake}
              aria-label={t("auth.login.connecting")}
              stations={stations}
              state="negotiating"
              size="lg"
            />
          ) : (
            <DepartureBoard
              className={styles.board}
              phrases={boardPhrases}
              holdMs={2800}
              size="sm"
              role="img"
              aria-label={t("auth.login.boardLabel")}
            />
          )}

          <Button
            variant="primary"
            size="lg"
            onClick={() => signIn()}
            isLoading={inFlight}
            loadingText={t("auth.login.busy")}
          >
            {t("auth.login.signIn")}
          </Button>

          <Text variant="caption" color="tertiary">
            {t("auth.login.caption")}
          </Text>
        </Stack>
      </div>
    </div>
  );
}

import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@mbe/auth/react";
import { Button, Handshake, Stack, Text } from "@mattbutlerengineering/rialto";
import { describeAuthError } from "../lib/describe-auth-error.js";
import styles from "./AuthFailurePage.module.css";

/** The interactive sign-out navigators react-oidc-context names as an error `source`. */
const SIGN_OUT_SOURCES: ReadonlySet<string> = new Set(["signoutRedirect", "signoutPopup"]);

function isSignOutFailure(error: Error): boolean {
  const source = (error as Error & { source?: unknown }).source;
  return typeof source === "string" && SIGN_OUT_SOURCES.has(source);
}

/**
 * Renders a failed code exchange in place, on the same machined stage as
 * `LoginGate` / `SessionExpiredGate`, instead of today's plain text error
 * page. `describeAuthError` supplies the category copy; a retry is offered
 * only where `canRetry`, and the raw message stays reachable under a
 * collapsed "Technical details" for debugging.
 *
 * `signIn()` is called with no options — the `@mbe/auth` `returnTo` rule
 * means retry goes home rather than back to the pre-failure deep link,
 * because oidc-client-ts removes the stored state entry before the token
 * exchange completes.
 *
 * While the retry redirect is in flight (`activeNavigator === "signinRedirect"`)
 * the Handshake and status line switch to a negotiating variant; the title
 * and body stay put so nothing jumps.
 *
 * `App` routes every interactive auth error here, including a failed
 * sign-out. react-oidc-context tags each error with the `source` navigator,
 * so a sign-out failure gets sign-out copy and retries `signOut()` instead of
 * telling the operator their sign-in failed.
 */
export function AuthFailurePage({ error, lane }: { error: Error; lane: 0 | 1 }): JSX.Element {
  const { t } = useTranslation();
  const { signIn, signOut, activeNavigator } = useAuth();
  const inFlight = activeNavigator === "signinRedirect";
  const signOutFailed = isSignOutFailure(error);
  const described = signOutFailed
    ? {
        title: t("auth.failure.signOut.title"),
        body: t("auth.failure.signOut.body"),
        canRetry: true,
      }
    : describeAuthError(error, t);
  const retry = signOutFailed ? () => signOut() : () => signIn();
  /** The parties to an OIDC sign-in, in the order the credential travels. */
  const stations = [
    t("auth.stations.browser"),
    t("auth.stations.identity"),
    t("auth.stations.api"),
  ] as const;

  return (
    <div className={styles.gate} data-testid="auth-failure">
      <div className={styles.atmosphere} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />

      <div className={styles.card}>
        <Stack gap="lg" align="center">
          {inFlight ? (
            <Handshake
              className={styles.handshake}
              aria-label={t("auth.failure.connecting")}
              stations={stations}
              state="negotiating"
              lane={0}
              size="lg"
            />
          ) : (
            <Handshake
              className={styles.handshake}
              aria-label={
                signOutFailed
                  ? t("auth.failure.signOut.failedLabel")
                  : t("auth.failure.failedLabel")
              }
              stations={stations}
              state="failed"
              lane={lane}
              size="lg"
            />
          )}

          <div role="status" aria-live="polite">
            <Text variant="caption" color="tertiary">
              {inFlight ? t("auth.failure.statusRetrying") : t("auth.failure.statusFailed")}
            </Text>
          </div>

          <Stack gap="sm" align="center">
            <Text as="h1" variant="display" color="primary">
              {described.title}
            </Text>
            <Text variant="body" color="secondary">
              {described.body}
            </Text>
          </Stack>

          {described.canRetry && (
            <Button
              variant="primary"
              size="lg"
              onClick={retry}
              isLoading={inFlight}
              loadingText={t("auth.login.busy")}
            >
              {signOutFailed ? t("auth.failure.signOut.retry") : t("auth.failure.retry")}
            </Button>
          )}

          <details className={styles.errorDetails}>
            <summary>{t("auth.failure.technicalDetails")}</summary>
            <Text variant="caption" color="tertiary">
              {error.message}
            </Text>
          </details>
        </Stack>
      </div>
    </div>
  );
}

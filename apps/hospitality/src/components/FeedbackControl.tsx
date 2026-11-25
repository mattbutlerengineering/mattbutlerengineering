import { useMemo } from "react";
import { useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { FeedbackButton } from "@mattbutlerengineering/rialto";
import type { FeedbackDialogLabels } from "@mattbutlerengineering/rialto";
import { useApiClient } from "../hooks/useApiClient.js";
import { useCurrentUser } from "../hooks/useUsers.js";
import { describeApiError } from "../lib/describe-api-error.js";

const APP_NAME = "hospitality";
const AVAILABILITY_STALE_MS = 10 * 60 * 1000;

function currentViewport(): string {
  return `${window.innerWidth}x${window.innerHeight}`;
}

/**
 * "Send feedback" for signed-in staff. Files a GitHub issue through the agent
 * service, which holds the token; the browser never sees one. Renders nothing
 * while the server reports feedback unavailable (no token configured) or the
 * probe fails, so a broken backend never offers a button that cannot work.
 */
export function FeedbackControl() {
  const { t } = useTranslation();
  const api = useApiClient();
  const { pathname } = useLocation();
  const { data: user } = useCurrentUser();

  const availability = useQuery({
    queryKey: ["feedback-available"],
    queryFn: () => api.feedback.isAvailable(),
    staleTime: AVAILABILITY_STALE_MS,
    retry: false,
  });

  const labels = useMemo<FeedbackDialogLabels>(
    () => ({
      title: t("feedback.title"),
      typeLabel: t("feedback.typeLabel"),
      types: {
        bug: t("feedback.types.bug"),
        idea: t("feedback.types.idea"),
        other: t("feedback.types.other"),
      },
      messageLabel: t("feedback.messageLabel"),
      messageHint: t("feedback.messageHint"),
      messageTooShort: t("feedback.messageTooShort"),
      emailLabel: t("feedback.emailLabel"),
      emailHint: t("feedback.emailHint"),
      emailInvalid: t("feedback.emailInvalid"),
      contextHeading: t("feedback.contextHeading"),
      submit: t("feedback.submit"),
      submitting: t("feedback.submitting"),
      cancel: t("feedback.cancel"),
      done: t("feedback.done"),
      retry: t("feedback.retry"),
      errorTitle: t("feedback.errorTitle"),
      errorBody: t("feedback.errorBody"),
      successTitle: t("feedback.successTitle"),
      successBody: (number) => t("feedback.successBody", { number }),
    }),
    [t]
  );

  const version = import.meta.env.VITE_APP_COMMIT?.slice(0, 7) || "dev";
  const contextItems = [
    { label: t("feedback.context.app"), value: APP_NAME },
    { label: t("feedback.context.page"), value: pathname },
    { label: t("feedback.context.screen"), value: currentViewport() },
    { label: t("feedback.context.version"), value: version },
    ...(user?.id ? [{ label: t("feedback.context.user"), value: user.id }] : []),
  ];

  if (!availability.data) return null;

  return (
    <FeedbackButton
      label={t("feedback.open")}
      labels={labels}
      contextItems={contextItems}
      describeError={(error) => describeApiError(error, t).detail}
      onSubmit={(draft) =>
        api.feedback.submit({
          ...draft,
          context: { app: APP_NAME, route: pathname, viewport: currentViewport(), version },
        })
      }
    />
  );
}

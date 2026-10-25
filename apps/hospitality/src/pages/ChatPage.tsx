import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { streamNDJSON } from "@mbe/api-client/streaming";
import { useAuth } from "@mbe/auth/react";
import { ChatPanel } from "@mattbutlerengineering/rialto";
import { registry } from "@mbe/rialto-catalog";
import { PageHeader } from "../components/PageHeader.js";
import {
  HOSPITALITY_DOMAIN_CONTEXT,
  useChatRequestContext,
  useChatSuggestions,
  useDescribeChatAction,
} from "../constants/copilotContext.js";
import styles from "./ChatPage.module.css";

// Standalone mode never renders ChatPanel's own close control (that's a
// Drawer-only affordance) — this route is reached via the dashboard sidebar,
// which is always visible, so there is nothing for onClose to do here.
const NOOP = () => {};

export function ChatPage() {
  const { accessToken } = useAuth();
  const { t } = useTranslation();
  const requestContext = useChatRequestContext();
  const suggestions = useChatSuggestions();
  const describeAction = useDescribeChatAction();

  const getAccessToken = useCallback(() => accessToken, [accessToken]);

  return (
    <div className={styles.container}>
      <PageHeader title={t("chat.title")} />
      <ChatPanel
        standalone
        onClose={NOOP}
        api="/api/gen/agent"
        stream={streamNDJSON}
        domainContext={HOSPITALITY_DOMAIN_CONTEXT}
        getAccessToken={getAccessToken}
        registry={registry}
        requestContext={requestContext}
        suggestions={suggestions}
        describeAction={describeAction}
      />
    </div>
  );
}

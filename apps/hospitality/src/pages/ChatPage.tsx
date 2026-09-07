import { useCallback } from "react";
import { useAuth } from "@mbe/auth/react";
import { ChatPanel } from "@mattbutlerengineering/rialto";
import { PageHeader } from "../components/PageHeader.js";
import { HOSPITALITY_DOMAIN_CONTEXT } from "../constants/copilotContext.js";
import styles from "./ChatPage.module.css";

// Standalone mode never renders ChatPanel's own close control (that's a
// Drawer-only affordance) — this route is reached via the dashboard sidebar,
// which is always visible, so there is nothing for onClose to do here.
const NOOP = () => {};

export function ChatPage() {
  const { accessToken } = useAuth();

  const getAccessToken = useCallback(() => accessToken, [accessToken]);

  return (
    <div className={styles.container}>
      <PageHeader title="Chat" />
      <ChatPanel
        standalone
        onClose={NOOP}
        api="/api/gen/agent"
        domainContext={HOSPITALITY_DOMAIN_CONTEXT}
        getAccessToken={getAccessToken}
      />
    </div>
  );
}

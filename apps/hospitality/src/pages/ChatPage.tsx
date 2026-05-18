import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { ChatPanel } from "@mattbutlerengineering/rialto";
import { HOSPITALITY_DOMAIN_CONTEXT } from "../constants/copilotContext.js";
import styles from "./ChatPage.module.css";

export function ChatPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();

  const getAccessToken = useCallback(() => accessToken, [accessToken]);
  const handleClose = useCallback(() => navigate(-1), [navigate]);

  return (
    <div className={styles.container}>
      <ChatPanel
        standalone
        onClose={handleClose}
        api="/api/gen/agent"
        domainContext={HOSPITALITY_DOMAIN_CONTEXT}
        getAccessToken={getAccessToken}
      />
    </div>
  );
}

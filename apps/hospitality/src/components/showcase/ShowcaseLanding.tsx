import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@mbe/auth/react";
import { sceneById, skyThemeFor } from "./service-night.js";
import { useActiveScene } from "./useActiveScene.js";
import { TimeRail } from "./TimeRail.js";
import { ShowcaseHero } from "./ShowcaseHero.js";
import { PrepScene } from "./PrepScene.js";
import { DoorsScene } from "./DoorsScene.js";
import { RushScene } from "./RushScene.js";
import { AssistantScene } from "./AssistantScene.js";
import { GuestScene } from "./GuestScene.js";
import { CloseScene } from "./CloseScene.js";
import { RoadmapScene } from "./RoadmapScene.js";
import { MorningScene } from "./MorningScene.js";
import styles from "./showcase.module.css";

export interface ShowcaseLandingProps {
  /**
   * Called with the page's light whenever it changes, and with null on
   * leaving, so the shell can give the nav the same light.
   */
  onSkyChange?: (sky: "light" | "dark" | null) => void;
  /**
   * The visitor's resolved theme. Dark holds the whole page dark; light lets
   * the page run its day-to-night-to-day arc.
   */
  preferredTheme?: "light" | "dark";
}

/**
 * "One night of service": what a signed-out visitor sees at the app's root.
 * Scrolling moves a clock from the afternoon briefing to the next morning,
 * and the whole page takes the light of the scene on screen: day until doors,
 * night until close, day again at the end. That is a nested Rialto theme, so
 * every token follows it.
 *
 * E2E contract (auth.spec.ts / auth.setup.ts), shared with LoginGate:
 * data-testid="login-prompt" on a visible element, and exactly one button
 * whose accessible name is "Sign In" in en-US.
 */
export function ShowcaseLanding({ onSkyChange, preferredTheme }: ShowcaseLandingProps) {
  const { t } = useTranslation();
  const { signIn, activeNavigator } = useAuth();
  const signingIn = activeNavigator === "signinRedirect";
  const nightRef = useRef<HTMLDivElement>(null);
  const activeScene = useActiveScene(nightRef);
  const sceneSky = skyThemeFor(activeScene);
  const sky = preferredTheme === "dark" ? "dark" : sceneSky;

  useEffect(() => {
    onSkyChange?.(sky);
    return () => onSkyChange?.(null);
  }, [onSkyChange, sky]);

  // The landing title replaces the dashboard's; restored on unmount, as LoginGate does.
  useEffect(() => {
    document.title = t("auth.login.documentTitle");
    return () => {
      document.title = t("shell.dashboardDocumentTitle");
    };
  }, [t]);

  const handleSignIn = () => {
    void signIn();
  };

  return (
    <div
      ref={nightRef}
      className={styles.night}
      data-testid="login-prompt"
      data-sky={sky}
      data-theme={sky}
    >
      <TimeRail scene={sceneById(activeScene)} />
      <ShowcaseHero onSignIn={handleSignIn} signingIn={signingIn} />
      <PrepScene />
      <DoorsScene lit={sceneSky === "dark"} />
      <RushScene />
      <AssistantScene />
      <GuestScene />
      <CloseScene />
      <RoadmapScene />
      <MorningScene onSignIn={handleSignIn} />
    </div>
  );
}

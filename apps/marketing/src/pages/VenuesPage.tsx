import { useRef } from "react";
import { sceneById, skyThemeFor } from "../data/service-night";
import { usePageSky } from "../utils/page-sky";
import { useActiveScene } from "../components/service-night/useActiveScene";
import { TimeRail } from "../components/service-night/TimeRail";
import { VenuesHero } from "../components/service-night/VenuesHero";
import { PrepScene } from "../components/service-night/PrepScene";
import { DoorsScene } from "../components/service-night/DoorsScene";
import { RushScene } from "../components/service-night/RushScene";
import { AssistantScene } from "../components/service-night/AssistantScene";
import { GuestScene } from "../components/service-night/GuestScene";
import { CloseScene } from "../components/service-night/CloseScene";
import { RoadmapScene } from "../components/service-night/RoadmapScene";
import { MorningScene } from "../components/service-night/MorningScene";
import styles from "../components/service-night/service-night.module.css";

/**
 * "One night of service": the hospitality showcase. Scrolling moves a clock
 * from the afternoon briefing to the next morning. The whole page takes the
 * light of the scene on screen: day until doors, night until close, day again
 * at the end. That is a nested Rialto theme, so every token follows it.
 */
export function VenuesPage() {
  const nightRef = useRef<HTMLDivElement>(null);
  const activeScene = useActiveScene(nightRef);
  const sky = skyThemeFor(activeScene);
  // The shared nav takes the same light, so it never sits as a pale bar over the night.
  usePageSky(sky);

  return (
    <div ref={nightRef} className={styles.night} data-sky={sky} data-theme={sky}>
      <TimeRail scene={sceneById(activeScene)} />
      <VenuesHero />
      <PrepScene />
      <DoorsScene lit={sky === "dark"} />
      <RushScene />
      <AssistantScene />
      <GuestScene />
      <CloseScene />
      <RoadmapScene />
      <MorningScene />
    </div>
  );
}

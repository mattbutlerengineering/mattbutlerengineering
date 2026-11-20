import { Stack } from "@mattbutlerengineering/rialto";
import { EMAIL } from "../ContactSection";
import { SceneShell } from "./SceneShell";
import heroStyles from "../HeroSection.module.css";

export function MorningScene() {
  return (
    <SceneShell sceneId="morning">
      <Stack direction="row" gap="md" wrap>
        <a href={`mailto:${EMAIL}`} className={heroStyles.primaryCtaLink}>
          Tell Matt about your venue
        </a>
        {/* A plain anchor: /hospitality/ is another app behind the edge router. */}
        <a href="/hospitality/?ref=marketing" className={heroStyles.secondaryCtaLink}>
          Open the live demo
        </a>
      </Stack>
    </SceneShell>
  );
}

import { Hero, SilkFlow, Stack } from "@mattbutlerengineering/rialto";
import { sceneById } from "../../data/service-night";
import { EMAIL } from "../ContactSection";
import heroStyles from "../HeroSection.module.css";

export function VenuesHero() {
  const scene = sceneById("hero");
  return (
    <div id={scene.id} data-scene={scene.id} className={heroStyles.heroWrapper}>
      <SilkFlow className={heroStyles.silkFlow} />
      <Hero
        eyebrow="For venues and restaurants"
        title={scene.heading}
        subtitle={scene.body}
        minHeight="90vh"
        actions={
          <Stack direction="row" gap="md" wrap>
            <a href={`mailto:${EMAIL}`} className={heroStyles.primaryCtaLink}>
              Talk to Matt
            </a>
            <a href="#prep" className={heroStyles.secondaryCtaLink}>
              Start the night
            </a>
          </Stack>
        }
      />
    </div>
  );
}

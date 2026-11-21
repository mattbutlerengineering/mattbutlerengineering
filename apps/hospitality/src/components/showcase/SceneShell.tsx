import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Heading, Text, useScrollReveal } from "@mattbutlerengineering/rialto";
import { sceneById, type Claim, type SceneId } from "./service-night.js";
import { ClaimList } from "./ClaimList.js";
import styles from "./showcase.module.css";

interface SceneShellProps {
  sceneId: Exclude<SceneId, "hero">;
  /** The scene's one expressive element, shown beside the copy. */
  children: ReactNode;
  /** Claims to list under the copy. Defaults to the scene's own. */
  claims?: readonly Claim[];
}

/**
 * One scene of the night: clock time, heading, body and claims on one side,
 * the scene's stage on the other. The copy staggers in when the scene arrives;
 * the stage is left to each scene.
 */
export function SceneShell({ sceneId, children, claims }: SceneShellProps) {
  const { t } = useTranslation();
  const scene = sceneById(sceneId);
  const { ref, revealed } = useScrollReveal();
  const headingId = `${scene.id}-heading`;

  return (
    <section
      id={scene.id}
      data-scene={scene.id}
      className={styles.scene}
      aria-labelledby={headingId}
    >
      <div className={styles.sceneInner}>
        {/* The copy enters once the scene is on screen: `data-revealed` flips and
            the stylesheet staggers the children on rialto duration tokens, which
            are zero under reduced motion. */}
        <div ref={ref} data-reveal={scene.id} data-revealed={revealed} className={styles.copy}>
          <div className={styles.eyebrow}>
            <time>{scene.time}</time>
            <Text as="span" className={styles.inheritText}>
              {t(`showcase.scenes.${sceneId}.name`)}
            </Text>
          </div>
          <Heading level={2} id={headingId} className={styles.heading}>
            {t(`showcase.scenes.${sceneId}.heading`)}
          </Heading>
          <Text color="secondary">{t(`showcase.scenes.${sceneId}.body`)}</Text>
          <ClaimList claims={claims ?? scene.claims} />
        </div>
        <div className={styles.stage}>{children}</div>
      </div>
    </section>
  );
}

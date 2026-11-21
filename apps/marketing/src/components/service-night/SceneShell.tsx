import type { ReactNode } from "react";
import { Heading, Text, useScrollReveal, staggerReveal } from "@mattbutlerengineering/rialto";
import { motion } from "framer-motion";
import { sceneById, type Claim, type SceneId } from "../../data/service-night";
import { ClaimList } from "./ClaimList";
import homeStyles from "../../pages/HomePage.module.css";
import styles from "./service-night.module.css";

interface SceneShellProps {
  sceneId: SceneId;
  /** The scene's one expressive element, shown beside the copy. */
  children: ReactNode;
  /** Claims to list under the copy. Defaults to the scene's own. */
  claims?: readonly Claim[];
}

/**
 * One scene of the night: clock time, heading, body and claims on one side,
 * the scene's stage on the other. The copy enters with the shared stagger
 * reveal; the stage is left to each scene.
 */
export function SceneShell({ sceneId, children, claims }: SceneShellProps) {
  const scene = sceneById(sceneId);
  const { ref, controls } = useScrollReveal();
  const headingId = `${scene.id}-heading`;

  return (
    <section
      id={scene.id}
      data-scene={scene.id}
      className={styles.scene}
      aria-labelledby={headingId}
    >
      <div className={styles.sceneInner}>
        <motion.div
          ref={ref}
          data-reveal={scene.id}
          className={styles.copy}
          variants={staggerReveal.container}
          initial="hidden"
          animate={controls}
        >
          <motion.p className={homeStyles.sectionEyebrow} variants={staggerReveal.item}>
            <time>{scene.time}</time>
            <Text as="span" className={styles.eyebrowName}>
              {scene.name}
            </Text>
          </motion.p>
          <motion.div variants={staggerReveal.item}>
            <Heading level={2} id={headingId} className={homeStyles.sectionHeading}>
              {scene.heading}
            </Heading>
          </motion.div>
          <motion.div variants={staggerReveal.item}>
            <Text color="secondary">{scene.body}</Text>
          </motion.div>
          <motion.div variants={staggerReveal.item}>
            <ClaimList claims={claims ?? scene.claims} />
          </motion.div>
        </motion.div>
        <div className={styles.stage}>{children}</div>
      </div>
    </section>
  );
}

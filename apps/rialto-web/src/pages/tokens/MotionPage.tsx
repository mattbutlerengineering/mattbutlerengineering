import { Text } from "@mattbutlerengineering/rialto";
import { ComponentPageLayout, Section } from "../components/ComponentPageLayout";
import {
  MOTION_FREQUENCY_BUDGET,
  MOTION_GROUPS,
  MOTION_RESTRAINT_RULES,
  MOTION_TOKEN_NAMES,
} from "./token-catalog";
import { useLiveTokenValues } from "./use-live-tokens";
import styles from "./MotionPage.module.css";

/**
 * Motion token documentation.
 *
 * Duration and easing tokens, each shown with a live demo whose dot travels
 * using that exact token via `var(--rialto-*)`. Duration demos run at their
 * true token speed (so fast/standard/slow read as a relative difference);
 * easing demos play over a comfortable fixed duration so the curve is legible.
 * Every demo honours `prefers-reduced-motion` — under it the dot rests, static.
 * Each label prints the *resolved* value read live from the cascade.
 */
export function MotionPage() {
  const values = useLiveTokenValues(MOTION_TOKEN_NAMES);

  return (
    <ComponentPageLayout
      name="Motion"
      description="Duration and easing tokens, each demonstrated live from its real value. Motion is theme-invariant; every demo pauses when the OS requests reduced motion."
    >
      {MOTION_GROUPS.map((group) => (
        <Section key={group.label} title={group.label}>
          <Text variant="body" color="secondary">
            {group.description}
          </Text>
          <div className={styles.gallery}>
            {group.tokens.map((token) => {
              const slug = token.name.replace("--rialto-", "");
              const value = values[token.name] ?? "";
              return (
                <div key={token.name} className={styles.demo} data-testid="motion-demo">
                  <div className={`${styles.stage} ${styles[slug] ?? ""}`} aria-hidden="true">
                    <div className={styles.dot} />
                  </div>
                  <div className={styles.meta}>
                    <Text variant="caption" mono className={styles.name}>
                      {token.name}
                    </Text>
                    <Text variant="caption" mono color="secondary" className={styles.value}>
                      {value || "—"}
                    </Text>
                    <Text variant="detail" color="tertiary" className={styles.usage}>
                      {token.usage}
                    </Text>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      ))}
      <Section title="When to animate">
        <Text variant="body" color="secondary">
          Every animation must give feedback, show a state change, keep spatial continuity, draw
          attention to one thing, or add delight at a rare moment. &quot;Looks cool&quot; on a
          frequent path means no animation. The full policy is in{" "}
          <Text as="span" mono>
            packages/rialto/docs/motion.md
          </Text>
          .
        </Text>
      </Section>
      <Section title="Frequency budget">
        <Text variant="body" color="secondary">
          The more often someone meets an interaction, the less it moves.
        </Text>
        <div className={styles.policyList}>
          {MOTION_FREQUENCY_BUDGET.map((row) => (
            <div key={row.how} className={styles.policyRow} data-testid="motion-frequency-row">
              <Text variant="caption" mono>
                {row.how}
              </Text>
              <Text variant="detail" color="secondary">
                {row.examples}
              </Text>
              <Text variant="detail" color="tertiary">
                {row.motion}
              </Text>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Productive and expressive tiers">
        <Text variant="body" color="secondary">
          Productive motion serves staff tools: precision easing and the duration tokens, opacity
          and colour first. Expressive motion serves marketing, guest-facing booking moments and
          celebrations: springs, staggered reveals and the signature instruments. Both resolve
          through{" "}
          <Text as="span" mono>
            useMotionPreset()
          </Text>
          .
        </Text>
      </Section>
      <Section title="Restraint">
        <ul className={styles.rules}>
          {MOTION_RESTRAINT_RULES.map((rule) => (
            <li key={rule}>
              <Text variant="body" color="secondary">
                {rule}
              </Text>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Reduced motion">
        <Text variant="body" color="secondary">
          Every animation above is gated behind an{" "}
          <Text as="span" mono>
            @media (prefers-reduced-motion: reduce)
          </Text>{" "}
          query. When a visitor asks their operating system to minimise motion, the demos hold still
          at rest rather than looping — and Rialto components fall back to the same instant,
          non-animated transitions.
        </Text>
      </Section>
    </ComponentPageLayout>
  );
}

MotionPage.displayName = "MotionPage";

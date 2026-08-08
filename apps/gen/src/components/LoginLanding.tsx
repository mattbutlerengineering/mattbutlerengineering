import { useAuth } from "@mbe/auth/react";
import {
  Hero,
  Heading,
  Stack,
  Text,
  Button,
  RialtoProvider,
  useUIEnvironment,
} from "@mattbutlerengineering/rialto";
import styles from "./LoginLanding.module.css";

/** The four visible stages of the Gen pipeline: prompt -> spec -> JSX -> live preview. */
const PIPELINE_STAGES = [
  { label: "Prompt", detail: "Describe it in plain words" },
  { label: "Spec", detail: "Validated component tree" },
  { label: "JSX", detail: "Rialto components, wired up" },
  { label: "Preview", detail: "Live, interactive result" },
] as const;

/**
 * Logged-out landing for the Gen app — the de-facto public page.
 *
 * Presents a Hero value proposition, a looping preview of the generation
 * flow (prompt -> spec -> JSX -> preview), and a dual CTA (primary "Try Gen"
 * plus the returning-user "Sign In"). The whole auth surface is scoped to the
 * `transacting` vibe for a tight, purposeful feel; the surrounding
 * (authenticated) app keeps its own vibe. The pipeline animation is CSS-driven
 * and disabled under `prefers-reduced-motion`.
 */
export function LoginLanding() {
  const { signIn } = useAuth();
  // Inherit the ambient theme so the scoped provider only shifts the vibe.
  const { theme } = useUIEnvironment();

  return (
    <RialtoProvider vibe="transacting" theme={theme}>
      <main className={styles.landing}>
        <Hero
          eyebrow="Generative UI"
          minHeight="auto"
          showDivider={false}
          title={
            <>
              Turn a{" "}
              {/* Hero's documented accent hook is a bare <span class="accent">; a Text
                  element would inject a <p> inside the <h1> and drop the heading typography. */}
              {/* eslint-disable-next-line mbe-local/prefer-rialto-components */}
              <span className="accent">prompt</span> into a live interface with Gen
            </>
          }
          subtitle="Describe the screen you want in plain language. Gen produces a validated component spec, renders it to JSX, and previews it live — no boilerplate, no wiring."
          actions={
            <Stack direction="row" gap="md" justify="center" wrap>
              <Button variant="primary" size="lg" onClick={() => signIn()}>
                Try Gen
              </Button>
              <Button variant="ghost" size="lg" onClick={() => signIn()}>
                Sign In
              </Button>
            </Stack>
          }
        />

        <section className={styles.previewSection} aria-labelledby="gen-flow-heading">
          <Heading id="gen-flow-heading" level={2} size={3} align="center">
            From idea to UI in four steps
          </Heading>
          <figure className={styles.preview} data-testid="gen-preview">
            <ol className={styles.flow}>
              {PIPELINE_STAGES.map((stage) => (
                <li key={stage.label} className={styles.stage}>
                  <Text as="span" variant="label" className={styles.stageLabel}>
                    {stage.label}
                  </Text>
                  <Text as="span" variant="detail" color="secondary">
                    {stage.detail}
                  </Text>
                </li>
              ))}
            </ol>
            <figcaption className={styles.previewCaption}>
              <Text variant="caption" color="tertiary" align="center">
                A glimpse of the Gen pipeline — sign in to build your own.
              </Text>
            </figcaption>
          </figure>
        </section>
      </main>
    </RialtoProvider>
  );
}

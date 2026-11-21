import { useTranslation } from "react-i18next";
import { Button, Hero, SilkFlow, Stack } from "@mattbutlerengineering/rialto";
import styles from "./showcase.module.css";

interface ShowcaseHeroProps {
  onSignIn: () => void;
  /** True once the sign-in redirect has started. */
  signingIn: boolean;
}

/**
 * The top of the night. Carries the app's one "Sign In" button: the E2E
 * contract (auth.spec.ts) needs exactly one button with that name on the
 * signed-out root, so the closing scene words its own differently.
 */
export function ShowcaseHero({ onSignIn, signingIn }: ShowcaseHeroProps) {
  const { t } = useTranslation();
  return (
    <div id="hero" data-scene="hero" className={styles.heroWrapper}>
      <SilkFlow className={styles.silkFlow} />
      <Hero
        eyebrow={t("showcase.hero.eyebrow")}
        title={t("showcase.scenes.hero.heading")}
        subtitle={t("showcase.scenes.hero.body")}
        minHeight="90vh"
        actions={
          <Stack direction="row" gap="md" wrap align="center">
            <Button
              variant="primary"
              size="lg"
              onClick={onSignIn}
              isLoading={signingIn}
              loadingText={t("auth.login.busy")}
            >
              {t("auth.login.signIn")}
            </Button>
            <a href="#prep" className={styles.secondaryCtaLink}>
              {t("showcase.hero.start")}
            </a>
          </Stack>
        }
      />
    </div>
  );
}

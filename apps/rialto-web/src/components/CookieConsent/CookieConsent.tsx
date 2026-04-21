import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Banner, Button, Dialog, Toggle, Stack, Divider } from "@mattbutlerengineering/rialto";
import { precision } from "@mattbutlerengineering/rialto/motion";
import type { CookiePreferences } from "./useCookieConsent";
import styles from "./CookieConsent.module.css";

/* ── Banner ──────────────────────────────────── */

interface CookieBannerProps {
  consented: boolean;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onCustomize: () => void;
}

export function CookieBanner({
  consented,
  onAcceptAll,
  onRejectAll,
  onCustomize,
}: CookieBannerProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {!consented && (
        <motion.div
          className={styles.bannerContainer}
          initial={shouldReduceMotion ? undefined : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={shouldReduceMotion ? undefined : { opacity: 0, y: 16 }}
          transition={precision}
        >
          <Banner
            variant="info"
            action={
              <Stack direction="row" gap="xs">
                <Button variant="ghost" size="sm" onClick={onRejectAll}>
                  Reject All
                </Button>
                <Button variant="secondary" size="sm" onClick={onCustomize}>
                  Customize
                </Button>
                <Button variant="primary" size="sm" onClick={onAcceptAll}>
                  Accept All
                </Button>
              </Stack>
            }
          >
            We use cookies to enhance your browsing experience, analyze site traffic, and
            personalize content.{" "}
            <Link to="/privacy" className={styles.privacyLink}>
              Privacy Policy
            </Link>
          </Banner>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

CookieBanner.displayName = "CookieBanner";

/* ── Preferences Dialog ──────────────────────── */

interface CategoryDef {
  key: keyof CookiePreferences;
  label: string;
  description: string;
  disabled?: boolean;
  disabledReason?: string;
}

const CATEGORIES: readonly CategoryDef[] = [
  {
    key: "essential",
    label: "Essential",
    description: "Required for the website to function properly.",
    disabled: true,
    disabledReason: "Required for the site to function",
  },
  {
    key: "analytics",
    label: "Analytics",
    description: "Help us understand how visitors interact with the site.",
  },
  {
    key: "functional",
    label: "Functional",
    description: "Remember your preferences and settings.",
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "Used to deliver personalized advertisements.",
  },
];

interface CookiePreferencesDialogProps {
  open: boolean;
  onClose: () => void;
  preferences: CookiePreferences;
  onSave: (prefs: Omit<CookiePreferences, "essential">) => void;
  onRejectAll: () => void;
}

export function CookiePreferencesDialog({
  open,
  onClose,
  preferences,
  onSave,
  onRejectAll,
}: CookiePreferencesDialogProps) {
  const [draft, setDraft] = useState<CookiePreferences>(preferences);

  const handleToggle = (key: keyof Omit<CookiePreferences, "essential">) => {
    setDraft((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    onSave({
      analytics: draft.analytics,
      functional: draft.functional,
      marketing: draft.marketing,
    });
    onClose();
  };

  const handleReject = () => {
    onRejectAll();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Cookie Preferences"
      description="Choose which cookies you'd like to allow. Essential cookies cannot be disabled."
      footer={
        <Stack direction="row" gap="sm" justify="end">
          <Button variant="ghost" size="sm" onClick={handleReject}>
            Reject All
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave}>
            Save Preferences
          </Button>
        </Stack>
      }
    >
      <Stack gap="xs">
        {CATEGORIES.map((cat, i) => (
          <div key={cat.key}>
            {i > 0 && <Divider />}
            <div className={styles.categoryRow}>
              <div className={styles.categoryInfo}>
                <div className={styles.categoryName}>{cat.label}</div>
                <div className={styles.categoryDescription}>{cat.description}</div>
              </div>
              <Toggle
                label=""
                checked={cat.key === "essential" ? true : draft[cat.key]}
                onCheckedChange={
                  cat.key === "essential"
                    ? undefined
                    : () => handleToggle(cat.key as keyof Omit<CookiePreferences, "essential">)
                }
                disabled={cat.disabled}
                disabledReason={cat.disabledReason}
                aria-label={`${cat.label} cookies`}
              />
            </div>
          </div>
        ))}
      </Stack>
    </Dialog>
  );
}

CookiePreferencesDialog.displayName = "CookiePreferencesDialog";

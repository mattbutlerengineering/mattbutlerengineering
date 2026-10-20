import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAuth } from "@mbe/auth/react";
import {
  Alert,
  Button,
  Card,
  Divider,
  Select,
  Skeleton,
  SkeletonGroup,
  Stack,
  Text,
  Toggle,
} from "@mattbutlerengineering/rialto";
import type { UserPreferences } from "@mbe/types";
import { useCurrentUser, useUpdatePreferences } from "../hooks/useUsers.js";
import { useTheme } from "../hooks/use-theme";
import { PageHeader } from "../components/PageHeader";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import { LanguageRegionCard } from "../components/LanguageRegionCard.js";
import { RehearsalSettingsCard } from "../components/rehearsal/RehearsalSettingsCard";
import { describeApiError } from "../lib/describe-api-error.js";
import styles from "./SettingsPage.module.css";

/* ── Constants ──────────────────────────────── */

const themeOptions = (t: TFunction) => [
  { value: "system", label: t("settings.theme.system") },
  { value: "light", label: t("settings.theme.light") },
  { value: "dark", label: t("settings.theme.dark") },
];

const durationOptions = (t: TFunction) => [
  { value: "30", label: t("settings.duration.m30") },
  { value: "45", label: t("settings.duration.m45") },
  { value: "60", label: t("settings.duration.m60") },
  { value: "90", label: t("settings.duration.m90") },
  { value: "120", label: t("settings.duration.m120") },
];

const partySizeOptions = (t: TFunction) =>
  Array.from({ length: 12 }, (_, i) => ({
    value: String(i + 1),
    label: t("settings.partySize", { count: i + 1 }),
  }));

const LOCAL_STORAGE_KEYS = {
  defaultDuration: "mbe-hospitality-default-duration",
  defaultPartySize: "mbe-hospitality-default-party-size",
  autoConfirm: "mbe-hospitality-auto-confirm",
} as const;

/* ── Helpers ────────────────────────────────── */

function readLocalStorage(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or unavailable — silently degrade
  }
}

/* ── Loading skeleton ───────────────────────── */

function SettingsLoadingSkeleton() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <SkeletonGroup>
        <div className={styles.layout}>
          <div className={styles.main}>
            <Stack gap="lg">
              <Skeleton variant="card" width="100%" height={160} />
              <Skeleton variant="card" width="100%" height={200} />
              <Skeleton variant="card" width="100%" height={260} />
              <Skeleton variant="card" width="100%" height={140} />
            </Stack>
          </div>
          <div className={styles.sidebar}>
            <Skeleton variant="card" width="100%" height={160} />
          </div>
        </div>
      </SkeletonGroup>
    </div>
  );
}

/* ── Main component ─────────────────────────── */

export function SettingsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isLoading: isAuthLoading, signOut } = useAuth();
  const { theme: localTheme, setTheme: setLocalTheme } = useTheme();

  const { data: user, isLoading, error: loadError, refetch } = useCurrentUser();
  const updatePreferencesMutation = useUpdatePreferences();

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successMessageTimeoutRef.current !== null) {
        clearTimeout(successMessageTimeoutRef.current);
      }
    };
  }, []);

  // Venue defaults (localStorage-backed)
  const [defaultDuration, setDefaultDuration] = useState(() =>
    readLocalStorage(LOCAL_STORAGE_KEYS.defaultDuration, "60")
  );
  const [defaultPartySize, setDefaultPartySize] = useState(() =>
    readLocalStorage(LOCAL_STORAGE_KEYS.defaultPartySize, "2")
  );
  const [autoConfirm, setAutoConfirm] = useState(
    () => readLocalStorage(LOCAL_STORAGE_KEYS.autoConfirm, "false") === "true"
  );

  const updatePreference = useCallback(
    async <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
      try {
        setIsSaving(true);
        setError(null);
        setSuccessMessage(null);

        await updatePreferencesMutation.mutateAsync({ [key]: value });
        setSuccessMessage(t("settings.saved"));
        if (successMessageTimeoutRef.current !== null) {
          clearTimeout(successMessageTimeoutRef.current);
        }
        successMessageTimeoutRef.current = setTimeout(() => {
          successMessageTimeoutRef.current = null;
          setSuccessMessage(null);
        }, 3000);
      } catch (err) {
        setError(describeApiError(err).detail);
      } finally {
        setIsSaving(false);
      }
    },
    [updatePreferencesMutation, t]
  );

  // Show skeleton while auth is loading or data is being fetched
  if (isAuthLoading || isLoading) {
    return <SettingsLoadingSkeleton />;
  }

  // Show error banner when user data fails to load
  if (loadError && !user) {
    const loadFailure = describeApiError(loadError);
    return (
      <div>
        <PageHeader title={t("settings.title")} description={t("settings.description")} />
        <ErrorRetryBanner
          title={t("settings.loadError")}
          error={loadFailure.detail}
          details={loadFailure.raw}
          onRetry={refetch}
        />
      </div>
    );
  }

  const preferences = user?.preferences ?? {};

  function handleDurationChange(value: string) {
    setDefaultDuration(value);
    writeLocalStorage(LOCAL_STORAGE_KEYS.defaultDuration, value);
  }

  function handlePartySizeChange(value: string) {
    setDefaultPartySize(value);
    writeLocalStorage(LOCAL_STORAGE_KEYS.defaultPartySize, value);
  }

  function handleAutoConfirmChange(checked: boolean) {
    setAutoConfirm(checked);
    writeLocalStorage(LOCAL_STORAGE_KEYS.autoConfirm, String(checked));
  }

  return (
    <div>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />

      <Stack gap="md">
        {error && (
          <Alert variant="error" dismissible onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        {successMessage && (
          <Alert variant="success" dismissible onDismiss={() => setSuccessMessage(null)}>
            {successMessage}
          </Alert>
        )}
      </Stack>

      <div className={styles.layout} data-testid="primary-content">
        {/* ── Main column ─────────────────────── */}
        <div className={styles.main}>
          <Stack gap="lg">
            {/* Appearance */}
            <Card title={t("settings.appearance.title")}>
              <Stack gap="sm">
                <Text variant="caption" color="secondary">
                  {t("settings.appearance.description")}
                </Text>
                <div className={styles.fieldRow}>
                  <Select
                    label={t("settings.theme.label")}
                    options={themeOptions(t)}
                    value={localTheme}
                    onChange={(value) => {
                      const next = value as "light" | "dark" | "system";
                      setLocalTheme(next);
                      updatePreference("theme", next);
                    }}
                    disabled={isSaving}
                  />
                </div>
              </Stack>
            </Card>

            {/* Notifications */}
            <Card title={t("settings.notifications.title")}>
              <Stack gap="sm">
                <Text variant="caption" color="secondary">
                  {t("settings.notifications.description")}
                </Text>

                <div className={styles.toggleRow}>
                  <Toggle
                    label={t("settings.notifications.email")}
                    checked={preferences.emailNotifications ?? true}
                    onCheckedChange={(checked) => updatePreference("emailNotifications", checked)}
                    disabled={isSaving}
                  />
                  <Text variant="caption" color="secondary" className={styles.toggleDescription}>
                    {t("settings.notifications.emailHint")}
                  </Text>
                </div>

                <Divider spacing="compact" />

                <div className={styles.toggleRow}>
                  <Toggle
                    label={t("settings.notifications.marketing")}
                    checked={preferences.marketingEmails ?? false}
                    onCheckedChange={(checked) => updatePreference("marketingEmails", checked)}
                    disabled={isSaving}
                  />
                  <Text variant="caption" color="secondary" className={styles.toggleDescription}>
                    {t("settings.notifications.marketingHint")}
                  </Text>
                </div>
              </Stack>
            </Card>

            <LanguageRegionCard />

            {/* Venue Defaults */}
            <Card title={t("settings.defaults.title")}>
              <Stack gap="sm">
                <Text variant="caption" color="secondary">
                  {t("settings.defaults.description")}
                </Text>

                <div className={styles.fieldRow}>
                  <Select
                    label={t("settings.defaults.duration")}
                    options={durationOptions(t)}
                    value={defaultDuration}
                    onChange={handleDurationChange}
                  />
                </div>

                <Divider spacing="compact" />

                <div className={styles.fieldRow}>
                  <Select
                    label={t("settings.defaults.partySize")}
                    options={partySizeOptions(t)}
                    value={defaultPartySize}
                    onChange={handlePartySizeChange}
                  />
                </div>

                <Divider spacing="compact" />

                <div className={styles.toggleRow}>
                  <Toggle
                    label={t("settings.defaults.autoConfirm")}
                    checked={autoConfirm}
                    onCheckedChange={handleAutoConfirmChange}
                  />
                  <Text variant="caption" color="secondary" className={styles.toggleDescription}>
                    {t("settings.defaults.autoConfirmHint")}
                  </Text>
                </div>
              </Stack>
            </Card>

            {/* Data & Privacy */}
            <Card title={t("settings.privacy.title")}>
              <Stack gap="sm">
                <Text variant="caption" color="secondary">
                  {t("settings.privacy.description")}
                </Text>

                <div className={styles.privacyRow}>
                  <div>
                    <Text variant="body" color="primary">
                      {t("settings.privacy.exportTitle")}
                    </Text>
                    <Text variant="caption" color="secondary">
                      {t("settings.privacy.exportHint")}
                    </Text>
                  </div>
                  <Button variant="secondary" disabled>
                    {t("settings.privacy.export")}
                  </Button>
                </div>

                <Divider spacing="compact" />

                <div className={styles.privacyRow}>
                  <div>
                    <Text variant="body" color="primary">
                      {t("settings.privacy.deleteTitle")}
                    </Text>
                    <Text variant="caption" color="secondary">
                      {t("settings.privacy.deleteHint")}
                    </Text>
                  </div>
                  <Button variant="secondary" disabled>
                    {t("settings.privacy.delete")}
                  </Button>
                </div>
              </Stack>
            </Card>
          </Stack>
        </div>

        {/* ── Sidebar column ──────────────────── */}
        <div className={styles.sidebar}>
          <Stack gap="lg">
            <RehearsalSettingsCard />

            <Card title={t("settings.venue.title")}>
              <Stack gap="md">
                <Text variant="caption" color="secondary">
                  {t("settings.venue.description")}
                </Text>
                <Button variant="secondary" onClick={() => navigate("/setup/hours")}>
                  {t("settings.venue.operatingHours")}
                </Button>
              </Stack>
            </Card>

            <Card title={t("settings.account.title")}>
              <Stack gap="md">
                <div>
                  <Text variant="caption" color="secondary">
                    {t("settings.account.signedInAs")}
                  </Text>
                  <Text variant="body" color="primary">
                    {user?.email}
                  </Text>
                </div>
                <Divider spacing="compact" />
                <Button variant="secondary" onClick={() => signOut()}>
                  {t("settings.account.signOut")}
                </Button>
              </Stack>
            </Card>
          </Stack>
        </div>
      </div>
    </div>
  );
}

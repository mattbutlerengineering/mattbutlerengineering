import { useState, useCallback } from "react";
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
import { ApiClientError } from "@mbe/api-client";
import type { UserPreferences } from "@mbe/types";
import { useCurrentUser, useUpdatePreferences } from "../hooks/useUsers.js";
import { useTheme } from "../hooks/use-theme";
import { PageHeader } from "../components/PageHeader";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import styles from "./SettingsPage.module.css";

/* ── Constants ──────────────────────────────── */

const THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const DURATION_OPTIONS = [
  { value: "30", label: "30 minutes" },
  { value: "45", label: "45 minutes" },
  { value: "60", label: "1 hour" },
  { value: "90", label: "1.5 hours" },
  { value: "120", label: "2 hours" },
];

const PARTY_SIZE_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1} ${i === 0 ? "guest" : "guests"}`,
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
  return (
    <div>
      <PageHeader title="Settings" description="Manage your account settings and preferences" />
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
  const { isLoading: isAuthLoading, signOut } = useAuth();
  const { setTheme: setLocalTheme } = useTheme();

  const { data: user, isLoading, error: loadError, refetch } = useCurrentUser();
  const updatePreferencesMutation = useUpdatePreferences();

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
        setSuccessMessage("Settings saved");
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (err) {
        if (err instanceof ApiClientError) {
          const detail = err.problemDetails.detail;
          setError(`Failed to save settings: ${detail}`);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to save settings");
        }
      } finally {
        setIsSaving(false);
      }
    },
    [updatePreferencesMutation]
  );

  // Show skeleton while auth is loading or data is being fetched
  if (isAuthLoading || isLoading) {
    return <SettingsLoadingSkeleton />;
  }

  // Show error banner when user data fails to load
  if (loadError && !user) {
    return (
      <div>
        <PageHeader title="Settings" description="Manage your account settings and preferences" />
        <ErrorRetryBanner
          error={
            loadError instanceof ApiClientError
              ? loadError.problemDetails.detail
              : loadError.message
          }
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
      <PageHeader title="Settings" description="Manage your account settings and preferences" />

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

      <div className={styles.layout}>
        {/* ── Main column ─────────────────────── */}
        <div className={styles.main}>
          <Stack gap="lg">
            {/* Appearance */}
            <Card title="Appearance">
              <Stack gap="sm">
                <Text variant="caption" color="secondary">
                  Control how the application looks and feels.
                </Text>
                <div className={styles.fieldRow}>
                  <Select
                    label="Theme"
                    options={THEME_OPTIONS}
                    value={preferences.theme ?? "system"}
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
            <Card title="Notifications">
              <Stack gap="sm">
                <Text variant="caption" color="secondary">
                  Choose which updates you want to receive.
                </Text>

                <div className={styles.toggleRow}>
                  <Toggle
                    label="Email notifications"
                    checked={preferences.emailNotifications ?? true}
                    onCheckedChange={(checked) => updatePreference("emailNotifications", checked)}
                    disabled={isSaving}
                  />
                  <Text variant="caption" color="secondary" className={styles.toggleDescription}>
                    Receive important updates and alerts via email
                  </Text>
                </div>

                <Divider spacing="compact" />

                <div className={styles.toggleRow}>
                  <Toggle
                    label="Marketing emails"
                    checked={preferences.marketingEmails ?? false}
                    onCheckedChange={(checked) => updatePreference("marketingEmails", checked)}
                    disabled={isSaving}
                  />
                  <Text variant="caption" color="secondary" className={styles.toggleDescription}>
                    Receive news, updates, and promotional content
                  </Text>
                </div>
              </Stack>
            </Card>

            {/* Venue Defaults */}
            <Card title="Venue Defaults">
              <Stack gap="sm">
                <Text variant="caption" color="secondary">
                  Set default values for new reservations. These are stored locally on this device.
                </Text>

                <div className={styles.fieldRow}>
                  <Select
                    label="Default reservation duration"
                    options={DURATION_OPTIONS}
                    value={defaultDuration}
                    onChange={handleDurationChange}
                  />
                </div>

                <Divider spacing="compact" />

                <div className={styles.fieldRow}>
                  <Select
                    label="Default party size"
                    options={PARTY_SIZE_OPTIONS}
                    value={defaultPartySize}
                    onChange={handlePartySizeChange}
                  />
                </div>

                <Divider spacing="compact" />

                <div className={styles.toggleRow}>
                  <Toggle
                    label="Auto-confirm reservations"
                    checked={autoConfirm}
                    onCheckedChange={handleAutoConfirmChange}
                  />
                  <Text variant="caption" color="secondary" className={styles.toggleDescription}>
                    Automatically confirm new reservations without manual review
                  </Text>
                </div>
              </Stack>
            </Card>

            {/* Data & Privacy */}
            <Card title="Data & Privacy">
              <Stack gap="sm">
                <Text variant="caption" color="secondary">
                  Manage your data and account privacy settings.
                </Text>

                <div className={styles.privacyRow}>
                  <div>
                    <Text variant="body" color="primary">
                      Export my data
                    </Text>
                    <Text variant="caption" color="secondary">
                      Download a copy of all your data
                    </Text>
                  </div>
                  <Button variant="secondary" disabled>
                    Export
                  </Button>
                </div>

                <Divider spacing="compact" />

                <div className={styles.privacyRow}>
                  <div>
                    <Text variant="body" color="primary">
                      Delete my account
                    </Text>
                    <Text variant="caption" color="secondary">
                      Contact support to delete your account
                    </Text>
                  </div>
                  <Button variant="secondary" disabled>
                    Delete
                  </Button>
                </div>
              </Stack>
            </Card>
          </Stack>
        </div>

        {/* ── Sidebar column ──────────────────── */}
        <div className={styles.sidebar}>
          <Card title="Account">
            <Stack gap="md">
              <div>
                <Text variant="caption" color="secondary">
                  Signed in as
                </Text>
                <Text variant="body" color="primary">
                  {user?.email}
                </Text>
              </div>
              <Divider spacing="compact" />
              <Button variant="secondary" onClick={() => signOut()}>
                Sign Out
              </Button>
            </Stack>
          </Card>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useAuth } from "@mbe/auth/react";
import { Card, Button, Text, Stack } from "@mbe/rialto";
import { ApiClient, UsersClient } from "@mbe/api-client";
import type { User, UserPreferences } from "@mbe/types";
import { PageHeader } from "../components/PageHeader";
import styles from "./SettingsPage.module.css";

export function SettingsPage() {
  const { accessToken, signOut } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUser() {
      if (!accessToken) return;

      try {
        setIsLoading(true);
        const apiClient = new ApiClient({
          baseUrl: import.meta.env.VITE_API_URL ?? "",
          getAccessToken: () => accessToken,
        });
        const usersClient = new UsersClient(apiClient);
        const userData = await usersClient.me();
        setUser(userData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load settings");
      } finally {
        setIsLoading(false);
      }
    }

    fetchUser();
  }, [accessToken]);

  async function updatePreference<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) {
    if (!accessToken) return;

    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);

      const apiClient = new ApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
      });
      const usersClient = new UsersClient(apiClient);
      const updatedUser = await usersClient.updatePreferences({ [key]: value });
      setUser(updatedUser);
      setSuccessMessage("Settings saved");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Settings" description="Loading settings..." />
        <div className={styles.loadingWrapper}>
          <div className={styles.skeletonBlock} />
          <div className={styles.skeletonBlock} />
        </div>
      </div>
    );
  }

  const preferences = user?.preferences ?? {};

  return (
    <div>
      <PageHeader title="Settings" description="Manage your account settings and preferences" />

      <Stack gap="lg">
        {error && (
          <div className={styles.errorBanner}>
            <Text variant="body" color="error">
              {error}
            </Text>
          </div>
        )}

        {successMessage && (
          <div className={styles.successBanner}>
            <Text variant="body" color="success">
              {successMessage}
            </Text>
          </div>
        )}

        <Card title="Appearance">
          <div className={styles.fieldGroup}>
            <label className={styles.label}>Theme</label>
            <select
              value={preferences.theme ?? "system"}
              onChange={(e) =>
                updatePreference("theme", e.target.value as "light" | "dark" | "system")
              }
              disabled={isSaving}
              className={styles.select}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <Text variant="caption" color="secondary">
              Choose how the app looks to you
            </Text>
          </div>
        </Card>

        <Card title="Notifications">
          <Stack gap="md">
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={preferences.emailNotifications ?? true}
                onChange={(e) => updatePreference("emailNotifications", e.target.checked)}
                disabled={isSaving}
                className={styles.checkbox}
              />
              <div>
                <Text variant="body" color="primary">
                  Email notifications
                </Text>
                <Text variant="caption" color="secondary">
                  Receive important updates and alerts via email
                </Text>
              </div>
            </label>

            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={preferences.marketingEmails ?? false}
                onChange={(e) => updatePreference("marketingEmails", e.target.checked)}
                disabled={isSaving}
                className={styles.checkbox}
              />
              <div>
                <Text variant="body" color="primary">
                  Marketing emails
                </Text>
                <Text variant="caption" color="secondary">
                  Receive news, updates, and promotional content
                </Text>
              </div>
            </label>
          </Stack>
        </Card>

        <Card title="Account">
          <Stack gap="sm">
            <Text variant="caption" color="secondary">
              Signed in as{" "}
              <Text as="span" variant="caption" color="primary">
                {user?.email}
              </Text>
            </Text>
            <Button variant="secondary" onClick={() => signOut()}>
              Sign Out
            </Button>
          </Stack>
        </Card>
      </Stack>
    </div>
  );
}

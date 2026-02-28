import { useState, useEffect } from "react";
import { useAuth } from "@mbe/auth/react";
import { PageHeader } from "@mbe/shared-layout";
import { Card, CardHeader, CardTitle, CardContent, Button } from "@mbe/ui";
import { ApiClient, UsersClient } from "@mbe/api-client";
import type { User, UserPreferences } from "@mbe/types";

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
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-gray-200 rounded-lg" />
            <div className="h-32 bg-gray-200 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  const preferences = user?.preferences ?? {};

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your account settings and preferences"
      />

      <div className="p-6 space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-600">{successMessage}</p>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Theme
                </label>
                <select
                  value={preferences.theme ?? "system"}
                  onChange={(e) =>
                    updatePreference(
                      "theme",
                      e.target.value as "light" | "dark" | "system"
                    )
                  }
                  disabled={isSaving}
                  className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
                <p className="mt-1 text-sm text-gray-500">
                  Choose how the app looks to you
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={preferences.emailNotifications ?? true}
                  onChange={(e) =>
                    updatePreference("emailNotifications", e.target.checked)
                  }
                  disabled={isSaving}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div>
                  <span className="font-medium">Email notifications</span>
                  <p className="text-sm text-gray-500">
                    Receive important updates and alerts via email
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={preferences.marketingEmails ?? false}
                  onChange={(e) =>
                    updatePreference("marketingEmails", e.target.checked)
                  }
                  disabled={isSaving}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div>
                  <span className="font-medium">Marketing emails</span>
                  <p className="text-sm text-gray-500">
                    Receive news, updates, and promotional content
                  </p>
                </div>
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 mb-2">
                  Signed in as <span className="font-medium">{user?.email}</span>
                </p>
                <Button variant="outline" onClick={() => signOut()}>
                  Sign Out
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

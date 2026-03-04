import { useState, useEffect } from "react";
import { useAuth } from "@mbe/auth/react";
import { Card, Button, Text, Stack } from "@mbe/rialto";
import { ApiClient, UsersClient } from "@mbe/api-client";
import type { User } from "@mbe/types";
import { PageHeader } from "../components/PageHeader";
import styles from "./ProfilePage.module.css";

export function ProfilePage() {
  const { accessToken, user: authUser } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({ name: "", picture: "" });

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
        setFormData({
          name: userData.name ?? "",
          picture: userData.picture ?? "",
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        setIsLoading(false);
      }
    }

    fetchUser();
  }, [accessToken]);

  async function handleSave() {
    if (!accessToken || !user) return;

    try {
      setIsSaving(true);
      const apiClient = new ApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
      });
      const usersClient = new UsersClient(apiClient);
      const updatedUser = await usersClient.update(user.id, {
        name: formData.name || undefined,
        picture: formData.picture || undefined,
      });
      setUser(updatedUser);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    setFormData({
      name: user?.name ?? "",
      picture: user?.picture ?? "",
    });
    setIsEditing(false);
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Profile" description="Loading your profile..." />
        <div className={styles.loadingWrapper}>
          <div className={styles.skeletonBlock} />
          <div className={styles.skeletonBlock} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Profile" description="Manage your profile" />
        <Card>
          <Stack gap="md" align="center">
            <Text variant="body" color="error">
              {error}
            </Text>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </Stack>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Profile" description="View and manage your profile information" />

      <Stack gap="lg">
        <Card>
          <div className={styles.cardHeader}>
            <Text variant="label" color="primary">
              Profile Information
            </Text>
            {!isEditing && (
              <Button variant="secondary" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
            )}
          </div>

          <div className={styles.profileBody}>
            <div className={styles.avatarWrapper}>
              {(user?.picture || authUser?.picture) && (
                <img
                  src={user?.picture ?? authUser?.picture}
                  alt={user?.name ?? "User"}
                  className={styles.avatar}
                />
              )}
              {!user?.picture && !authUser?.picture && (
                <div className={styles.avatarFallback}>
                  <Text variant="display" color="secondary">
                    {(user?.name ?? authUser?.name ?? "U").charAt(0).toUpperCase()}
                  </Text>
                </div>
              )}
            </div>

            {isEditing ? (
              <div className={styles.formFields}>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={styles.input}
                    placeholder="Your name"
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.label}>Picture URL</label>
                  <input
                    type="url"
                    value={formData.picture}
                    onChange={(e) => setFormData({ ...formData, picture: e.target.value })}
                    className={styles.input}
                    placeholder="https://example.com/photo.jpg"
                  />
                </div>
                <Stack gap="sm" direction="row">
                  <Button variant="primary" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save"}
                  </Button>
                  <Button variant="secondary" onClick={handleCancel} disabled={isSaving}>
                    Cancel
                  </Button>
                </Stack>
              </div>
            ) : (
              <dl className={styles.dataList}>
                <div className={styles.dataItem}>
                  <dt>
                    <Text variant="caption" color="secondary">
                      Name
                    </Text>
                  </dt>
                  <dd>
                    <Text variant="body" color="primary">
                      {user?.name ?? "Not set"}
                    </Text>
                  </dd>
                </div>
                <div className={styles.dataItem}>
                  <dt>
                    <Text variant="caption" color="secondary">
                      Email
                    </Text>
                  </dt>
                  <dd>
                    <Text variant="body" color="primary">
                      {user?.email}
                    </Text>
                  </dd>
                </div>
              </dl>
            )}
          </div>
        </Card>

        <Card title="Account Details">
          <dl className={styles.accountGrid}>
            <div className={styles.dataItem}>
              <dt>
                <Text variant="caption" color="secondary">
                  User ID
                </Text>
              </dt>
              <dd>
                <Text variant="detail" color="secondary">
                  {user?.id}
                </Text>
              </dd>
            </div>
            <div className={styles.dataItem}>
              <dt>
                <Text variant="caption" color="secondary">
                  Email Verified
                </Text>
              </dt>
              <dd>
                <span
                  className={
                    user?.emailVerified ? styles.badgeVerified : styles.badgeUnverified
                  }
                >
                  {user?.emailVerified ? "Verified" : "Not verified"}
                </span>
              </dd>
            </div>
            <div className={styles.dataItem}>
              <dt>
                <Text variant="caption" color="secondary">
                  Member Since
                </Text>
              </dt>
              <dd>
                <Text variant="detail" color="secondary">
                  {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Unknown"}
                </Text>
              </dd>
            </div>
            <div className={styles.dataItem}>
              <dt>
                <Text variant="caption" color="secondary">
                  Last Updated
                </Text>
              </dt>
              <dd>
                <Text variant="detail" color="secondary">
                  {user?.updatedAt ? new Date(user.updatedAt).toLocaleDateString() : "Unknown"}
                </Text>
              </dd>
            </div>
          </dl>
        </Card>
      </Stack>
    </div>
  );
}

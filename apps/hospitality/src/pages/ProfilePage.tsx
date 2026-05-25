import { useState, useCallback } from "react";
import { useAuth } from "@mbe/auth/react";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  DataList,
  Divider,
  Input,
  Skeleton,
  SkeletonGroup,
  Stack,
  Text,
} from "@mattbutlerengineering/rialto";
import type { DataListItem } from "@mattbutlerengineering/rialto";
import { PageHeader } from "../components/PageHeader";
import { useCurrentUser, useUpdateCurrentUser } from "../hooks/useUsers.js";
import styles from "./ProfilePage.module.css";

function formatMemberSince(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function formatRelativeTime(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ProfilePage() {
  const { user: authUser } = useAuth();
  const { data: user, isLoading, error } = useCurrentUser();
  const updateMutation = useUpdateCurrentUser();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", picture: "" });

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, name: e.target.value }));
  }, []);

  const handlePictureChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, picture: e.target.value }));
  }, []);

  async function handleSave() {
    if (!user) return;

    try {
      setIsSaving(true);
      setSaveError(null);
      await updateMutation.mutateAsync({
        id: user.id,
        data: {
          name: formData.name || undefined,
          picture: formData.picture || undefined,
        },
      });
      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save profile");
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
    setSaveError(null);
  }

  function handleEdit() {
    setFormData({
      name: user?.name ?? "",
      picture: user?.picture ?? "",
    });
    setIsEditing(true);
    setSaveSuccess(false);
  }

  const isNameEmpty = formData.name.trim().length === 0;

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Profile" description="Loading your profile..." />
        <Stack gap="lg">
          <SkeletonGroup>
            <Card>
              <div className={styles.heroSkeleton}>
                <Skeleton variant="circle" width={96} />
                <div className={styles.heroSkeletonText}>
                  <Skeleton variant="heading" width="60%" />
                  <Skeleton variant="text" width="40%" />
                </div>
              </div>
            </Card>
          </SkeletonGroup>
          <SkeletonGroup>
            <Card>
              <Skeleton variant="text" lines={3} width="100%" />
            </Card>
          </SkeletonGroup>
        </Stack>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div>
        <PageHeader title="Profile" description="Manage your profile" />
        <div style={{ marginBlock: "var(--rialto-space-md)" }}>
          <Alert variant="error" title="Failed to load profile">
            {error.message}
          </Alert>
        </div>
        <div className={styles.retryWrapper}>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const displayName = user?.name ?? authUser?.name ?? "User";
  const displayEmail = user?.email ?? authUser?.email ?? "";
  const avatarSrc = user?.picture ?? authUser?.picture;

  const accountItems: DataListItem[] = [
    { label: "User ID", value: user?.id ?? "Unknown" },
    {
      label: "Email Verified",
      value: (
        <Badge variant={user?.emailVerified ? "success" : "warning"} dot>
          {user?.emailVerified ? "Verified" : "Not verified"}
        </Badge>
      ),
    },
    {
      label: "Member Since",
      value: user?.createdAt ? formatMemberSince(user.createdAt) : "Unknown",
    },
    {
      label: "Last Updated",
      value: user?.updatedAt ? formatRelativeTime(user.updatedAt) : "Unknown",
    },
  ];

  return (
    <div>
      <PageHeader title="Profile" description="View and manage your profile information" />

      <Stack gap="lg">
        {saveSuccess && (
          <Alert
            variant="success"
            title="Profile updated"
            dismissible
            onDismiss={() => setSaveSuccess(false)}
          >
            Your changes have been saved successfully.
          </Alert>
        )}

        {saveError && (
          <Alert variant="error" title="Error" dismissible onDismiss={() => setSaveError(null)}>
            {saveError}
          </Alert>
        )}

        {/* Profile hero */}
        <Card>
          <div className={styles.hero}>
            <div className={styles.heroAvatar}>
              <Avatar src={avatarSrc} name={displayName} size="xl" className={styles.avatarRing} />
            </div>

            <div className={styles.heroInfo}>
              <Text variant="display" color="primary">
                {displayName}
              </Text>
              <Text variant="body" color="secondary">
                {displayEmail}
              </Text>
            </div>

            {!isEditing && (
              <div className={styles.heroAction}>
                <Button variant="secondary" onClick={handleEdit}>
                  Edit Profile
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Edit form */}
        <div className={`${styles.editPanel} ${isEditing ? styles.editPanelOpen : ""}`}>
          {isEditing && (
            <Card>
              <div className={styles.editHeader}>
                <Text variant="label" color="primary">
                  Edit Profile
                </Text>
              </div>
              <Stack gap="md">
                <Input
                  label="Name"
                  value={formData.name}
                  onChange={handleNameChange}
                  placeholder="Your name"
                  required
                  error={isNameEmpty}
                  hint={isNameEmpty ? "Name is required" : undefined}
                />
                <Input
                  label="Picture URL"
                  type="url"
                  value={formData.picture}
                  onChange={handlePictureChange}
                  placeholder="https://example.com/photo.jpg"
                  showOptional
                />
                <Divider spacing="compact" />
                <Stack gap="sm" direction="row">
                  <Button variant="primary" onClick={handleSave} disabled={isSaving || isNameEmpty}>
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button variant="secondary" onClick={handleCancel} disabled={isSaving}>
                    Cancel
                  </Button>
                </Stack>
              </Stack>
            </Card>
          )}
        </div>

        {/* Account details */}
        <Card>
          <div className={styles.sectionHeader}>
            <Text variant="label" color="primary">
              Account Details
            </Text>
          </div>
          <DataList items={accountItems} orientation="horizontal" striped />
        </Card>

        {/* Activity summary */}
        <Card>
          <div className={styles.sectionHeader}>
            <Text variant="label" color="primary">
              Activity Summary
            </Text>
          </div>
          <div className={styles.activityGrid}>
            <div className={styles.activityItem}>
              <Text variant="caption" color="secondary">
                Member Since
              </Text>
              <Text variant="body" color="primary">
                {user?.createdAt ? formatMemberSince(user.createdAt) : "Unknown"}
              </Text>
            </div>
            <div className={styles.activityItem}>
              <Text variant="caption" color="secondary">
                Last Updated
              </Text>
              <Text variant="body" color="primary">
                {user?.updatedAt ? formatRelativeTime(user.updatedAt) : "Unknown"}
              </Text>
            </div>
            <div className={styles.activityItem}>
              <Text variant="caption" color="secondary">
                Email Status
              </Text>
              <Badge variant={user?.emailVerified ? "success" : "warning"} dot>
                {user?.emailVerified ? "Verified" : "Not verified"}
              </Badge>
            </div>
          </div>
        </Card>
      </Stack>
    </div>
  );
}

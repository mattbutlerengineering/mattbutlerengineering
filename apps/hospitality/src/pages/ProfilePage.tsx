import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
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
  Meter,
  Odometer,
  Skeleton,
  SkeletonGroup,
  Stack,
  StatusLED,
  Text,
} from "@mattbutlerengineering/rialto";
import type { DataListItem } from "@mattbutlerengineering/rialto";
import { PageHeader } from "../components/PageHeader";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import { useCurrentUser, useUpdateCurrentUser } from "../hooks/useUsers.js";
import {
  computeElapsedPercent,
  readEpochClaim,
  useSessionClock,
  type SessionPhase,
} from "../hooks/useSessionClock.js";
import styles from "./ProfilePage.module.css";

interface ProfileFormData {
  name: string;
  picture: string;
}

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

/** How each session phase reads on the instrument cluster's telltale LED. */
const SESSION_LED: Record<
  SessionPhase,
  { variant: "success" | "warning" | "danger"; pulse: boolean; label: string }
> = {
  fresh: { variant: "success", pulse: true, label: "Session active" },
  "refresh-window": { variant: "warning", pulse: true, label: "Refreshing soon" },
  expired: { variant: "danger", pulse: false, label: "Session expired" },
};

interface SessionClusterProps {
  remainingMs: number;
  phase: SessionPhase;
  /** Percent of token lifetime elapsed, or null when not derivable. */
  elapsedPercent: number | null;
}

/** The live instruments: countdown reels, telltale LED, and lifetime gauge. */
function SessionCluster({ remainingMs, phase, elapsedPercent }: SessionClusterProps) {
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const led = SESSION_LED[phase];

  return (
    <div className={styles.sessionCluster}>
      <div className={styles.sessionReadout}>
        <div
          className={styles.sessionCountdown}
          role="timer"
          aria-label="Time until the session token expires"
        >
          <Odometer
            value={minutes}
            formatOptions={{ minimumIntegerDigits: 2, useGrouping: false }}
            aria-label="Minutes remaining"
          />
          <Text className={styles.sessionSeparator} aria-hidden="true">
            :
          </Text>
          <Odometer
            value={seconds}
            formatOptions={{ minimumIntegerDigits: 2, useGrouping: false }}
            aria-label="Seconds remaining"
          />
        </div>
        <div className={styles.sessionStatus}>
          <StatusLED variant={led.variant} pulse={led.pulse} label={led.label} />
          <Text variant="caption" color="secondary">
            {led.label}
          </Text>
        </div>
      </div>
      <Meter label="Token lifetime elapsed" value={elapsedPercent} showValue size="sm" />
    </div>
  );
}

export function ProfilePage() {
  const { user: authUser } = useAuth();
  // Session timing comes from the token claims @mbe/auth/react surfaces via
  // `user.raw` (`exp`/`iat`, epoch seconds). react-oidc-context's access-token
  // `expires_at` isn't reachable here without adding a direct dependency on
  // it, and claims are treated as untrusted data — anything malformed simply
  // yields the panel's empty state.
  const sessionExpiresAt = readEpochClaim(authUser?.raw, "exp");
  const sessionIssuedAt = readEpochClaim(authUser?.raw, "iat");
  const sessionClock = useSessionClock(sessionExpiresAt);
  const sessionElapsedPercent = computeElapsedPercent(
    sessionIssuedAt,
    sessionExpiresAt,
    sessionClock.remainingMs
  );
  const { data: user, isLoading, error, refetch } = useCurrentUser();
  const updateMutation = useUpdateCurrentUser();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { handleSubmit, watch, reset, setValue } = useForm<ProfileFormData>({
    defaultValues: { name: "", picture: "" },
  });

  useEffect(() => {
    return () => {
      if (saveSuccessTimeoutRef.current !== null) {
        clearTimeout(saveSuccessTimeoutRef.current);
      }
    };
  }, []);

  const watchedName = watch("name");
  const watchedPicture = watch("picture");
  const isNameEmpty = watchedName.trim().length === 0;

  async function onFormSubmit(data: ProfileFormData) {
    if (!user) return;

    try {
      setIsSaving(true);
      setSaveError(null);
      await updateMutation.mutateAsync({
        id: user.id,
        data: {
          name: data.name || undefined,
          picture: data.picture || undefined,
        },
      });
      setIsEditing(false);
      setSaveSuccess(true);
      if (saveSuccessTimeoutRef.current !== null) {
        clearTimeout(saveSuccessTimeoutRef.current);
      }
      saveSuccessTimeoutRef.current = setTimeout(() => {
        saveSuccessTimeoutRef.current = null;
        setSaveSuccess(false);
      }, 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    reset({
      name: user?.name ?? "",
      picture: user?.picture ?? "",
    });
    setIsEditing(false);
    setSaveError(null);
  }

  function handleEdit() {
    reset({
      name: user?.name ?? "",
      picture: user?.picture ?? "",
    });
    setIsEditing(true);
    setSaveSuccess(false);
  }

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
        <ErrorRetryBanner error={error.message} onRetry={refetch} />
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

        {/* Session instrument cluster */}
        <Card>
          <div className={styles.sectionHeader}>
            <Text variant="label" color="primary">
              Session
            </Text>
          </div>
          {sessionClock.phase === null ? (
            <Text variant="caption" color="secondary">
              No active session token to read.
            </Text>
          ) : (
            <SessionCluster
              remainingMs={sessionClock.remainingMs}
              phase={sessionClock.phase}
              elapsedPercent={sessionElapsedPercent}
            />
          )}
        </Card>

        {/* Edit form */}
        <div className={`${styles.editPanel} ${isEditing ? styles.editPanelOpen : ""}`}>
          {isEditing && (
            <Card>
              <form noValidate onSubmit={handleSubmit(onFormSubmit)}>
                <div className={styles.editHeader}>
                  <Text variant="label" color="primary">
                    Edit Profile
                  </Text>
                </div>
                <Stack gap="md">
                  <Input
                    label="Name"
                    value={watchedName}
                    onChange={(e) => setValue("name", e.target.value)}
                    placeholder="Your name"
                    error={isNameEmpty}
                    hint={isNameEmpty ? "Name is required" : undefined}
                  />
                  <Input
                    label="Picture URL"
                    type="url"
                    value={watchedPicture}
                    onChange={(e) => setValue("picture", e.target.value)}
                    placeholder="https://example.com/photo.jpg"
                    showOptional
                  />
                  <Divider spacing="compact" />
                  <Stack gap="sm" direction="row">
                    <Button variant="primary" type="submit" disabled={isSaving || isNameEmpty}>
                      {isSaving ? "Saving..." : "Save Changes"}
                    </Button>
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={handleCancel}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                  </Stack>
                </Stack>
              </form>
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

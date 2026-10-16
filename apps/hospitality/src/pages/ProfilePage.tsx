import { useVenueFormat, type VenueFormat } from "../hooks/useVenueFormat.js";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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
import { describeApiError } from "../lib/describe-api-error.js";
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

function formatMemberSince(date: string | Date, fmt: VenueFormat): string {
  return fmt.formatInstant(date, { month: "long", year: "numeric" });
}

function formatRelativeTime(date: string | Date, fmt: VenueFormat, t: TFunction): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return t("profile.relative.justNow");
  if (diffMin < 60) return t("profile.relative.minutes", { count: diffMin });
  if (diffHr < 24) return t("profile.relative.hours", { count: diffHr });
  if (diffDays < 30) return t("profile.relative.days", { count: diffDays });
  return fmt.formatInstant(date, { month: "short", day: "numeric", year: "numeric" });
}

/** How each session phase reads on the instrument cluster's telltale LED. */
const SESSION_LED: Record<
  SessionPhase,
  {
    variant: "success" | "warning" | "danger";
    pulse: boolean;
    labelKey: "profile.session.active" | "profile.session.refreshing" | "profile.session.expired";
  }
> = {
  fresh: { variant: "success", pulse: true, labelKey: "profile.session.active" },
  "refresh-window": { variant: "warning", pulse: true, labelKey: "profile.session.refreshing" },
  expired: { variant: "danger", pulse: false, labelKey: "profile.session.expired" },
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
  const { t } = useTranslation();
  const ledLabel = t(led.labelKey);

  return (
    <div className={styles.sessionCluster}>
      <div className={styles.sessionReadout}>
        <div
          className={styles.sessionCountdown}
          role="timer"
          aria-label={t("profile.session.timerLabel")}
        >
          <Odometer
            value={minutes}
            formatOptions={{ minimumIntegerDigits: 2, useGrouping: false }}
            aria-label={t("profile.session.minutesRemaining")}
          />
          <Text className={styles.sessionSeparator} aria-hidden="true">
            :
          </Text>
          <Odometer
            value={seconds}
            formatOptions={{ minimumIntegerDigits: 2, useGrouping: false }}
            aria-label={t("profile.session.secondsRemaining")}
          />
        </div>
        <div className={styles.sessionStatus}>
          <StatusLED variant={led.variant} pulse={led.pulse} label={ledLabel} />
          <Text variant="caption" color="secondary">
            {ledLabel}
          </Text>
        </div>
      </div>
      <Meter
        label={t("profile.session.lifetimeElapsed")}
        value={elapsedPercent}
        showValue
        size="sm"
      />
    </div>
  );
}

export function ProfilePage() {
  const fmt = useVenueFormat();
  const { t } = useTranslation();
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
      setSaveError(describeApiError(err).detail);
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
        <PageHeader title={t("profile.title")} description={t("profile.loading")} />
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
    const loadFailure = describeApiError(error);
    return (
      <div>
        <PageHeader title={t("profile.title")} description={t("profile.manage")} />
        <ErrorRetryBanner
          title={t("profile.loadError")}
          error={loadFailure.detail}
          details={loadFailure.raw}
          onRetry={refetch}
        />
      </div>
    );
  }

  const displayName = user?.name ?? authUser?.name ?? t("profile.fallbackName");
  const displayEmail = user?.email ?? authUser?.email ?? "";
  const avatarSrc = user?.picture ?? authUser?.picture;

  const accountItems: DataListItem[] = [
    { label: t("profile.account.userId"), value: user?.id ?? t("profile.unknown") },
    {
      label: t("profile.account.emailVerified"),
      value: (
        <Badge variant={user?.emailVerified ? "success" : "warning"} dot>
          {user?.emailVerified ? t("profile.verified") : t("profile.notVerified")}
        </Badge>
      ),
    },
    {
      label: t("profile.memberSince"),
      value: user?.createdAt ? formatMemberSince(user.createdAt, fmt) : t("profile.unknown"),
    },
    {
      label: t("profile.lastUpdated"),
      value: user?.updatedAt ? formatRelativeTime(user.updatedAt, fmt, t) : t("profile.unknown"),
    },
  ];

  return (
    <div>
      <PageHeader title={t("profile.title")} description={t("profile.description")} />

      <Stack gap="lg" data-testid="primary-content">
        {saveSuccess && (
          <Alert
            variant="success"
            title={t("profile.saved.title")}
            dismissible
            onDismiss={() => setSaveSuccess(false)}
          >
            {t("profile.saved.body")}
          </Alert>
        )}

        {saveError && (
          <Alert
            variant="error"
            title={t("profile.saveError")}
            dismissible
            onDismiss={() => setSaveError(null)}
          >
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
                  {t("profile.edit")}
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Session instrument cluster */}
        <Card>
          <div className={styles.sectionHeader}>
            <Text variant="label" color="primary">
              {t("profile.session.title")}
            </Text>
          </div>
          {sessionClock.phase === null ? (
            <Text variant="caption" color="secondary">
              {t("profile.session.none")}
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
                    {t("profile.edit")}
                  </Text>
                </div>
                <Stack gap="md">
                  <Input
                    label={t("profile.form.name")}
                    value={watchedName}
                    onChange={(e) => setValue("name", e.target.value)}
                    placeholder={t("profile.form.namePlaceholder")}
                    error={isNameEmpty}
                    hint={isNameEmpty ? t("profile.form.nameRequired") : undefined}
                  />
                  <Input
                    label={t("profile.form.pictureUrl")}
                    type="url"
                    value={watchedPicture}
                    onChange={(e) => setValue("picture", e.target.value)}
                    placeholder={t("profile.form.picturePlaceholder")}
                    showOptional
                  />
                  <Divider spacing="compact" />
                  <Stack gap="sm" direction="row">
                    <Button variant="primary" type="submit" disabled={isSaving || isNameEmpty}>
                      {isSaving ? t("profile.form.saving") : t("profile.form.save")}
                    </Button>
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={handleCancel}
                      disabled={isSaving}
                    >
                      {t("profile.form.cancel")}
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
              {t("profile.account.title")}
            </Text>
          </div>
          <DataList items={accountItems} orientation="horizontal" striped />
        </Card>

        {/* Activity summary */}
        <Card>
          <div className={styles.sectionHeader}>
            <Text variant="label" color="primary">
              {t("profile.activity.title")}
            </Text>
          </div>
          <div className={styles.activityGrid}>
            <div className={styles.activityItem}>
              <Text variant="caption" color="secondary">
                {t("profile.memberSince")}
              </Text>
              <Text variant="body" color="primary">
                {user?.createdAt ? formatMemberSince(user.createdAt, fmt) : t("profile.unknown")}
              </Text>
            </div>
            <div className={styles.activityItem}>
              <Text variant="caption" color="secondary">
                {t("profile.lastUpdated")}
              </Text>
              <Text variant="body" color="primary">
                {user?.updatedAt
                  ? formatRelativeTime(user.updatedAt, fmt, t)
                  : t("profile.unknown")}
              </Text>
            </div>
            <div className={styles.activityItem}>
              <Text variant="caption" color="secondary">
                {t("profile.activity.emailStatus")}
              </Text>
              <Badge variant={user?.emailVerified ? "success" : "warning"} dot>
                {user?.emailVerified ? t("profile.verified") : t("profile.notVerified")}
              </Badge>
            </div>
          </div>
        </Card>
      </Stack>
    </div>
  );
}

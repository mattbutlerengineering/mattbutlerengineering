import { useVenueFormat, type VenueFormat } from "../hooks/useVenueFormat.js";
import { useState, useMemo, useCallback, Fragment } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Avatar,
  Badge,
  Card,
  Divider,
  Input,
  Pagination,
  SegmentedControl,
  Skeleton,
  SkeletonGroup,
  Stat,
  Text,
} from "@mattbutlerengineering/rialto";
import type { User } from "@mbe/types";
import { PageHeader } from "../components/PageHeader";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import { describeApiError } from "../lib/describe-api-error.js";
import { useUsers } from "../hooks/useUsers.js";
import styles from "./AdminPage.module.css";

type StatusFilter = "all" | "verified" | "unverified";

const SearchIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </svg>
);

const statusSegments = (t: TFunction) => [
  { id: "all", label: t("admin.filter.all") },
  { id: "verified", label: t("admin.filter.verified") },
  { id: "unverified", label: t("admin.filter.unverified") },
];

function themeText(t: TFunction, theme: string): string {
  if (theme === "system") return t("settings.theme.system");
  if (theme === "light") return t("settings.theme.light");
  if (theme === "dark") return t("settings.theme.dark");
  return theme;
}

function isCurrentMonth(dateString: string): boolean {
  const date = new Date(dateString);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function formatFullDate(dateString: string, fmt: VenueFormat): string {
  return fmt.formatInstant(dateString, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(dateString: string, fmt: VenueFormat): string {
  return fmt.formatInstant(dateString, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function LoadingSkeleton() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t("admin.title")} description={t("admin.loading")} />
      <div className={styles.statsRow}>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} variant="rect" width="100%" height={72} />
        ))}
      </div>
      <Card>
        <SkeletonGroup>
          <div className={styles.skeletonTable}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className={styles.skeletonRow}>
                <Skeleton variant="circle" width={32} />
                <Skeleton variant="text" width="40%" />
                <Skeleton variant="rect" width={64} height={22} />
                <Skeleton variant="text" width="15%" />
              </div>
            ))}
          </div>
        </SkeletonGroup>
      </Card>
    </div>
  );
}

function UserDetailRow({ user }: { readonly user: User }) {
  const fmt = useVenueFormat();
  const { t } = useTranslation();
  return (
    <tr className={styles.detailRow}>
      <td colSpan={4}>
        <div className={styles.detailContent}>
          <div className={styles.detailGrid}>
            <div className={styles.detailField}>
              <Text variant="caption" color="secondary">
                {t("admin.detail.userId")}
              </Text>
              <Text variant="detail" color="primary">
                {user.id}
              </Text>
            </div>
            <div className={styles.detailField}>
              <Text variant="caption" color="secondary">
                {t("admin.detail.created")}
              </Text>
              <Text variant="detail" color="primary">
                {formatFullDate(user.createdAt, fmt)}
              </Text>
            </div>
            <div className={styles.detailField}>
              <Text variant="caption" color="secondary">
                {t("admin.detail.updated")}
              </Text>
              <Text variant="detail" color="primary">
                {formatFullDate(user.updatedAt, fmt)}
              </Text>
            </div>
            <div className={styles.detailField}>
              <Text variant="caption" color="secondary">
                {t("admin.detail.theme")}
              </Text>
              <Text variant="detail" color="primary">
                {themeText(t, user.preferences.theme ?? "system")}
              </Text>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

export function AdminPage() {
  const fmt = useVenueFormat();
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const {
    data: users = [],
    pagination,
    isLoading,
    error,
    refetch,
  } = useUsers({ page: currentPage, limit: 10 });

  const filteredUsers = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return users.filter((user) => {
      const matchesSearch =
        query === "" ||
        (user.name?.toLowerCase().includes(query) ?? false) ||
        user.email.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "verified" && user.emailVerified) ||
        (statusFilter === "unverified" && !user.emailVerified);

      return matchesSearch && matchesStatus;
    });
  }, [users, searchQuery, statusFilter]);

  const stats = useMemo(() => {
    const total = pagination?.total ?? users.length;
    const verified = users.filter((u) => u.emailVerified).length;
    const newThisMonth = users.filter((u) => isCurrentMonth(u.createdAt)).length;
    return { total, verified, newThisMonth };
  }, [users, pagination]);

  const handleToggleExpand = useCallback((userId: string) => {
    setExpandedUserId((prev) => (prev === userId ? null : userId));
  }, []);

  const handleStatusFilterChange = useCallback((id: string) => {
    setStatusFilter(id as StatusFilter);
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    const loadFailure = describeApiError(error);
    return (
      <div>
        <PageHeader title={t("admin.title")} description={t("admin.management")} />
        <ErrorRetryBanner
          title={t("admin.loadError")}
          error={loadFailure.detail}
          details={loadFailure.raw}
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t("admin.title")} description={t("admin.description")} />

      <div className={styles.statsRow}>
        <Stat label={t("admin.stats.total")} value={stats.total} size="sm" />
        <Stat label={t("admin.stats.verified")} value={stats.verified} size="sm" />
        <Stat label={t("admin.stats.newThisMonth")} value={stats.newThisMonth} size="sm" />
      </div>

      <Divider spacing="compact" />

      <Card>
        <div className={styles.toolbar}>
          <Input
            aria-label={t("admin.search.label")}
            placeholder={t("admin.search.placeholder")}
            value={searchQuery}
            onChange={handleSearchChange}
            startIcon={SearchIcon}
          />
          <SegmentedControl
            segments={statusSegments(t)}
            value={statusFilter}
            onChange={handleStatusFilterChange}
            size="sm"
          />
        </div>

        <div className={styles.tableWrapper}>
          {/* eslint-disable-next-line mbe-local/prefer-rialto-components -- Rialto Table requires columns/data/rowKey API; this table uses expandable detail rows via Fragment which is unsupported */}
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>{t("admin.col.user")}</th>
                <th className={styles.th}>{t("admin.col.email")}</th>
                <th className={styles.th}>{t("admin.col.status")}</th>
                <th className={styles.th}>{t("admin.col.joined")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user, index) => (
                <Fragment key={user.id}>
                  <tr
                    className={[
                      styles.row,
                      index % 2 === 1 ? styles.rowAlt : "",
                      expandedUserId === user.id ? styles.rowExpanded : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <td className={styles.td}>
                      <div className={styles.userCell}>
                        {/* eslint-disable-next-line mbe-local/prefer-rialto-components -- full-row-clickable "stretched link" control requires a native, unstyled button element positioned over the <tr> */}
                        <button
                          type="button"
                          className={styles.rowButton}
                          onClick={() => handleToggleExpand(user.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleToggleExpand(user.id);
                            }
                          }}
                          aria-expanded={expandedUserId === user.id}
                          aria-label={t(
                            expandedUserId === user.id ? "admin.row.collapse" : "admin.row.expand",
                            { name: user.name ?? user.email }
                          )}
                        />
                        <Avatar
                          src={user.picture ?? undefined}
                          name={user.name ?? user.email}
                          size="sm"
                        />
                        <Text variant="body" color="primary">
                          {user.name ?? "—"}
                        </Text>
                      </div>
                    </td>
                    <td className={styles.td}>
                      <Text variant="body" color="secondary">
                        {user.email}
                      </Text>
                    </td>
                    <td className={styles.td}>
                      {user.emailVerified ? (
                        <Badge variant="success" size="sm" dot>
                          {t("admin.filter.verified")}
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">
                          {t("admin.filter.unverified")}
                        </Badge>
                      )}
                    </td>
                    <td className={styles.td}>
                      <Text variant="detail" color="secondary">
                        {formatShortDate(user.createdAt, fmt)}
                      </Text>
                    </td>
                  </tr>
                  {expandedUserId === user.id && (
                    <UserDetailRow key={`${user.id}-detail`} user={user} />
                  )}
                </Fragment>
              ))}
            </tbody>
            {/* eslint-disable-next-line mbe-local/prefer-rialto-components */}
          </table>
        </div>

        <Text className={styles.srOnly} aria-live="polite" role="status">
          {t("admin.shown", { count: filteredUsers.length })}
        </Text>

        {filteredUsers.length === 0 && (
          <div className={styles.emptyState} aria-live="polite" role="status">
            <Text variant="body" color="secondary">
              {searchQuery || statusFilter !== "all"
                ? t("admin.empty.filtered")
                : t("admin.empty.none")}
            </Text>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className={styles.paginationRow}>
            <Pagination
              page={currentPage}
              totalPages={pagination.totalPages}
              onChange={setCurrentPage}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "@mbe/auth/react";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  Input,
  Pagination,
  SegmentedControl,
  Skeleton,
  SkeletonGroup,
  Stat,
  Text,
} from "@mbe/rialto";
import { ApiClient, UsersClient } from "@mbe/api-client";
import type { User, Pagination as PaginationType } from "@mbe/types";
import { PageHeader } from "../components/PageHeader";
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

const STATUS_SEGMENTS = [
  { id: "all", label: "All" },
  { id: "verified", label: "Verified" },
  { id: "unverified", label: "Unverified" },
];

function isCurrentMonth(dateString: string): boolean {
  const date = new Date(dateString);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function formatFullDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatShortDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function LoadingSkeleton() {
  return (
    <div>
      <PageHeader title="Admin" description="Loading users..." />
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
                <Skeleton variant="text" width="25%" />
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
  return (
    <tr className={styles.detailRow}>
      <td colSpan={4}>
        <div className={styles.detailContent}>
          <div className={styles.detailGrid}>
            <div className={styles.detailField}>
              <Text variant="caption" color="secondary">
                User ID
              </Text>
              <Text variant="detail" color="primary">
                {user.id}
              </Text>
            </div>
            <div className={styles.detailField}>
              <Text variant="caption" color="secondary">
                Created
              </Text>
              <Text variant="detail" color="primary">
                {formatFullDate(user.createdAt)}
              </Text>
            </div>
            <div className={styles.detailField}>
              <Text variant="caption" color="secondary">
                Updated
              </Text>
              <Text variant="detail" color="primary">
                {formatFullDate(user.updatedAt)}
              </Text>
            </div>
            <div className={styles.detailField}>
              <Text variant="caption" color="secondary">
                Theme
              </Text>
              <Text variant="detail" color="primary">
                {user.preferences.theme ?? "system"}
              </Text>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

export function AdminPage() {
  const { accessToken } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<PaginationType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUsers() {
      if (!accessToken) return;

      try {
        setIsLoading(true);
        setError(null);
        const apiClient = new ApiClient({
          baseUrl: import.meta.env.VITE_API_URL ?? "",
          getAccessToken: () => accessToken,
        });
        const usersClient = new UsersClient(apiClient);
        const response = await usersClient.list(currentPage, 10);
        setUsers(response.data);
        setPagination(response.pagination);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load users");
      } finally {
        setIsLoading(false);
      }
    }

    fetchUsers();
  }, [accessToken, currentPage]);

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
    return (
      <div>
        <PageHeader title="Admin" description="User management" />
        <Alert
          variant="error"
          title="Failed to load users"
          actions={
            <Button variant="secondary" onClick={() => window.location.reload()}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Admin" description="Manage users and system settings" />

      <div className={styles.statsRow}>
        <Stat label="Total Users" value={stats.total} size="sm" />
        <Stat label="Verified" value={stats.verified} size="sm" />
        <Stat label="New This Month" value={stats.newThisMonth} size="sm" />
      </div>

      <Divider spacing="compact" />

      <Card>
        <div className={styles.toolbar}>
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={handleSearchChange}
            startIcon={SearchIcon}
          />
          <SegmentedControl
            segments={STATUS_SEGMENTS}
            value={statusFilter}
            onChange={handleStatusFilterChange}
            size="sm"
          />
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>User</th>
                <th className={styles.th}>Email</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user, index) => (
                <>
                  <tr
                    key={user.id}
                    className={[
                      styles.row,
                      index % 2 === 1 ? styles.rowAlt : "",
                      expandedUserId === user.id ? styles.rowExpanded : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleToggleExpand(user.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleToggleExpand(user.id);
                      }
                    }}
                    aria-expanded={expandedUserId === user.id}
                  >
                    <td className={styles.td}>
                      <div className={styles.userCell}>
                        <Avatar
                          src={user.picture ?? undefined}
                          name={user.name ?? user.email}
                          size="sm"
                        />
                        <Text variant="body" color="primary">
                          {user.name ?? "\u2014"}
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
                          Verified
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="sm">
                          Unverified
                        </Badge>
                      )}
                    </td>
                    <td className={styles.td}>
                      <Text variant="detail" color="secondary">
                        {formatShortDate(user.createdAt)}
                      </Text>
                    </td>
                  </tr>
                  {expandedUserId === user.id && (
                    <UserDetailRow key={`${user.id}-detail`} user={user} />
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>

        <span className={styles.srOnly} aria-live="polite" role="status">
          {`${filteredUsers.length} user${filteredUsers.length !== 1 ? "s" : ""} shown`}
        </span>

        {filteredUsers.length === 0 && (
          <div className={styles.emptyState} aria-live="polite" role="status">
            <Text variant="body" color="secondary">
              {searchQuery || statusFilter !== "all"
                ? "No users match your filters"
                : "No users found"}
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

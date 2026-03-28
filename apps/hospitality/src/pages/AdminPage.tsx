import { useState, useEffect } from "react";
import { useAuth } from "@mbe/auth/react";
import { Card, Button, Text, Stack } from "@mbe/rialto";
import { ApiClient, UsersClient } from "@mbe/api-client";
import type { User, Pagination } from "@mbe/types";
import { PageHeader } from "../components/PageHeader";
import styles from "./AdminPage.module.css";

export function AdminPage() {
  const { accessToken } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

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

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Admin" description="Loading users..." />
        <div className={styles.loadingWrapper} aria-busy="true" role="status" aria-label="Loading">
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
          <div className={styles.skeletonRow} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Admin" description="User management" />
        <Card>
          <Stack gap="md" align="center">
            <Text variant="body" color="error" role="alert">
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
      <PageHeader title="Admin" description="Manage users and system settings" />

      <Card>
        <div className={styles.cardHeader}>
          <Text variant="label" color="primary">
            Users
          </Text>
          <Text variant="caption" color="secondary">
            {pagination?.total ?? 0} total users
          </Text>
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
              {users.map((user) => (
                <tr key={user.id} className={styles.row}>
                  <td className={styles.td}>
                    <div className={styles.userCell}>
                      {user.picture ? (
                        <img
                          src={user.picture}
                          alt={user.name ?? "User"}
                          className={styles.avatar}
                        />
                      ) : (
                        <div className={styles.avatarFallback}>
                          <Text variant="caption" color="secondary">
                            {(user.name ?? user.email).charAt(0).toUpperCase()}
                          </Text>
                        </div>
                      )}
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
                    <span
                      className={
                        user.emailVerified ? styles.badgeVerified : styles.badgeUnverified
                      }
                    >
                      {user.emailVerified ? "Verified" : "Unverified"}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <Text variant="detail" color="secondary">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </Text>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {users.length === 0 && (
          <div className={styles.emptyState}>
            <Text variant="body" color="secondary">
              No users found
            </Text>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className={styles.paginationRow}>
            <Text variant="caption" color="secondary">
              Page {pagination.page} of {pagination.totalPages}
            </Text>
            <Stack gap="sm" direction="row">
              <Button
                variant="secondary"
                onClick={() => setCurrentPage((p) => p - 1)}
                disabled={!pagination.hasPrev}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={!pagination.hasNext}
              >
                Next
              </Button>
            </Stack>
          </div>
        )}
      </Card>
    </div>
  );
}

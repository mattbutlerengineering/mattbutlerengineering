import { useState, useEffect } from "react";
import { useAuth } from "@mbe/auth/react";
import { PageHeader } from "@mbe/shared-layout";
import { Card, CardHeader, CardTitle, CardContent, Button } from "@mbe/ui";
import { ApiClient, UsersClient } from "@mbe/api-client";
import type { User } from "@mbe/types";

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
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-gray-200 rounded-lg" />
            <div className="h-24 bg-gray-200 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Profile" description="Manage your profile" />
        <div className="p-6">
          <Card>
            <CardContent className="py-8">
              <p className="text-red-600 text-center">{error}</p>
              <div className="mt-4 text-center">
                <Button onClick={() => window.location.reload()}>Retry</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Profile"
        description="View and manage your profile information"
      />

      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Profile Information</CardTitle>
              {!isEditing && (
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  Edit
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-6">
              <div className="shrink-0">
                {(user?.picture || authUser?.picture) && (
                  <img
                    src={user?.picture ?? authUser?.picture}
                    alt={user?.name ?? "User"}
                    className="w-24 h-24 rounded-full object-cover"
                  />
                )}
                {!user?.picture && !authUser?.picture && (
                  <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center">
                    <span className="text-2xl text-gray-500">
                      {(user?.name ?? authUser?.name ?? "U").charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {isEditing ? (
                <div className="flex-1 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Picture URL
                    </label>
                    <input
                      type="url"
                      value={formData.picture}
                      onChange={(e) =>
                        setFormData({ ...formData, picture: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="https://example.com/photo.jpg"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSave} disabled={isSaving}>
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                    <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex-1">
                  <dl className="space-y-4">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Name</dt>
                      <dd className="mt-1 text-lg">{user?.name ?? "Not set"}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Email</dt>
                      <dd className="mt-1 text-lg">{user?.email}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">User ID</dt>
                <dd className="mt-1 text-sm font-mono text-gray-700">{user?.id}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Email Verified</dt>
                <dd className="mt-1">
                  {user?.emailVerified ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      Not verified
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Member Since</dt>
                <dd className="mt-1 text-sm text-gray-700">
                  {user?.createdAt
                    ? new Date(user.createdAt).toLocaleDateString()
                    : "Unknown"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                <dd className="mt-1 text-sm text-gray-700">
                  {user?.updatedAt
                    ? new Date(user.updatedAt).toLocaleDateString()
                    : "Unknown"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

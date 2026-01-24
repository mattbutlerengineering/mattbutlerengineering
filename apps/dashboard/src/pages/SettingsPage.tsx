import { useAuth } from "@mbe/auth/react";
import { PageHeader } from "@mbe/shared-layout";
import { Card, CardHeader, CardTitle, CardContent, Button } from "@mbe/ui";

export function SettingsPage() {
  const { user, signOut } = useAuth();

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your account settings"
      />

      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              {user?.picture && (
                <img
                  src={user.picture}
                  alt={user.name ?? "User"}
                  className="w-16 h-16 rounded-full"
                />
              )}
              <div>
                <p className="font-medium">{user?.name ?? "Unknown"}</p>
                <p className="text-sm text-gray-500">{user?.email}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => signOut()}>
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { AppLayout, type SidebarSection } from "@mbe/shared-layout";

const sidebarSections: SidebarSection[] = [
  {
    items: [
      { label: "Home", href: "/" },
      { label: "Reservations", href: "/reservations" },
      { label: "Guests", href: "/guests" },
      { label: "Floor Plans", href: "/floor-plans" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Profile", href: "/profile" },
      { label: "Settings", href: "/settings" },
    ],
  },
  {
    title: "Admin",
    items: [
      { label: "Users", href: "/admin" },
    ],
  },
];

export function DashboardLayout() {
  const { user, signOut } = useAuth();

  return (
    <AppLayout
      header={{
        logo: (
          <Link to="/" className="text-xl font-bold">
            Dashboard
          </Link>
        ),
        isAuthenticated: true,
        user: user ?? undefined,
        onSignOut: () => signOut(),
      }}
      sidebar={{
        sections: sidebarSections,
        header: (
          <div className="text-sm text-gray-500">
            Welcome back
          </div>
        ),
      }}
    />
  );
}

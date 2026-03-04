import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { Sidebar } from "@mbe/rialto";
import type { SidebarSection } from "@mbe/rialto";
import styles from "./DashboardLayout.module.css";

function buildNavSections(
  navigate: (path: string) => void,
  currentPath: string
): SidebarSection[] {
  return [
    {
      items: [
        {
          id: "home",
          label: "Home",
          active: currentPath === "/",
          onClick: () => navigate("/"),
        },
        {
          id: "timeline",
          label: "Timeline",
          active: currentPath === "/timeline",
          onClick: () => navigate("/timeline"),
        },
        {
          id: "reservations",
          label: "Reservations",
          active: currentPath === "/reservations",
          onClick: () => navigate("/reservations"),
        },
        {
          id: "guests",
          label: "Guests",
          active: currentPath === "/guests",
          onClick: () => navigate("/guests"),
        },
        {
          id: "floor-plans",
          label: "Floor Plans",
          active: currentPath.startsWith("/floor-plans"),
          onClick: () => navigate("/floor-plans"),
        },
      ],
    },
    {
      label: "Account",
      items: [
        {
          id: "profile",
          label: "Profile",
          active: currentPath === "/profile",
          onClick: () => navigate("/profile"),
        },
        {
          id: "settings",
          label: "Settings",
          active: currentPath === "/settings",
          onClick: () => navigate("/settings"),
        },
      ],
    },
    {
      label: "Developer",
      items: [
        {
          id: "booking-widget",
          label: "Booking Widget",
          active: currentPath === "/booking-widget",
          onClick: () => navigate("/booking-widget"),
        },
      ],
    },
    {
      label: "Admin",
      items: [
        {
          id: "admin",
          label: "Users",
          active: currentPath === "/admin",
          onClick: () => navigate("/admin"),
        },
      ],
    },
  ];
}

export function DashboardLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();

  const sections = buildNavSections(navigate, location.pathname);

  // Append sign out to the Account section
  const sectionsWithSignOut: SidebarSection[] = sections.map((section) => {
    if (section.label === "Account") {
      return {
        ...section,
        items: [
          ...section.items,
          {
            id: "signout",
            label: "Sign Out",
            onClick: () => signOut(),
          },
        ],
      };
    }
    return section;
  });

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <span className={styles.logo}>Hospitality</span>
      </header>
      <div className={styles.body}>
        <Sidebar items={sectionsWithSignOut} />
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

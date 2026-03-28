import { useState, useCallback } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@mbe/auth/react";
import { Sidebar, GenCopilot } from "@mbe/rialto";
import type { SidebarSection } from "@mbe/rialto";
import { registry } from "@mbe/rialto-catalog";
import { HOSPITALITY_DOMAIN_CONTEXT } from "../constants/copilotContext.js";
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
        {
          id: "onboarding",
          label: "New Venue",
          active: currentPath === "/onboarding",
          onClick: () => navigate("/onboarding"),
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
  const { signOut, accessToken } = useAuth();

  const [copilotOpen, setCopilotOpen] = useState(false);

  // Stable token getter — passes latest token to GenCopilot without recreating on every render
  const getAccessToken = useCallback(() => accessToken, [accessToken]);

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

  // Add Tools section with Copilot toggle — immutable new array, no mutation
  const sectionsWithCopilot: SidebarSection[] = [
    ...sectionsWithSignOut,
    {
      label: "Tools",
      items: [
        {
          id: "copilot",
          label: "Copilot",
          active: copilotOpen,
          onClick: () => setCopilotOpen((prev) => !prev),
        },
      ],
    },
  ];

  return (
    <div className={styles.root} data-testid="dashboard-layout">
      <a href="#main-content" className={styles.skipLink}>
        Skip to content
      </a>
      <header className={styles.header}>
        <span className={styles.logo}>Hospitality</span>
      </header>
      <div className={styles.body}>
        <Sidebar items={sectionsWithCopilot} />
        <main id="main-content" className={styles.content}>
          <Outlet />
        </main>
      </div>
      {/* Conditionally mount GenCopilot — destroying it on close resets all streaming state */}
      {copilotOpen && (
        <GenCopilot
          onClose={() => setCopilotOpen(false)}
          api="/api/gen/ui"
          domainContext={HOSPITALITY_DOMAIN_CONTEXT}
          getAccessToken={getAccessToken}
          registry={registry}
        />
      )}
    </div>
  );
}

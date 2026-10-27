import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Badge, Shortcut } from "@mattbutlerengineering/rialto";
import styles from "./TemplateGallery.module.css";
import { shortcutKeys } from "../lib/shortcuts.js";

// ---------------------------------------------------------------------------
// Template data types
// ---------------------------------------------------------------------------

interface Template {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: TemplateCategory;
  readonly prompt: string;
}

type TemplateCategory = "Dashboards" | "Forms" | "Data Display" | "Marketing" | "Feedback";

const ALL_CATEGORIES: readonly TemplateCategory[] = [
  "Dashboards",
  "Forms",
  "Data Display",
  "Marketing",
  "Feedback",
] as const;

// ---------------------------------------------------------------------------
// Template catalog
// ---------------------------------------------------------------------------

export const TEMPLATES: readonly Template[] = [
  // Dashboards
  {
    id: "analytics-dashboard",
    title: "Analytics Dashboard",
    description: "KPI cards, an odometer-style headline stat, and a recent activity table",
    category: "Dashboards",
    prompt:
      "Dashboard with KPI cards in Cards, an Odometer for the headline stat, a BarChart of monthly revenue for the last 6 months, Badges showing week-over-week change, and a recent activity DataTable",
  },
  {
    id: "admin-dashboard",
    title: "Admin Dashboard",
    description: "User stats, system health indicators, and quick actions",
    category: "Dashboards",
    prompt: "Admin panel with user stats, system health indicators, and quick actions",
  },
  {
    id: "sales-dashboard",
    title: "Sales Dashboard",
    description: "Revenue headline, top products table, and a conversion funnel breakdown",
    category: "Dashboards",
    prompt:
      "Sales overview with an Odometer revenue headline, a top products Table, and a conversion funnel laid out as a DataList of stages with their counts and percentages",
  },

  // Forms
  {
    id: "registration-form",
    title: "Registration Form",
    description: "Multi-step registration with personal info, preferences, and confirmation",
    category: "Forms",
    prompt: "Multi-step registration with personal info, preferences, and confirmation",
  },
  {
    id: "checkout-form",
    title: "Checkout Form",
    description: "E-commerce checkout with shipping, payment, and order summary",
    category: "Forms",
    prompt: "E-commerce checkout with shipping, payment, and order summary",
  },
  {
    id: "survey-form",
    title: "Survey Form",
    description: "Customer feedback survey with rating selects, comment fields, and step tabs",
    category: "Forms",
    prompt:
      "Customer feedback survey with Select fields for 1-5 rating scales, Input fields for free-text comments, Checkboxes for multiple-choice questions, and Tabs for the survey steps",
  },

  // Data Display
  {
    id: "data-table",
    title: "Data Table",
    description: "Sortable, filterable data table with pagination, search, and bulk actions",
    category: "Data Display",
    prompt: "Sortable, filterable data table with pagination, search, and bulk actions",
  },
  {
    id: "kanban-board",
    title: "Kanban Board",
    description: "Project management board with draggable columns and task cards",
    category: "Data Display",
    prompt: "Project management board with draggable columns and task cards",
  },
  {
    id: "timeline",
    title: "Timeline",
    description: "Activity timeline with icons, timestamps, and expandable details",
    category: "Data Display",
    prompt: "Activity timeline with icons, timestamps, and expandable details",
  },

  // Marketing
  {
    id: "landing-page",
    title: "Landing Page",
    description: "SaaS landing page with hero, features grid, testimonials, and CTA",
    category: "Marketing",
    prompt: "SaaS landing page with hero, features grid, testimonials, and CTA",
  },
  {
    id: "pricing-page",
    title: "Pricing Page",
    description: "Pricing comparison table with three tiers and feature checklist",
    category: "Marketing",
    prompt: "Pricing comparison table with three tiers and feature checklist",
  },
  {
    id: "blog-layout",
    title: "Blog Layout",
    description: "Blog post layout with featured image, content, author bio, and related posts",
    category: "Marketing",
    prompt: "Blog post layout with featured image, content, author bio, and related posts",
  },
  {
    id: "help-center-page",
    title: "Help Center Page",
    description: "Documentation article with a page header, body content, and inline callouts",
    category: "Marketing",
    prompt:
      "Help center article page with a header showing the article title and category, body content with section headings, and Alert callouts next to technical terms explaining what they mean",
  },

  // Data Display (continued)
  {
    id: "team-directory",
    title: "Team Directory",
    description: "Searchable staff directory listing members with avatars, roles, and contact info",
    category: "Data Display",
    prompt:
      "Searchable team directory listing each person with an avatar, name, role, and contact details in a clean scannable list",
  },
  {
    id: "keyboard-shortcuts",
    title: "Keyboard Shortcuts Reference",
    description:
      "Reference page listing shortcuts grouped by category with styled key combinations",
    category: "Data Display",
    prompt:
      "Keyboard shortcuts reference page listing shortcuts grouped by category, each shown as a description next to its key combination styled like a physical keyboard key",
  },

  // Forms (continued)
  {
    id: "preferences-panel",
    title: "Preferences Panel",
    description: "Settings screen with toggle switches and a theme tab switcher",
    category: "Forms",
    prompt:
      "User preferences screen with a list of Toggles for feature settings and Tabs to switch between light, dark, and system theme",
  },

  // Feedback
  {
    id: "notification-center",
    title: "Notification Center",
    description: "Feed of alert messages alongside a dismissible site-wide announcement banner",
    category: "Feedback",
    prompt:
      "Notification center showing a feed of alert messages grouped by severity, alongside a dismissible announcement banner at the top for a site-wide notice",
  },
  {
    id: "loading-empty-states",
    title: "Empty States",
    description: "Friendly empty states shown when there's nothing to show",
    category: "Feedback",
    prompt:
      "Content area showing an EmptyState with an icon and message when no results are found, next to an EmptyState for a first-run screen with a call-to-action Button",
  },

  // Feedback (continued)
  {
    id: "settings-modal-flow",
    title: "Settings Modal Flow",
    description: "Confirmation dialog for destructive actions and a Dialog for advanced options",
    category: "Feedback",
    prompt:
      "Settings flow with a confirmation Dialog that appears before a destructive action, and a second Dialog with Toggles and Inputs for advanced configuration options",
  },
  {
    id: "capacity-monitor",
    title: "Capacity Monitor",
    description: "Storage and quota usage as headline counters with status badges",
    category: "Feedback",
    prompt:
      "System capacity monitor showing storage, memory, and quota usage as Odometer counters beside their limits, with a Badge in a warning state when nearing capacity",
  },

  // Data Display (continued)
  {
    id: "tabbed-settings-panel",
    title: "Tabbed Settings Panel",
    description: "Account settings organized into tabs for profile, notifications, and security",
    category: "Data Display",
    prompt:
      "Settings panel organized into tabs for profile, notifications, and security, each tab showing its own group of fields",
  },

  // Marketing (continued)
  {
    id: "app-shell",
    title: "App Shell",
    description: "Full site shell with a top navigation header and an FAQ accordion",
    category: "Marketing",
    prompt:
      "Marketing site app shell with an AppBar and NavigationMenu for primary site navigation across the top of the page, a hero section below it, and an FAQ section built from an Accordion where each question expands to reveal its answer",
  },
  {
    id: "docs-wiki-page",
    title: "Docs / Wiki Page",
    description: "Documentation page with a breadcrumb trail, page header, and site footer",
    category: "Marketing",
    prompt:
      "Documentation wiki page with a breadcrumb trail showing the page's location in the docs hierarchy, a page header with the article title, body content, and a site footer with links",
  },

  // Forms (continued)
  {
    id: "feature-flags-panel",
    title: "Feature Flags Panel",
    description: "Feature flag list with a master override toggle and autocomplete search",
    category: "Forms",
    prompt:
      "Feature flag management panel with a master override toggle to disable all flags at once, and an autocomplete search field for finding a specific flag by name",
  },
  {
    id: "inventory-editor",
    title: "Inventory Editor",
    description: "Stock levels editor with stepper-based quantity number inputs",
    category: "Forms",
    prompt:
      "Inventory management form listing products with stepper-based number inputs for adjusting stock quantity",
  },

  // Forms (continued)
  {
    id: "appointment-scheduler",
    title: "Appointment Scheduler",
    description: "Day tabs, a date field, and time-slot selection",
    category: "Forms",
    prompt:
      "Appointment scheduling flow with Tabs for the available days, an Input for jumping directly to a specific date, and a Select that lists the available time slots for the chosen day",
  },
  {
    id: "compact-toolbar",
    title: "Compact Toolbar",
    description: "Icon button actions, a searchable combobox, and a grouped filters accordion",
    category: "Forms",
    prompt:
      "Compact toolbar with icon buttons for quick actions, a combobox field for searching and selecting an item, and an accordion panel below for grouped advanced filter options",
  },
  {
    id: "secure-verification",
    title: "Secure Verification",
    description: "Two-factor sign-in step with a code entry field and a resend code link",
    category: "Forms",
    prompt:
      "Two-factor authentication verification screen with an Input for the 6-digit one-time passcode sent by SMS, plus a resend code Button and a Text countdown before it can be clicked again",
  },

  // Data Display (continued)
  {
    id: "restaurant-reservations-board",
    title: "Restaurant Reservations Board",
    description: "Table reservations across the day and a specials board",
    category: "Data Display",
    prompt:
      "Restaurant operations board showing a Table of reservations across the day broken out by table and time slot, alongside a Card listing today's specials",
  },
  {
    id: "metrics-ticker",
    title: "Metrics Ticker",
    description: "Odometer-style rolling counters next to a split-flap announcement display",
    category: "Data Display",
    prompt:
      "Live metrics ticker with odometer-style rolling digit counters showing real-time stats like active users and orders, and a split-flap display panel cycling through headline announcements",
  },

  // Feedback (continued)
  {
    id: "command-search-palette",
    title: "Command Search Palette",
    description: "Command search with a combobox and explanations for unavailable commands",
    category: "Feedback",
    prompt:
      "Command search Dialog for quickly jumping to actions and pages, with a Combobox of results, a Text description of each result, and a Badge plus note explaining why an unavailable command can't be run",
  },
  {
    id: "delete-confirmation-flow",
    title: "Delete Confirmation Flow",
    description:
      "Delete button disabled until acknowledged, then a confirmation dialog before removal",
    category: "Feedback",
    prompt:
      "Delete-item flow where the delete Button starts disabled with a Text hint explaining that you must check an acknowledgment Checkbox first, and once checked the button becomes enabled and opens a confirmation Dialog warning that the action is permanent before the item is actually removed",
  },

  // Data Display (continued)
  {
    id: "record-detail-panel",
    title: "Record Detail Panel",
    description:
      "Read-only record detail view pairing each field label with its value in a striped spec sheet",
    category: "Data Display",
    prompt:
      "Read-only record detail panel for a single reservation, showing its fields as a DataList of label-and-value pairs — guest name, party size, table, status, booking reference, and created date — laid out as a striped horizontal spec sheet beneath the record title",
  },

  // Feedback (continued)
  {
    id: "integration-handshake",
    title: "Integration Connection Status",
    description:
      "Connection status for a multi-party exchange, showing each station and its result",
    category: "Feedback",
    prompt:
      "Third-party integration connection screen listing the browser, the identity provider, and the API as named stations in a DataList, each with a Badge showing negotiating, settled, or failed, and an Alert summarising the overall connection state",
  },

  // Data Display (continued)
  {
    id: "row-actions-menu",
    title: "Row Actions Menu",
    description: "Data table with a per-row actions column of buttons",
    category: "Data Display",
    prompt:
      "Data table where each row has a trailing actions column of IconButtons for Edit, Duplicate, and Delete",
  },
  {
    id: "live-departures-board",
    title: "Live Departures Board",
    description:
      "Transit-style departures board cycling status announcements with mechanical flaps",
    category: "Data Display",
    prompt:
      "Live departures board for a transit terminal built from a DepartureBoard split-flap display that cycles through a sequence of short status announcements — boarding times, gate changes, and delay notices — styled like an airport or train station board with a mechanical flap animation between each line",
  },

  // Forms (continued)
  {
    id: "modal-form-dialog",
    title: "Modal Form Dialog",
    description:
      "Create-record form inside a modal dialog, with cancel and save actions in the footer",
    category: "Forms",
    prompt:
      "Create-a-new-guest flow where an Add Guest button opens a Dialog containing an editable form — name, email, phone, and a notes field — with Cancel and Save buttons in the dialog footer, the dialog title naming the record being created, and validation errors shown inline beneath each field while the dialog stays open",
  },

  // Data Display (continued)
  {
    id: "activity-log-panel",
    title: "Activity Log Panel",
    description: "Activity feed in a card listing recent events with timestamps",
    category: "Data Display",
    prompt:
      "Activity log panel showing a feed of recent events inside a Card, each entry a Text line with a Badge for the event type and a timestamp",
  },
] as const;

// ---------------------------------------------------------------------------
// Category badge variant mapping
// ---------------------------------------------------------------------------

const CATEGORY_VARIANT: Record<TemplateCategory, "neutral" | "accent" | "success" | "warning"> = {
  Dashboards: "accent",
  Forms: "success",
  "Data Display": "neutral",
  Marketing: "warning",
  Feedback: "accent",
};

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

export interface TemplateGalleryProps {
  open: boolean;
  onClose: () => void;
  onSelect: (prompt: string) => void;
}

// ---------------------------------------------------------------------------
// TemplateGallery component
// ---------------------------------------------------------------------------

export function TemplateGallery({ open, onClose, onSelect }: TemplateGalleryProps) {
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | "All">("All");
  const [search, setSearch] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Reset state and focus search when dialog opens.
  // setState in effect is intentional here — we reset local state when the
  // parent toggles `open` from false to true, which is the standard dialog
  // reset pattern (no way to hoist this to the parent).
  useEffect(() => {
    if (!open) return;
    setActiveCategory("All"); // eslint-disable-line react-hooks/set-state-in-effect
    setSearch("");
    const id = requestAnimationFrame(() => {
      searchRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Trap focus inside dialog
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener("keydown", trap);
    return () => document.removeEventListener("keydown", trap);
  }, [open]);

  // Filter templates by category and search
  const filteredTemplates = useMemo(() => {
    const searchLower = search.toLowerCase().trim();
    return TEMPLATES.filter((t) => {
      const matchesCategory = activeCategory === "All" || t.category === activeCategory;
      const matchesSearch =
        searchLower === "" ||
        t.title.toLowerCase().includes(searchLower) ||
        t.description.toLowerCase().includes(searchLower);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, search]);

  // Count templates per category
  const categoryCounts = useMemo(() => {
    const searchLower = search.toLowerCase().trim();
    const filtered =
      searchLower === ""
        ? TEMPLATES
        : TEMPLATES.filter(
            (t) =>
              t.title.toLowerCase().includes(searchLower) ||
              t.description.toLowerCase().includes(searchLower)
          );
    const counts: Record<string, number> = { All: filtered.length };
    for (const cat of ALL_CATEGORIES) {
      counts[cat] = filtered.filter((t) => t.category === cat).length;
    }
    return counts;
  }, [search]);

  const handleCardClick = useCallback(
    (prompt: string) => {
      onClose();
      onSelect(prompt);
    },
    [onClose, onSelect]
  );

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!open) return null;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- backdrop overlay; Escape key handled separately
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Template gallery"
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 className={styles.title}>Templates</h2>
            <Shortcut keys={shortcutKeys("templates")} className={styles.shortcutHint} />
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close template gallery"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>

        {/* Body: sidebar + main */}
        <div className={styles.body}>
          {/* Category sidebar */}
          <nav className={styles.sidebar} aria-label="Template categories">
            {(["All", ...ALL_CATEGORIES] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                className={`${styles.categoryButton} ${activeCategory === cat ? styles.categoryButtonActive : ""}`}
                onClick={() => setActiveCategory(cat)}
                aria-pressed={activeCategory === cat}
              >
                <span>{cat}</span>
                <span className={styles.categoryCount}>{categoryCounts[cat] ?? 0}</span>
              </button>
            ))}
          </nav>

          {/* Main content */}
          <div className={styles.main}>
            {/* Search */}
            <div className={styles.searchBar}>
              <input
                ref={searchRef}
                type="text"
                className={styles.searchInput}
                placeholder="Search templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search templates"
              />
            </div>

            {/* Template grid */}
            <div className={styles.templateGrid}>
              {filteredTemplates.length === 0 ? (
                <div className={styles.empty}>
                  <span className={styles.emptyIcon} aria-hidden="true">
                    &#128269;
                  </span>
                  <span className={styles.emptyText}>No templates match your search</span>
                </div>
              ) : (
                filteredTemplates.map((template, index) => (
                  <button
                    key={template.id}
                    type="button"
                    className={`${styles.card} ${styles.cardEnter}`}
                    style={{ animationDelay: `${index * 50}ms` }}
                    onClick={() => handleCardClick(template.prompt)}
                    aria-label={`Use ${template.title} template`}
                  >
                    <h3 className={styles.cardTitle}>{template.title}</h3>
                    <p className={styles.cardDescription}>{template.description}</p>
                    <div className={styles.cardFooter}>
                      <Badge variant={CATEGORY_VARIANT[template.category]} size="sm">
                        {template.category}
                      </Badge>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

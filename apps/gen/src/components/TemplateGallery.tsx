import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Badge, Shortcut } from "@mbe/rialto";
import styles from "./TemplateGallery.module.css";

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

type TemplateCategory = "Dashboards" | "Forms" | "Data Display" | "Marketing";

const ALL_CATEGORIES: readonly TemplateCategory[] = [
  "Dashboards",
  "Forms",
  "Data Display",
  "Marketing",
] as const;

// ---------------------------------------------------------------------------
// Template catalog
// ---------------------------------------------------------------------------

const TEMPLATES: readonly Template[] = [
  // Dashboards
  {
    id: "analytics-dashboard",
    title: "Analytics Dashboard",
    description: "KPI cards, line chart, bar chart, and recent activity table",
    category: "Dashboards",
    prompt:
      "Dashboard with KPI cards, line chart, bar chart, and recent activity table",
  },
  {
    id: "admin-dashboard",
    title: "Admin Dashboard",
    description: "User stats, system health indicators, and quick actions",
    category: "Dashboards",
    prompt:
      "Admin panel with user stats, system health indicators, and quick actions",
  },
  {
    id: "sales-dashboard",
    title: "Sales Dashboard",
    description: "Revenue chart, top products, and conversion funnel",
    category: "Dashboards",
    prompt:
      "Sales overview with revenue chart, top products, and conversion funnel",
  },

  // Forms
  {
    id: "registration-form",
    title: "Registration Form",
    description: "Multi-step registration with personal info, preferences, and confirmation",
    category: "Forms",
    prompt:
      "Multi-step registration with personal info, preferences, and confirmation",
  },
  {
    id: "checkout-form",
    title: "Checkout Form",
    description: "E-commerce checkout with shipping, payment, and order summary",
    category: "Forms",
    prompt:
      "E-commerce checkout with shipping, payment, and order summary",
  },
  {
    id: "survey-form",
    title: "Survey Form",
    description: "Customer feedback survey with rating scales, text areas, and progress bar",
    category: "Forms",
    prompt:
      "Customer feedback survey with rating scales, text areas, and progress bar",
  },

  // Data Display
  {
    id: "data-table",
    title: "Data Table",
    description: "Sortable, filterable data table with pagination, search, and bulk actions",
    category: "Data Display",
    prompt:
      "Sortable, filterable data table with pagination, search, and bulk actions",
  },
  {
    id: "kanban-board",
    title: "Kanban Board",
    description: "Project management board with draggable columns and task cards",
    category: "Data Display",
    prompt:
      "Project management board with draggable columns and task cards",
  },
  {
    id: "timeline",
    title: "Timeline",
    description: "Activity timeline with icons, timestamps, and expandable details",
    category: "Data Display",
    prompt:
      "Activity timeline with icons, timestamps, and expandable details",
  },

  // Marketing
  {
    id: "landing-page",
    title: "Landing Page",
    description: "SaaS landing page with hero, features grid, testimonials, and CTA",
    category: "Marketing",
    prompt:
      "SaaS landing page with hero, features grid, testimonials, and CTA",
  },
  {
    id: "pricing-page",
    title: "Pricing Page",
    description: "Pricing comparison table with three tiers and feature checklist",
    category: "Marketing",
    prompt:
      "Pricing comparison table with three tiers and feature checklist",
  },
  {
    id: "blog-layout",
    title: "Blog Layout",
    description: "Blog post layout with featured image, content, author bio, and related posts",
    category: "Marketing",
    prompt:
      "Blog post layout with featured image, content, author bio, and related posts",
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
            <Shortcut
              keys={[navigator.platform.includes("Mac") ? "\u2318" : "Ctrl", "T"]}
              className={styles.shortcutHint}
            />
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
            <div className={styles.grid}>
              {filteredTemplates.length === 0 ? (
                <div className={styles.empty}>
                  <span className={styles.emptyIcon} aria-hidden="true">
                    &#128269;
                  </span>
                  <span className={styles.emptyText}>
                    No templates match your search
                  </span>
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

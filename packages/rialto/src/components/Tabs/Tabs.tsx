import {
  forwardRef,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
  type HTMLAttributes,
  type KeyboardEvent,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { spring } from "../../tokens/motion";
import styles from "./Tabs.module.css";

/* ── Types ───────────────────────────────────── */

/**
 * Describes a single tab panel -- its trigger label, content, and optional disabled state.
 *
 * @example
 * const tab: Tab = {
 *   id: "overview",
 *   label: "Overview",
 *   content: <p>Overview content here.</p>,
 * };
 */
export interface Tab {
  id: string;
  label: string;
  disabled?: boolean;
  /** The panel content rendered when this tab is active. */
  content: ReactNode;
}

/**
 * Horizontal panel switcher with a spring-animated gold indicator.
 * Supports full keyboard navigation (Arrow keys, Home, End) per WAI-ARIA Tabs pattern.
 *
 * @example
 * <Tabs
 *   tabs={[
 *     { id: "one", label: "First", content: <p>One</p> },
 *     { id: "two", label: "Second", content: <p>Two</p> },
 *   ]}
 *   defaultTab="one"
 *   onTabChange={(id) => console.log(id)}
 * />
 */
export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  tabs: Tab[];
  /** Tab `id` to show on first render. Defaults to the first tab. */
  defaultTab?: string;
  onTabChange?: (tabId: string) => void;
}

/* ── Component ───────────────────────────────── */
export const Tabs = forwardRef<HTMLDivElement, TabsProps>(
  ({ tabs, defaultTab, onTabChange, className, ...props }, ref) => {
    const [activeId, setActiveId] = useState(defaultTab ?? tabs[0]?.id ?? "");
    const [indicator, setIndicator] = useState({ left: 0, width: 0 });
    const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const listRef = useRef<HTMLDivElement>(null);
    const shouldReduceMotion = useReducedMotion();

    const updateIndicator = useCallback(() => {
      const el = tabRefs.current.get(activeId);
      const list = listRef.current;
      if (!el || !list) return;
      const listRect = list.getBoundingClientRect();
      const tabRect = el.getBoundingClientRect();
      setIndicator({
        left: tabRect.left - listRect.left,
        width: tabRect.width,
      });
    }, [activeId]);

    useEffect(() => {
      updateIndicator();
      window.addEventListener("resize", updateIndicator);
      return () => window.removeEventListener("resize", updateIndicator);
    }, [updateIndicator]);

    const selectTab = (id: string) => {
      setActiveId(id);
      onTabChange?.(id);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      const enabledTabs = tabs.filter((t) => !t.disabled);
      const currentIndex = enabledTabs.findIndex((t) => t.id === activeId);
      let nextIndex: number;

      if (e.key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % enabledTabs.length;
      } else if (e.key === "ArrowLeft") {
        nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
      } else if (e.key === "Home") {
        nextIndex = 0;
      } else if (e.key === "End") {
        nextIndex = enabledTabs.length - 1;
      } else {
        return;
      }

      e.preventDefault();
      const nextTab = enabledTabs[nextIndex];
      if (nextTab) {
        selectTab(nextTab.id);
        tabRefs.current.get(nextTab.id)?.focus();
      }
    };

    const activeTab = tabs.find((t) => t.id === activeId);

    return (
      <div ref={ref} className={className} {...props}>
        <div
          ref={listRef}
          className={styles.tabList}
          role="tablist"
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.id, el);
                else tabRefs.current.delete(tab.id);
              }}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={tab.id === activeId}
              aria-controls={`panel-${tab.id}`}
              tabIndex={tab.id === activeId ? 0 : -1}
              aria-disabled={tab.disabled || undefined}
              className={[styles.tab, tab.id === activeId ? styles.tabActive : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={tab.disabled ? undefined : () => selectTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}

          {/* Sliding gold indicator */}
          <motion.div
            className={styles.indicator}
            animate={{
              left: indicator.left,
              width: indicator.width,
            }}
            transition={shouldReduceMotion ? { duration: 0 } : spring}
          />
        </div>

        {/* Active panel */}
        {activeTab && (
          <div
            key={activeTab.id}
            className={styles.panel}
            role="tabpanel"
            id={`panel-${activeTab.id}`}
            aria-labelledby={`tab-${activeTab.id}`}
          >
            {activeTab.content}
          </div>
        )}
      </div>
    );
  }
);

Tabs.displayName = "Tabs";

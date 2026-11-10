import {
  forwardRef,
  useId,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  type ReactNode,
  type HTMLAttributes,
  type KeyboardEvent,
} from "react";
import { motion } from "framer-motion";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { cn } from "../../utils/class-composer";
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
  (
    {
      tabs,
      defaultTab,
      onTabChange,
      className,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      ...props
    },
    ref
  ) => {
    const [activeId, setActiveId] = useState(defaultTab ?? tabs[0]?.id ?? "");
    const [indicator, setIndicator] = useState({ left: 0, width: 0 });
    const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
    const listRef = useRef<HTMLDivElement>(null);
    const motionPreset = useMotionPreset();
    const shouldReduceMotion = motionPreset.reduced;
    const baseId = useId();

    const tabSignature = tabs
      .map((tab) => `${tab.id}:${tab.label}:${tab.disabled ? 1 : 0}`)
      .join("|");

    // Layout offsets, not viewport coordinates. The indicator is positioned
    // inside the list, so a scrolled list would slide the underline off the
    // tab if we used the visual left edge.
    const revealActiveTabRef = useRef(false);

    const syncList = useCallback(() => {
      const list = listRef.current;
      const el = tabRefs.current.get(activeId);
      if (!list || !el) return;
      const overflowing = list.scrollWidth > list.clientWidth + 1;
      const next = overflowing ? "true" : "false";
      if (list.dataset.overflowing !== next) list.dataset.overflowing = next;
      if (revealActiveTabRef.current) {
        revealActiveTabRef.current = false;
        if (list.scrollWidth > list.clientWidth + 1) {
          el.scrollIntoView({ inline: "nearest", block: "nearest" });
        }
      }
      const left = el.offsetLeft;
      const width = el.offsetWidth;
      setIndicator((prev) => (prev.left === left && prev.width === width ? prev : { left, width }));
    }, [activeId]);

    useLayoutEffect(() => {
      syncList();
    }, [syncList, tabSignature]);

    useEffect(() => {
      const list = listRef.current;
      window.addEventListener("resize", syncList);
      const observer =
        typeof ResizeObserver === "undefined" || !list
          ? null
          : new ResizeObserver(() => {
              syncList();
            });
      if (list && observer) {
        observer.observe(list);
        for (const button of list.querySelectorAll("button")) observer.observe(button);
      }
      let cancelled = false;
      const fonts = document.fonts?.ready;
      if (fonts) {
        void fonts.then(
          () => {
            if (!cancelled) syncList();
          },
          () => undefined
        );
      }
      return () => {
        cancelled = true;
        window.removeEventListener("resize", syncList);
        observer?.disconnect();
      };
    }, [syncList, tabSignature]);

    const selectTab = (id: string) => {
      revealActiveTabRef.current = true;
      setActiveId(id);
      onTabChange?.(id);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      const enabledTabs = tabs.filter((t) => !t.disabled);
      // No match: the fallback tab stop is the first enabled item.
      const currentIndex = Math.max(
        0,
        enabledTabs.findIndex((t) => t.id === activeId)
      );
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
    // Roving tabindex needs exactly one stop: when the active id matches no tab,
    // fall back to the first enabled tab so the list stays keyboard reachable.
    const tabStopId = activeTab ? activeId : tabs.find((t) => !t.disabled)?.id;

    return (
      <div ref={ref} className={cn(styles.root, className)} {...props}>
        <div
          ref={listRef}
          className={styles.tabList}
          role="tablist"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
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
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={tab.id === activeId}
              aria-controls={tab.id === activeId ? `${baseId}-panel-${tab.id}` : undefined}
              tabIndex={tab.id === tabStopId ? 0 : -1}
              aria-disabled={tab.disabled || undefined}
              className={cn(styles.tab, tab.id === activeId && styles.tabActive)}
              onClick={tab.disabled ? undefined : () => selectTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}

          {/* Sliding gold indicator */}
          <motion.div
            layout={shouldReduceMotion ? false : true}
            className={styles.indicator}
            style={{ left: indicator.left, width: indicator.width }}
            transition={motionPreset.spring}
          />
        </div>

        {/* Active panel */}
        {activeTab && (
          <div
            key={activeTab.id}
            className={styles.panel}
            role="tabpanel"
            id={`${baseId}-panel-${activeTab.id}`}
            aria-labelledby={`${baseId}-tab-${activeTab.id}`}
          >
            {activeTab.content}
          </div>
        )}
      </div>
    );
  }
);

Tabs.displayName = "Tabs";

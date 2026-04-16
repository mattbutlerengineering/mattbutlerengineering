import { forwardRef, useState, useRef, useCallback, type ReactNode, type KeyboardEvent } from "react";
import { Collapsible } from "../Collapsible/Collapsible";
import styles from "./Accordion.module.css";

/* ── Types ───────────────────────────────────── */
/**
 * Descriptor for a single panel within an {@link Accordion}.
 *
 * @example
 * const item: AccordionItem = {
 *   id: "faq-1",
 *   title: "What is Rialto?",
 *   content: <Text>A premium design system.</Text>,
 * };
 */
export interface AccordionItem {
  id: string;
  title: string;
  content: ReactNode;
  disabled?: boolean;
}

/**
 * Grouped set of collapsible panels where one or many can be expanded at a time.
 *
 * By default only a single panel is open; set `multiple` to allow several.
 * Each panel delegates to {@link Collapsible} for animation and accessibility.
 *
 * @example
 * <Accordion
 *   items={[
 *     { id: "a", title: "Section A", content: <Text>Alpha</Text> },
 *     { id: "b", title: "Section B", content: <Text>Bravo</Text> },
 *   ]}
 *   defaultOpen={["a"]}
 * />
 */
export interface AccordionProps {
  items: AccordionItem[];
  /** Allow multiple items open at once */
  multiple?: boolean;
  defaultOpen?: string[];
  /** Heading level for triggers — provides document structure for screen readers (default h3) */
  headingLevel?: "h2" | "h3" | "h4" | "h5" | "h6";
  className?: string;
}

/* ── Component ───────────────────────────────── */
export const Accordion = forwardRef<HTMLDivElement, AccordionProps>(
  ({ items, multiple = false, defaultOpen = [], headingLevel = "h3", className }, ref) => {
    const [openIds, setOpenIds] = useState<Set<string>>(new Set(defaultOpen));
    const containerRef = useRef<HTMLDivElement | null>(null);

    const toggle = (id: string) => {
      setOpenIds((prev) => {
        const next = new Set(multiple ? prev : []);
        if (prev.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    };

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const triggers = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button[aria-expanded]")
      );
      const currentIndex = triggers.indexOf(e.target as HTMLButtonElement);
      if (currentIndex === -1) return;

      let target: HTMLButtonElement | undefined;
      switch (e.key) {
        case "ArrowDown":
          target = triggers[(currentIndex + 1) % triggers.length];
          break;
        case "ArrowUp":
          target = triggers[(currentIndex - 1 + triggers.length) % triggers.length];
          break;
        case "Home":
          target = triggers[0];
          break;
        case "End":
          target = triggers[triggers.length - 1];
          break;
        default:
          return;
      }

      e.preventDefault();
      target?.focus();
    }, []);

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        containerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      },
      [ref]
    );

    return (
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div
        ref={setRefs}
        className={[styles.accordion, className].filter(Boolean).join(" ")}
        onKeyDown={handleKeyDown}
      >
        {items.map((item) => (
          <Collapsible
            key={item.id}
            open={openIds.has(item.id)}
            onOpenChange={() => toggle(item.id)}
            trigger={item.title}
            disabled={item.disabled}
            headingTag={headingLevel}
            className={styles.item}
          >
            {item.content}
          </Collapsible>
        ))}
      </div>
    );
  }
);

Accordion.displayName = "Accordion";

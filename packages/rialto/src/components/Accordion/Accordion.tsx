import { forwardRef, useState, type ReactNode } from 'react';
import { Collapsible } from '../Collapsible/Collapsible';
import styles from './Accordion.module.css';

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
  className?: string;
}

/* ── Component ───────────────────────────────── */
export const Accordion = forwardRef<HTMLDivElement, AccordionProps>(
  ({ items, multiple = false, defaultOpen = [], className }, ref) => {
    const [openIds, setOpenIds] = useState<Set<string>>(new Set(defaultOpen));

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

    return (
      <div
        ref={ref}
        className={[styles.accordion, className].filter(Boolean).join(' ')}
      >
        {items.map((item) => (
          <Collapsible
            key={item.id}
            open={openIds.has(item.id)}
            onOpenChange={() => toggle(item.id)}
            trigger={item.title}
            disabled={item.disabled}
            className={styles.item}
          >
            {item.content}
          </Collapsible>
        ))}
      </div>
    );
  }
);

Accordion.displayName = 'Accordion';

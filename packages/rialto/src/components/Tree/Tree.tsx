import {
  forwardRef,
  useState,
  useCallback,
  useMemo,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { springGentle } from "../../tokens/motion";
import styles from "./Tree.module.css";

/**
 * A recursive node in a `Tree` hierarchy. Each node may contain nested `children` to form an expandable tree structure.
 *
 * @example
 * const node: TreeNode = {
 *   id: "chassis",
 *   label: "Chassis",
 *   children: [
 *     { id: "floor", label: "Floor" },
 *   ],
 * };
 */
export interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[];
  disabled?: boolean;
  icon?: ReactNode;
}

/**
 * An expandable tree view for navigating hierarchical data.
 * Supports both controlled and uncontrolled expansion; pass `expanded` and `onExpandedChange` for controlled mode, or `defaultExpanded` for uncontrolled.
 *
 * @example
 * <Tree
 *   data={[
 *     { id: "1", label: "Powertrain", children: [
 *       { id: "1a", label: "ICE" },
 *       { id: "1b", label: "MGU-K" },
 *     ]},
 *   ]}
 *   defaultExpanded={["1"]}
 *   onSelect={(node) => console.log(node.id)}
 * />
 */
export interface TreeProps extends Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> {
  data: TreeNode[];
  /** Node IDs to expand on first render (uncontrolled mode) */
  defaultExpanded?: string[];
  /** Controlled expanded node IDs -- overrides internal state when provided */
  expanded?: string[];
  onExpandedChange?: (expanded: string[]) => void;
  selectedId?: string | null;
  onSelect?: (node: TreeNode) => void;
  /** Set to `"none"` to disable selection entirely */
  selectionMode?: "single" | "none";
  /** Pixels of left padding added per nesting level (default 20) */
  indent?: number;
}

interface TreeItemProps {
  node: TreeNode;
  level: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onSelect: (node: TreeNode) => void;
  disabledIds: Set<string>;
  indent: number;
  focusedId: string | null;
  onFocusItem: (id: string) => void;
}

interface VisibleNode {
  node: TreeNode;
  parentId: string | null;
}

/* ── Helpers ──────────────────────────────────── */

function flattenVisible(
  nodes: TreeNode[],
  expanded: Set<string>,
  parentId: string | null = null
): VisibleNode[] {
  const result: VisibleNode[] = [];
  for (const node of nodes) {
    result.push({ node, parentId });
    if (node.children?.length && expanded.has(node.id)) {
      result.push(...flattenVisible(node.children, expanded, node.id));
    }
  }
  return result;
}

/* ── Chevron ──────────────────────────────────── */

function TreeChevron({ open }: { open: boolean }) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.svg
      className={styles.chevron}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      animate={{ rotate: open ? 90 : 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : springGentle}
    >
      <path d="M4 2l4 4-4 4" />
    </motion.svg>
  );
}

/* ── TreeItem ─────────────────────────────────── */

function TreeItem({
  node,
  level,
  expandedIds,
  onToggle,
  selectedId,
  onSelect,
  disabledIds,
  indent,
  focusedId,
  onFocusItem,
}: TreeItemProps) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const isDisabled = disabledIds.has(node.id);
  const isFocused = focusedId === node.id;

  const handleClick = () => {
    if (isDisabled || node.disabled) return;
    onFocusItem(node.id);
    onSelect(node);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      onToggle(node.id);
    }
  };

  const handleFocus = () => {
    onFocusItem(node.id);
  };

  // Roving tabindex: only the focused item (or first item if none focused)
  // has tabIndex={0}; all others have tabIndex={-1}
  const tabIndex = isFocused ? 0 : -1;

  return (
    <div className={styles.itemWrapper}>
      <button
        type="button"
        className={[
          styles.item,
          isSelected && styles.selected,
          (isDisabled || node.disabled) && styles.disabled,
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ paddingInlineStart: `${level * indent + 8}px` }}
        onClick={handleClick}
        onFocus={handleFocus}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-disabled={isDisabled || node.disabled}
        tabIndex={tabIndex}
        data-tree-id={node.id}
      >
        <span
          role="presentation"
          className={[styles.toggle, hasChildren && styles.toggleVisible].filter(Boolean).join(" ")}
          onClick={handleToggle}
        >
          {hasChildren && <TreeChevron open={isExpanded} />}
        </span>

        {node.icon && <span className={styles.icon}>{node.icon}</span>}

        <span className={styles.label}>{node.label}</span>
      </button>

      {hasChildren && isExpanded && (
        <div role="group">
          {node.children!.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              level={level + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelect={onSelect}
              disabledIds={disabledIds}
              indent={indent}
              focusedId={focusedId}
              onFocusItem={onFocusItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Tree ─────────────────────────────────────── */

export const Tree = forwardRef<HTMLDivElement, TreeProps>(
  (
    {
      data,
      defaultExpanded = [],
      expanded: controlledExpanded,
      onExpandedChange,
      selectedId: controlledSelectedId,
      onSelect,
      selectionMode = "single",
      indent = 20,
      className,
      ...props
    },
    ref
  ) => {
    const treeRef = useRef<HTMLDivElement | null>(null);
    const [internalExpanded, setInternalExpanded] = useState<Set<string>>(new Set(defaultExpanded));
    const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
    const [focusedId, setFocusedId] = useState<string | null>(null);
    const typeAheadRef = useRef("");
    const typeAheadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const expanded = useMemo(
      () => (controlledExpanded !== undefined ? new Set(controlledExpanded) : internalExpanded),
      [controlledExpanded, internalExpanded]
    );
    const selectedId =
      controlledSelectedId !== undefined ? controlledSelectedId : internalSelectedId;

    const visibleNodes = useMemo(() => flattenVisible(data, expanded), [data, expanded]);

    const handleToggle = useCallback(
      (id: string) => {
        const next = new Set(expanded);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }

        if (controlledExpanded === undefined) {
          setInternalExpanded(next);
        }
        onExpandedChange?.(Array.from(next));
      },
      [expanded, controlledExpanded, onExpandedChange]
    );

    const handleSelect = useCallback(
      (node: TreeNode) => {
        if (selectionMode === "none") return;

        if (controlledSelectedId === undefined) {
          setInternalSelectedId(node.id);
        }
        onSelect?.(node);
      },
      [selectionMode, controlledSelectedId, onSelect]
    );

    const focusNode = useCallback((id: string) => {
      setFocusedId(id);
      const el = treeRef.current?.querySelector(
        `[data-tree-id="${CSS.escape(id)}"]`
      ) as HTMLElement | null;
      el?.focus();
    }, []);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        // Find current position in visible list
        const activeId = focusedId ?? visibleNodes[0]?.node.id ?? null;
        if (!activeId) return;

        const currentIndex = visibleNodes.findIndex((v) => v.node.id === activeId);
        if (currentIndex === -1) return;

        const current = visibleNodes[currentIndex]!;

        switch (e.key) {
          case "ArrowDown": {
            e.preventDefault();
            const next = visibleNodes[currentIndex + 1];
            if (next) focusNode(next.node.id);
            break;
          }

          case "ArrowUp": {
            e.preventDefault();
            const prev = visibleNodes[currentIndex - 1];
            if (prev) focusNode(prev.node.id);
            break;
          }

          case "ArrowRight": {
            e.preventDefault();
            const { node } = current;
            const firstChild = node.children?.[0];
            if (node.children?.length) {
              if (!expanded.has(node.id)) {
                handleToggle(node.id);
              } else if (firstChild) {
                focusNode(firstChild.id);
              }
            }
            break;
          }

          case "ArrowLeft": {
            e.preventDefault();
            const { node } = current;
            if (node.children?.length && expanded.has(node.id)) {
              handleToggle(node.id);
            } else if (current.parentId) {
              focusNode(current.parentId);
            }
            break;
          }

          case "Home": {
            e.preventDefault();
            const first = visibleNodes[0];
            if (first) focusNode(first.node.id);
            break;
          }

          case "End": {
            e.preventDefault();
            const last = visibleNodes[visibleNodes.length - 1];
            if (last) focusNode(last.node.id);
            break;
          }

          case "Enter":
          case " ": {
            e.preventDefault();
            if (!current.node.disabled) {
              handleSelect(current.node);
              if (current.node.children?.length) {
                handleToggle(current.node.id);
              }
            }
            break;
          }

          default: {
            // Type-ahead: single character searches
            if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
              e.preventDefault();
              clearTimeout(typeAheadTimerRef.current);
              typeAheadRef.current += e.key.toLowerCase();

              const search = typeAheadRef.current;
              const startIdx = search.length === 1 ? currentIndex + 1 : currentIndex;
              const len = visibleNodes.length;

              for (let offset = 0; offset < len; offset++) {
                const idx = (startIdx + offset) % len;
                const entry = visibleNodes[idx]!;
                const label = entry.node.label.toLowerCase();
                if (label.startsWith(search) && !entry.node.disabled) {
                  focusNode(entry.node.id);
                  break;
                }
              }

              typeAheadTimerRef.current = setTimeout(() => {
                typeAheadRef.current = "";
              }, 500);
            }
            return;
          }
        }
      },
      [focusedId, visibleNodes, expanded, handleToggle, handleSelect, focusNode]
    );

    const disabledIds = useMemo(() => {
      const ids = new Set<string>();
      const walkTree = (nodes: TreeNode[]) => {
        for (const node of nodes) {
          if (node.disabled) ids.add(node.id);
          if (node.children) walkTree(node.children);
        }
      };
      walkTree(data);
      return ids;
    }, [data]);

    // Determine the item that should be tabbable (roving tabindex).
    // If nothing is focused yet, the selected item or first item gets tabIndex=0.
    const effectiveFocusedId = focusedId ?? selectedId ?? visibleNodes[0]?.node.id ?? null;

    return (
      <div
        ref={(node) => {
          treeRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        className={[styles.tree, className].filter(Boolean).join(" ")}
        role="tree"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        {...props}
      >
        {data.map((node) => (
          <TreeItem
            key={node.id}
            node={node}
            level={0}
            expandedIds={expanded}
            onToggle={handleToggle}
            selectedId={selectedId}
            onSelect={handleSelect}
            disabledIds={disabledIds}
            indent={indent}
            focusedId={effectiveFocusedId}
            onFocusItem={setFocusedId}
          />
        ))}
      </div>
    );
  }
);

Tree.displayName = "Tree";

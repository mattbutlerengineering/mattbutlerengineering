import { JSONUIProvider, Renderer } from "@json-render/react";
import type { Spec } from "@json-render/react";
import { useMemo, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { registry } from "@mbe/rialto-catalog";
import {
  NodeSelectionContext,
  createSelectableRegistry,
  stampNodeKeys,
} from "./selectable-registry.js";
import { DialogControlProvider, createInteractiveRegistry } from "./dialog-registry.js";
import { normalizeGeneratedSpec } from "../lib/normalize-generated-spec.js";

export interface SpecProviderProps {
  children: ReactNode;
}

/** JSONUIProvider bound to the Rialto catalog registry. */
export function SpecProvider({ children }: SpecProviderProps) {
  return <JSONUIProvider registry={registry}>{children}</JSONUIProvider>;
}

export interface SpecRendererProps {
  spec: Spec | null;
  loading?: boolean;
  /** Opt-in: tag nodes with `data-gen-node` and let the user pick one. Off by default. */
  selectable?: boolean;
  selectedKey?: string | null;
  /** Briefly outlines the subtree at this key (a refinement just changed it). */
  changedKey?: string | null;
  onSelect?: (key: string | null) => void;
  /** Class for the selectable wrapper (carries the selection outline styles). */
  selectableClassName?: string;
}

/** json-render Renderer bound to the Rialto catalog registry. */
export function SpecRenderer({
  spec,
  loading = false,
  selectable = false,
  selectedKey = null,
  changedKey = null,
  onSelect,
  selectableClassName,
}: SpecRendererProps) {
  const activeRegistry = useMemo(() => {
    const interactive = createInteractiveRegistry(registry);
    return selectable ? createSelectableRegistry(interactive) : interactive;
  }, [selectable]);
  const activeSpec = useMemo(() => {
    if (!spec) return spec;
    return stampNodeKeys(normalizeGeneratedSpec(spec));
  }, [spec]);
  const [cursor, setCursor] = useState<{ spec: Spec | null; key: string | null }>({
    spec,
    key: null,
  });
  // A cursor on a previous spec's node is meaningless; derive it away at render time.
  const cursorKey = cursor.spec === spec ? cursor.key : null;

  const renderer = (
    <DialogControlProvider spec={activeSpec}>
      <Renderer spec={activeSpec} registry={activeRegistry} loading={loading} />
    </DialogControlProvider>
  );
  if (!selectable) return renderer;

  function nodeKeys(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll<HTMLElement>("[data-gen-node]")).map(
      (node) => node.dataset.genNode ?? ""
    );
  }

  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    // Select mode owns the pointer: the underlying component must not act.
    event.preventDefault();
    event.stopPropagation();
    const node = (event.target as HTMLElement).closest<HTMLElement>("[data-gen-node]");
    if (node?.dataset.genNode) onSelect?.(node.dataset.genNode);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const keys = nodeKeys(event.currentTarget);
    const index = cursorKey === null ? -1 : keys.indexOf(cursorKey);
    const forward =
      event.key === "ArrowDown" ||
      event.key === "ArrowRight" ||
      (event.key === "Tab" && !event.shiftKey);
    const backward =
      event.key === "ArrowUp" ||
      event.key === "ArrowLeft" ||
      (event.key === "Tab" && event.shiftKey);
    if (forward || backward) {
      const next = index + (forward ? 1 : -1);
      // Let Tab leave the overlay at either end instead of trapping focus.
      if (next < 0 || next >= keys.length) {
        if (event.key !== "Tab") event.preventDefault();
        return;
      }
      event.preventDefault();
      setCursor({ spec, key: keys[next] ?? null });
    } else if (event.key === "Enter" && cursorKey !== null) {
      event.preventDefault();
      onSelect?.(cursorKey);
    } else if (event.key === "Escape" && selectedKey !== null) {
      event.preventDefault();
      event.stopPropagation();
      onSelect?.(null);
    }
  }

  return (
    <NodeSelectionContext value={{ selectedKey, cursorKey, changedKey }}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- select-mode overlay: one focus stop that owns arrow/Enter/Escape for the rendered nodes */}
      <div
        className={selectableClassName}
        role="group"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the overlay is the single focus stop for select mode
        tabIndex={0}
        aria-label="Select component"
        onClickCapture={handleClickCapture}
        onKeyDown={handleKeyDown}
      >
        {renderer}
      </div>
    </NodeSelectionContext>
  );
}

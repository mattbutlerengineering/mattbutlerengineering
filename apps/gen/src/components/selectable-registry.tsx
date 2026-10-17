import { createContext, use } from "react";
import type { ComponentRegistry, ComponentRenderProps, Spec } from "@json-render/react";
import type { ReactNode } from "react";

export interface NodeSelection {
  /** Spec key of the committed selection. */
  selectedKey: string | null;
  /** Spec key the keyboard cursor is on (not yet committed with Enter). */
  cursorKey: string | null;
  /** Spec key of the subtree a refinement just changed. */
  changedKey?: string | null;
}

export const NodeSelectionContext = createContext<NodeSelection>({
  selectedKey: null,
  cursorKey: null,
});

const GEN_KEY = "genKey";

type KeyedElement = ComponentRenderProps["element"] & { [GEN_KEY]?: string };

/**
 * Stamps each element with its spec key. json-render hands components a
 * shallow copy (`{ ...element, props }`) whenever props hold expressions, so
 * identity matching is unreliable; an own field survives the copy.
 */
export function stampNodeKeys(spec: Spec): Spec {
  return {
    ...spec,
    elements: Object.fromEntries(
      Object.entries(spec.elements).map(([key, element]) => [key, { ...element, [GEN_KEY]: key }])
    ),
  };
}

function SelectableNode({ nodeKey, children }: { nodeKey: string; children: ReactNode }) {
  const { selectedKey, cursorKey, changedKey } = use(NodeSelectionContext);
  return (
    <div
      data-gen-node={nodeKey}
      data-selected={selectedKey === nodeKey ? "true" : undefined}
      data-cursor={cursorKey === nodeKey ? "true" : undefined}
      data-changed={changedKey === nodeKey ? "true" : undefined}
    >
      {children}
    </div>
  );
}

/**
 * Wraps every renderer in `registry` so its output carries
 * `data-gen-node="<spec key>"` (the spec must go through stampNodeKeys). Selection
 * state flows through NodeSelectionContext so selecting never remounts nodes.
 */
export function createSelectableRegistry(registry: ComponentRegistry): ComponentRegistry {
  return Object.fromEntries(
    Object.entries(registry).map(([type, Component]) => {
      function Selectable(props: ComponentRenderProps) {
        const nodeKey = (props.element as KeyedElement)[GEN_KEY] ?? null;
        const rendered = <Component {...props} />;
        return nodeKey === null ? (
          rendered
        ) : (
          <SelectableNode nodeKey={nodeKey}>{rendered}</SelectableNode>
        );
      }
      Selectable.displayName = `Selectable(${type})`;
      return [type, Selectable];
    })
  );
}

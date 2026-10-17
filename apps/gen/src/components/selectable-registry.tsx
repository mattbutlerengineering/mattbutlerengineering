import { createContext, use } from "react";
import type { ComponentRegistry, ComponentRenderProps, Spec } from "@json-render/react";
import type { ReactNode } from "react";

export interface NodeSelection {
  /** Spec key of the committed selection. */
  selectedKey: string | null;
  /** Spec key the keyboard cursor is on (not yet committed with Enter). */
  cursorKey: string | null;
}

export const NodeSelectionContext = createContext<NodeSelection>({
  selectedKey: null,
  cursorKey: null,
});

/**
 * Resolves the spec key of a rendered element. json-render passes the element
 * object (a shallow copy when props contained expressions), so match by
 * identity, then by shared `children` array, then by a unique type.
 */
export function resolveNodeKey(
  spec: Spec,
  element: ComponentRenderProps["element"]
): string | null {
  const entries = Object.entries(spec.elements);
  const byIdentity = entries.find(([, candidate]) => candidate === element);
  if (byIdentity) return byIdentity[0];
  const byChildren = entries.find(
    ([, candidate]) =>
      candidate.type === element.type &&
      candidate.children !== undefined &&
      candidate.children === element.children
  );
  if (byChildren) return byChildren[0];
  const byType = entries.filter(([, candidate]) => candidate.type === element.type);
  return byType.length === 1 ? byType[0]![0] : null;
}

function SelectableNode({ nodeKey, children }: { nodeKey: string; children: ReactNode }) {
  const { selectedKey, cursorKey } = use(NodeSelectionContext);
  return (
    <div
      data-gen-node={nodeKey}
      data-selected={selectedKey === nodeKey ? "true" : undefined}
      data-cursor={cursorKey === nodeKey ? "true" : undefined}
    >
      {children}
    </div>
  );
}

/**
 * Wraps every renderer in `registry` so its output carries
 * `data-gen-node="<spec key>"`. The registry is rebuilt per spec; selection
 * state flows through NodeSelectionContext so selecting never remounts nodes.
 */
export function createSelectableRegistry(
  registry: ComponentRegistry,
  spec: Spec
): ComponentRegistry {
  return Object.fromEntries(
    Object.entries(registry).map(([type, Component]) => {
      function Selectable(props: ComponentRenderProps) {
        const nodeKey = resolveNodeKey(spec, props.element);
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

import type { Spec } from "@json-render/react";
import { Button, Text } from "@mattbutlerengineering/rialto";
import { catalog } from "@mbe/rialto-catalog/catalog";
import { ancestorChain, subtreeKeys } from "../lib/spec-subtree.js";
import styles from "./NodeInspector.module.css";

export interface NodeInspectorProps {
  spec: Spec;
  /** Spec key of the selected node. */
  selectedKey: string;
  /** Called with an ancestor's key when its breadcrumb item is clicked. */
  onSelectNode: (key: string) => void;
}

/** Read-only details of the node picked in the preview: type, description, props, size, ancestry. */
export function NodeInspector({ spec, selectedKey, onSelectNode }: NodeInspectorProps) {
  const element = spec.elements[selectedKey];
  if (!element) return null;

  const definition = (
    catalog.data.components as Record<string, { description?: string } | undefined>
  )[element.type];
  const ancestors = ancestorChain(spec, selectedKey);
  const childCount = element.children?.length ?? 0;
  const subtreeSize = subtreeKeys(spec, selectedKey).length;

  return (
    <aside className={styles.panel} aria-label="Selected component">
      {ancestors.length > 0 && (
        <nav className={styles.breadcrumb} aria-label="Component ancestry">
          {ancestors.map((ancestor) => (
            <Button
              key={ancestor.key}
              variant="ghost"
              size="sm"
              onClick={() => onSelectNode(ancestor.key)}
            >
              {ancestor.type || ancestor.key}
            </Button>
          ))}
        </nav>
      )}
      <Text variant="label">{element.type}</Text>
      <Text variant="caption" color="tertiary">
        {selectedKey}
      </Text>
      <Text variant="body" color="secondary">
        {definition ? (definition.description ?? "No description.") : "Not in catalog."}
      </Text>
      <Text variant="caption" color="tertiary">
        {childCount} direct {childCount === 1 ? "child" : "children"} · {subtreeSize} in subtree
      </Text>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard reachable */}
      <pre className={styles.props} tabIndex={0} aria-label="Props">
        {JSON.stringify(element.props ?? {}, null, 2)}
      </pre>
    </aside>
  );
}

import { useState } from "react";
import type { Spec } from "@json-render/react";
import { Button, Input, Text } from "@mattbutlerengineering/rialto";
import { catalog } from "@mbe/rialto-catalog/catalog";
import { ancestorChain, subtreeKeys } from "../lib/spec-subtree.js";
import type { SpecDiff } from "../lib/spec-subtree.js";
import { specStats } from "../lib/spec.js";
import styles from "./NodeInspector.module.css";

export interface NodeInspectorProps {
  spec: Spec;
  /** Spec key of the selected node. */
  selectedKey: string;
  /** Called with an ancestor's key when its breadcrumb item is clicked. */
  onSelectNode: (key: string) => void;
  /** Called with the selected key and the user's change request; omit to hide the refine form. */
  onRefineNode?: (key: string, instruction: string) => void;
  /** Disables the refine form while a generation is streaming. */
  isBusy?: boolean;
  /** The refinement just applied, undone or redone; lists the component types it added and removed. */
  change?: SpecDiff | null;
}

function typeDelta(change: SpecDiff): { added: string[]; removed: string[] } {
  const before = new Set(specStats(change.before)?.componentTypes ?? []);
  const after = new Set(specStats(change.after)?.componentTypes ?? []);
  return {
    added: [...after].filter((type) => !before.has(type)),
    removed: [...before].filter((type) => !after.has(type)),
  };
}

/** Read-only details of the node picked in the preview: type, description, props, size, ancestry. */
export function NodeInspector({
  spec,
  selectedKey,
  onSelectNode,
  onRefineNode,
  isBusy = false,
  change = null,
}: NodeInspectorProps) {
  const [instruction, setInstruction] = useState("");
  const element = spec.elements[selectedKey];
  if (!element) return null;

  const definition = (
    catalog.data.components as Record<string, { description?: string } | undefined>
  )[element.type];
  const ancestors = ancestorChain(spec, selectedKey);
  const childCount = element.children?.length ?? 0;
  const subtreeSize = subtreeKeys(spec, selectedKey).length;
  const delta = change ? typeDelta(change) : null;

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
      {delta && delta.added.length > 0 && (
        <Text variant="caption" color="secondary">
          {`Added: ${delta.added.sort().join(", ")}`}
        </Text>
      )}
      {delta && delta.removed.length > 0 && (
        <Text variant="caption" color="secondary">
          {`Removed: ${delta.removed.sort().join(", ")}`}
        </Text>
      )}
      {onRefineNode && (
        <form
          className={styles.refine}
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = instruction.trim();
            if (!trimmed || isBusy) return;
            onRefineNode(selectedKey, trimmed);
            setInstruction("");
          }}
        >
          <Input
            label="Change this component"
            placeholder="e.g. make this a 3-column grid"
            value={instruction}
            disabled={isBusy}
            onChange={(event) => setInstruction(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={isBusy || instruction.trim() === ""}>
            Refine
          </Button>
        </form>
      )}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard reachable */}
      <pre className={styles.props} tabIndex={0} aria-label="Props">
        {JSON.stringify(element.props ?? {}, null, 2)}
      </pre>
    </aside>
  );
}

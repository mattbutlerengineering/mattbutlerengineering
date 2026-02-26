# Data Structure Components

Components for hierarchical and complex data structures.

## Quick Reference {#quick-reference}

| Need                 | Component |
| -------------------- | --------- |
| Expandable hierarchy | `Tree`    |

---

## Tree {#tree}

Hierarchical data display with expand/collapse.

### When to Use {#tree-when-to-use}

- File system browsers
- Organizational charts
- Nested categories
- Configuration trees
- Directory structures

### When NOT to Use {#tree-when-not-to-use}

- Flat lists → Use `Stack`
- Simple navigation → Use `Sidebar` or `Breadcrumb`

### Props {#tree-props}

| Prop               | Type                       | Required | Default    | Description            |
| ------------------ | -------------------------- | -------- | ---------- | ---------------------- |
| `data`             | `TreeNode[]`               | Yes      | -          | Tree data              |
| `defaultExpanded`  | `string[]`                 | No       | `[]`       | Initially expanded IDs |
| `expanded`         | `string[]`                 | No       | -          | Controlled expanded    |
| `onExpandedChange` | `(ids: string[]) => void`  | No       | -          | Expansion handler      |
| `selectedId`       | `string`                   | No       | -          | Selected node ID       |
| `onSelect`         | `(node: TreeNode) => void` | No       | -          | Selection handler      |
| `selectionMode`    | `'single' \| 'none'`       | No       | `'single'` | Selection type         |
| `indent`           | `number`                   | No       | `20`       | Pixels per level       |

### Data Structure {#tree-data-structure}

```typescript
interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[];
  disabled?: boolean;
  icon?: ReactNode;
}
```

### States {#tree-states}

- **Default**: Normal appearance
- **Expanded**: Children visible
- **Collapsed**: Children hidden
- **Selected**: Gold accent
- **Disabled**: Greyed out, non-interactive

### Accessibility {#tree-accessibility}

- Arrow keys navigate between items
- Enter selects focused item
- Space toggles expansion
- `role="tree"`, `role="treeitem"`
- `aria-expanded`, `aria-selected`

### Animation {#tree-animation}

- Chevron rotates with spring animation
- Respects `prefers-reduced-motion`

### Related {#tree-related}

- `Sidebar` — Navigation tree
- `Accordion` — Content sections
- `File tree` — Use for file browsers

### Example {#tree-example}

```tsx
<Tree
  data={[
    {
      id: 'src',
      label: 'src',
      children: [
        { id: 'components', label: 'components' },
        { id: 'utils', label: 'utils' },
        { id: 'App.tsx', label: 'App.tsx' },
      ],
    },
    { id: 'package.json', label: 'package.json' },
  ]}
  defaultExpanded={['src']}
  onSelect={(node) => console.log(node.label)}
/>
```

### With Icons {#tree-with-icons}

```tsx
<Tree
  data={[
    {
      id: 'folder',
      label: 'Documents',
      icon: <FolderIcon />,
      children: [{ id: 'file1', label: 'Report.pdf', icon: <PDFIcon /> }],
    },
  ]}
/>
```

### Controlled Mode {#tree-controlled-mode}

```tsx
const [expanded, setExpanded] = useState(['root']);
const [selected, setSelected] = useState<string | null>(null);

<Tree
  data={treeData}
  expanded={expanded}
  onExpandedChange={setExpanded}
  selectedId={selected}
  onSelect={(node) => setSelected(node.id)}
/>;
```

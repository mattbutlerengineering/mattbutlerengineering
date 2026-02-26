# Navigation Components — Quick Reference

Choosing the right component for moving between views and content.

---

## Decision Tree

```
What are you navigating?
├── Between pages/routes ──────────────────── Navbar, Sidebar, or NavigationMenu
│   ├── Top-level app navigation ──────────── Navbar
│   ├── Persistent side panel ─────────────── Sidebar
│   └── Header with dropdowns ─────────────── NavigationMenu
│
├── Within a page ─────────────────────────── Tabs, Breadcrumb, or Steps
│   ├── Switching content panels ──────────── Tabs
│   ├── Showing location in hierarchy ─────── Breadcrumb
│   └── Sequential workflow ───────────────── Steps
│
├── Through a list ────────────────────────── Pagination
│
├── Through a hierarchy ───────────────────── Tree or Sidebar
│   ├── File/folder browsing ──────────────── Tree
│   └── Section navigation ───────────────── Sidebar
│
└── Quick jump to action ──────────────────── CommandPalette
```

---

## Comparison Table

| Component          | Scope       | Position         | Best for                            |
| ------------------ | ----------- | ---------------- | ----------------------------------- |
| **Navbar**         | App-wide    | Top, fixed       | Primary app navigation              |
| **Sidebar**        | App/section | Left, persistent | Deep hierarchies, settings          |
| **NavigationMenu** | App-wide    | Top, inline      | Header nav with dropdown panels     |
| **Tabs**           | In-page     | Inline           | Content panel switching             |
| **Breadcrumb**     | In-page     | Top of content   | Location awareness, back navigation |
| **Steps**          | In-page     | Top or side      | Multi-step workflows                |
| **Pagination**     | In-page     | Bottom           | Paged data sets                     |
| **Tree**           | In-page     | Side or inline   | Hierarchical data browsing          |
| **CommandPalette** | App-wide    | Overlay (Cmd+K)  | Quick keyboard-driven navigation    |

---

## Common Patterns

### App shell navigation

```
Navbar (top) + Sidebar (left) + Breadcrumb (content header)
```

### Content page

```
Breadcrumb (top) + Tabs (content sections) + Pagination (bottom)
```

### Multi-step form

```
Steps (top) + form content + Button (next/back)
```

### Data explorer

```
Sidebar or Tree (left) + Table + Pagination (bottom)
```

---

## Common Mistakes

| Mistake                   | Better approach                               |
| ------------------------- | --------------------------------------------- |
| Tabs for sequential flow  | Steps — shows progress and order              |
| Breadcrumb as primary nav | Navbar or Sidebar — breadcrumbs are secondary |
| Sidebar with 3 items      | Tabs or NavigationMenu — sidebar needs depth  |
| Pagination for <20 items  | Show all items — pagination adds friction     |

---

## Accessibility Notes

- **Navbar/Sidebar**: Use `<nav>` with `aria-label` to distinguish multiple navs
- **Tabs**: `role="tablist"`, arrow keys between tabs, tab panels linked via `aria-controls`
- **Breadcrumb**: `<nav aria-label="Breadcrumb">`, `aria-current="page"` on last item
- **Steps**: Announce current step and total (`Step 2 of 4`)
- **Pagination**: `aria-label="Pagination"`, `aria-current="page"` on active page
- **Tree**: `role="tree"`, arrow keys navigate, Enter selects, Space toggles expansion

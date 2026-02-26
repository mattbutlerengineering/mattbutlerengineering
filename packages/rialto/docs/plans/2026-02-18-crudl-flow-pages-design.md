# CRUDL Flow Pages — Design

## Overview

Five interactive showcase pages demonstrating Create, Read, Update, Delete, and List operations using Rialto components. All pages manage a shared "Drivers" entity in a motorsport domain, consistent with the existing Dashboard page.

## Data Model

```typescript
interface Driver {
  id: string;
  name: string;
  number: number;
  team: string;
  nationality: string;
  status: "active" | "reserve" | "retired";
  points: number;
  wins: number;
  podiums: number;
  avatar?: string;
}
```

Pre-seeded with ~8 F1 drivers.

## Shared State

`DriverProvider` React context using `useState`. Wraps CRUDL routes in `main.tsx`.

Exposes: `drivers`, `addDriver(driver)`, `updateDriver(id, partial)`, `deleteDriver(id)`, `getDriver(id)`.

No external dependencies. Resets on page refresh.

## Pages

### List — `/drivers`

Dark header + light content. Table with search (Input), team/status filters (Select, Tag), pagination. Shows Skeleton loading, EmptyState when empty, populated table.

**Components**: Table, Pagination, Input, Select, Tag, Badge, Button, EmptyState, Breadcrumb, Skeleton

### Create — `/drivers/new`

Dark header + centered form Card. Fields: name (Input), number (NumberInput), team (Select), nationality (Input), status (RadioGroup). Inline validation + Alert on error. Toast on success, redirects to Read page.

**Components**: Input, Select, NumberInput, Radio, Button, Alert, Toast, Card, Breadcrumb

### Read — `/drivers/:id`

Dark header + detail layout. Avatar with initials, DataList for profile fields, Stat row for points/wins/podiums, Badge for status, Timeline for mock career events. Edit and Delete buttons. 404 EmptyState if not found.

**Components**: Avatar, DataList, Stat, Badge, Card, Timeline, Button, Breadcrumb, EmptyState, Skeleton

### Update — `/drivers/:id/edit`

Same form as Create but pre-filled. Tracks dirty state. ConfirmDialog on navigate-away if unsaved. Toast on save, redirects to Read page.

**Components**: Input, Select, NumberInput, Radio, Button, Alert, Toast, Card, ConfirmDialog, Breadcrumb

### Delete — via ConfirmDialog from Read/List

Not a separate page. ConfirmDialog with `variant="danger"` triggered from Read or List. On confirm, removes driver, shows Toast with undo action, navigates to List.

**Components**: ConfirmDialog, Toast, Button

## Navigation Flow

```
List → Create → (success) → Read
  │                           │
  └→ Read → Update → (save) → Read
      │
      └→ Delete (ConfirmDialog) → List + undo Toast
```

## Layout Pattern

All pages follow the Dashboard pattern:

- Dark header: `darkSurface` + atmosphere/grain, Breadcrumb, title
- Light content: max-width 1200px, `--rialto-surface` background
- Footer: "Back to Design System" link

## States Demonstrated

- **Loading**: Skeleton placeholders (simulated 500ms delay)
- **Empty**: EmptyState with action button
- **Populated**: Full data display
- **Error**: Inline validation, Alert banners
- **Success**: Toast notifications

## File Structure

```
src/pages/drivers/
├── DriverProvider.tsx      # Shared context + mock data
├── DriverLayout.tsx        # Shared dark header + footer layout
├── DriverLayout.module.css
├── DriverList.tsx          # List page
├── DriverList.module.css
├── DriverCreate.tsx        # Create page
├── DriverForm.module.css   # Shared form styles (Create + Update)
├── DriverRead.tsx          # Read/detail page
├── DriverRead.module.css
├── DriverUpdate.tsx        # Update page
└── index.ts                # Re-exports
```

Routes added to `main.tsx`:

```tsx
<Route element={<DriverProvider />}>
  <Route path="/drivers" element={<DriverList />} />
  <Route path="/drivers/new" element={<DriverCreate />} />
  <Route path="/drivers/:id" element={<DriverRead />} />
  <Route path="/drivers/:id/edit" element={<DriverUpdate />} />
</Route>
```

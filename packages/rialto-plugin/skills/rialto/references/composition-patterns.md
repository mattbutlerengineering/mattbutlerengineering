# Composition Patterns

How Rialto components compose together for common UI patterns.

---

## Required Wrappers

Always wrap your app root with these providers:

```tsx
import { RialtoProvider, ToastProvider } from "rialto";
import "rialto/tokens";

function App() {
  return (
    <RialtoProvider vibe="default" theme="system">
      <ToastProvider>
        <Router />
      </ToastProvider>
    </RialtoProvider>
  );
}
```

- **RialtoProvider** — provides device context (`useUIEnvironment`), vibe tokens, theme
  - Vibes: `"default"` | `"transacting"` (tighter, sharper) | `"presenting"` (more whitespace, larger type)
- **ToastProvider** — required ancestor for `useToast()` hook

---

## Canonical Pairs

These components are designed to work together:

| Primary | Companion           | Usage                 |
| ------- | ------------------- | --------------------- |
| Table   | Pagination          | Paginated data tables |
| Card    | Stack               | Card content layout   |
| Dialog  | Stack + form inputs | Modal forms           |
| Drawer  | Stack + controls    | Settings panels       |
| Input   | Alert (error)       | Form validation       |
| Button  | ConfirmDialog       | Destructive actions   |
| Tag     | TagGroup            | Filter chips, labels  |
| Avatar  | AvatarGroup         | User lists            |

---

## Login Form

```tsx
<Card title="Sign in">
  <Stack direction="column" gap="md">
    <Input label="Email" type="email" placeholder="you@example.com" />
    <Input label="Password" type="password" />
    <Stack direction="row" gap="sm" align="center" justify="between">
      <Checkbox label="Remember me" />
      <Button variant="ghost" size="sm">
        Forgot password?
      </Button>
    </Stack>
    <Button variant="primary">Sign in</Button>
  </Stack>
</Card>
```

---

## Settings Panel

```tsx
<Drawer open={isOpen} onOpenChange={setOpen} title="Settings" placement="right">
  <Stack direction="column" gap="lg">
    <Toggle label="Dark mode" checked={dark} onCheckedChange={setDark} />
    <Toggle label="Notifications" checked={notifs} onCheckedChange={setNotifs} />
    <Divider />
    <Select
      label="Language"
      options={[
        { value: "en", label: "English" },
        { value: "fr", label: "French" },
      ]}
    />
    <Divider />
    <Button variant="primary">Save changes</Button>
  </Stack>
</Drawer>
```

---

## Confirmation Flow

```tsx
<ConfirmDialog
  open={showConfirm}
  onOpenChange={setShowConfirm}
  title="Delete project?"
  description="This action cannot be undone. All data will be permanently removed."
  confirmLabel="Delete"
  variant="danger"
/>
```

Always use ConfirmDialog (not Dialog) for destructive yes/no confirmations.

---

## Data Table Page

```tsx
<Stack direction="column" gap="lg">
  <Stack direction="row" gap="sm" align="center" justify="between">
    <Input label="Search" placeholder="Search users..." />
    <Button variant="primary">Add User</Button>
  </Stack>
  <Table
    columns={[
      { key: "name", header: "Name", sortable: true },
      { key: "role", header: "Role" },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <Badge variant={row.active ? "success" : "neutral"}>
            {row.active ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ]}
    data={users}
    rowKey={(u) => u.id}
    striped
    emptyMessage="No users found"
  />
  <Pagination page={page} totalPages={totalPages} onChange={setPage} />
</Stack>
```

---

## Toast Notifications

```tsx
// 1. Wrap app with ToastProvider (once, at root):
<ToastProvider>
  <App />
</ToastProvider>;

// 2. Use the hook anywhere inside the provider:
function SaveButton() {
  const { toast } = useToast();
  return <Button onClick={() => toast({ title: "Saved!", variant: "success" })}>Save</Button>;
}
```

Toast variants: `"default"` | `"success"` | `"error"`

---

## Form with Validation

```tsx
<Stack direction="column" gap="md">
  {errors.length > 0 && (
    <Alert variant="error" title="Please fix the following:">
      <ul style={{ margin: 0, paddingLeft: "var(--rialto-space-md)" }}>
        {errors.map((err) => (
          <li key={err}>{err}</li>
        ))}
      </ul>
    </Alert>
  )}
  <Input label="Name" value={name} onChange={handleName} error={nameError} required />
  <Select label="Team" value={team} onChange={setTeam} options={teamOptions} />
  <Stack direction="row" gap="sm" justify="end">
    <Button variant="secondary" onClick={onCancel}>
      Cancel
    </Button>
    <Button variant="primary" onClick={handleSubmit}>
      Save
    </Button>
  </Stack>
</Stack>
```

---

## Layout Recipes

### Page with header

```tsx
<Stack direction="column" gap="lg">
  <Breadcrumb
    items={[{ label: "Home", href: "/" }, { label: "Users", href: "/users" }, { label: "Details" }]}
  />
  <Text variant="display" as="h1">
    User Details
  </Text>
  {/* page content */}
</Stack>
```

### Tabbed content

```tsx
<Stack direction="column" gap="md">
  <Tabs
    tabs={[
      { id: "profile", label: "Profile" },
      { id: "settings", label: "Settings" },
      { id: "billing", label: "Billing" },
    ]}
    activeId={activeTab}
    onChange={setActiveTab}
  />
  {activeTab === "profile" && <ProfilePanel />}
  {activeTab === "settings" && <SettingsPanel />}
  {activeTab === "billing" && <BillingPanel />}
</Stack>
```

### Stat dashboard

```tsx
<Stack direction="row" gap="lg" wrap>
  <Stat label="Revenue" value="$12.4k" delta="+12%" trend="up" />
  <Stat label="Users" value="1,234" delta="+5%" trend="up" />
  <Stat label="Churn" value="2.1%" delta="-0.3%" trend="down" />
</Stack>
```

### Empty state with CTA

```tsx
<EmptyState
  title="No projects yet"
  description="Create your first project to get started."
  icon={FolderOpen}
  action={
    <Button variant="primary" onClick={onCreate}>
      Create Project
    </Button>
  }
/>
```

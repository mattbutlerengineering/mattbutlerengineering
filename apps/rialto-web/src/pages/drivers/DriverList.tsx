import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDrivers, type Driver } from "./DriverContext";
import { DriverLayout } from "./DriverLayout";
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  DataList,
  Drawer,
  DropdownMenu,
  EmptyState,
  HoverCard,
  Input,
  Pagination,
  Select,
  Stat,
  Table,
  Text,
  useToast,
} from "@mattbutlerengineering/rialto";
import styles from "./DriverList.module.css";

const ROWS_PER_PAGE = 5;

const STATUS_VARIANT = {
  active: "success",
  reserve: "accent",
  retired: "neutral",
} as const;

const TEAMS = ["Ferrari", "Red Bull Racing", "McLaren", "Mercedes", "Williams"];

/* ── Driver preview for HoverCard ───────────── */
function DriverPreview({ driver }: { driver: Driver }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--rialto-space-sm)",
        minWidth: 220,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--rialto-space-sm)",
        }}
      >
        <Avatar name={driver.name} size="md" />
        <div>
          <Text variant="label">{driver.name}</Text>
          <Text variant="caption" color="tertiary">
            #{driver.number} &middot; {driver.nationality}
          </Text>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          gap: "var(--rialto-space-xs)",
          alignItems: "center",
        }}
      >
        <Badge variant={STATUS_VARIANT[driver.status]} size="sm">
          {driver.status.charAt(0).toUpperCase() + driver.status.slice(1)}
        </Badge>
        <Text variant="caption" color="secondary">
          {driver.team}
        </Text>
      </div>
      <div style={{ display: "flex", gap: "var(--rialto-space-md)" }}>
        <Stat value={driver.points} label="Pts" size="sm" />
        <Stat value={driver.wins} label="Wins" size="sm" />
        <Stat value={driver.podiums} label="Podiums" size="sm" />
      </div>
    </div>
  );
}

export function DriverList() {
  const { drivers, deleteDriver } = useDrivers();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Driver | null>(null);
  const [drawerDriver, setDrawerDriver] = useState<Driver | null>(null);

  /* ── Filtered + paginated data ─────────────── */

  const filtered = useMemo(() => {
    return drivers.filter((d) => {
      const matchesSearch =
        !search ||
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        String(d.number).includes(search);
      const matchesTeam = teamFilter === "all" || d.team === teamFilter;
      const matchesStatus = statusFilter === "all" || d.status === statusFilter;
      return matchesSearch && matchesTeam && matchesStatus;
    });
  }, [drivers, search, teamFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * ROWS_PER_PAGE, safePage * ROWS_PER_PAGE);

  /* ── Delete handler ────────────────────────── */

  function handleDelete() {
    if (!deleteTarget) return;
    const driver = deleteTarget;
    deleteDriver(driver.id);
    setDeleteTarget(null);
    toast({
      title: `${driver.name} removed`,
      variant: "default",
    });
  }

  return (
    <DriverLayout
      title="Drivers"
      breadcrumbs={[{ label: "Home", href: "/" }, { label: "Drivers" }]}
      actions={
        <Button variant="primary" size="sm" onClick={() => navigate("/drivers/new")}>
          Add Driver
        </Button>
      }
    >
      {/* ── Toolbar ──────────────────────────── */}
      <div className={styles.toolbar}>
        <div className={styles.searchInput}>
          <Input
            label=""
            placeholder="Search by name or number..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className={styles.filterGroup}>
          <Select
            label=""
            value={teamFilter}
            onChange={(v) => {
              setTeamFilter(v);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All Teams" },
              ...TEAMS.map((t) => ({ value: t, label: t })),
            ]}
          />
          <Select
            label=""
            value={statusFilter}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All Status" },
              { value: "active", label: "Active" },
              { value: "reserve", label: "Reserve" },
              { value: "retired", label: "Retired" },
            ]}
          />
        </div>
      </div>

      {/* ── Table or empty state ─────────────── */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No drivers found"
          description={
            drivers.length === 0
              ? "Add your first driver to get started."
              : "Try adjusting your search or filters."
          }
          action={
            drivers.length === 0 ? (
              <Button variant="primary" size="sm" onClick={() => navigate("/drivers/new")}>
                Add Driver
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setTeamFilter("all");
                  setStatusFilter("all");
                }}
              >
                Clear Filters
              </Button>
            )
          }
        />
      ) : (
        <>
          <Table
            columns={[
              {
                key: "name",
                header: "Driver",
                sortable: true,
                render: (row) => {
                  const d = row as unknown as Driver;
                  return (
                    <div className={styles.driverCell}>
                      <Avatar name={d.name} size="sm" />
                      <HoverCard content={<DriverPreview driver={d} />} placement="bottom">
                        <Link to={`/drivers/${d.id}`} className={styles.driverName}>
                          {d.name}
                        </Link>
                      </HoverCard>
                    </div>
                  );
                },
              },
              {
                key: "number",
                header: "#",
                sortable: true,
                align: "center",
                width: "60px",
              },
              { key: "team", header: "Team", sortable: true },
              {
                key: "status",
                header: "Status",
                sortable: true,
                render: (row) => (
                  <Badge variant={STATUS_VARIANT[row.status as Driver["status"]]} size="sm">
                    {(row.status as string).charAt(0).toUpperCase() +
                      (row.status as string).slice(1)}
                  </Badge>
                ),
              },
              {
                key: "points",
                header: "Points",
                sortable: true,
                align: "right",
              },
              {
                key: "wins",
                header: "Wins",
                sortable: true,
                align: "right",
              },
              {
                key: "actions",
                header: "",
                width: "60px",
                align: "right",
                render: (row) => {
                  const d = row as unknown as Driver;
                  return (
                    <DropdownMenu
                      trigger={
                        <Button variant="ghost" size="sm" aria-label="Actions">
                          &hellip;
                        </Button>
                      }
                      align="right"
                      items={[
                        {
                          id: "view",
                          label: "View",
                          onSelect: () => navigate(`/drivers/${d.id}`),
                        },
                        {
                          id: "quickview",
                          label: "Quick View",
                          onSelect: () => setDrawerDriver(d),
                        },
                        {
                          id: "edit",
                          label: "Edit",
                          onSelect: () => navigate(`/drivers/${d.id}/edit`),
                        },
                        { type: "divider" },
                        {
                          id: "delete",
                          label: "Delete",
                          destructive: true,
                          onSelect: () => setDeleteTarget(d),
                        },
                      ]}
                    />
                  );
                },
              },
            ]}
            data={paged as unknown as Record<string, unknown>[]}
            rowKey={(row) => row.id as string}
            striped
          />

          <div className={styles.paginationRow}>
            <Text variant="caption" color="tertiary">
              {filtered.length} driver{filtered.length !== 1 ? "s" : ""}
            </Text>
            {totalPages > 1 && (
              <Pagination page={safePage} totalPages={totalPages} onChange={setPage} />
            )}
          </div>
        </>
      )}

      {/* ── Quick-view Drawer ────────────────── */}
      <Drawer
        open={!!drawerDriver}
        onClose={() => setDrawerDriver(null)}
        title={drawerDriver?.name}
        side="right"
        footer={
          drawerDriver && (
            <div style={{ display: "flex", gap: "var(--rialto-space-sm)" }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate(`/drivers/${drawerDriver.id}`)}
              >
                Full Profile
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/drivers/${drawerDriver.id}/edit`)}
              >
                Edit
              </Button>
            </div>
          )
        }
      >
        {drawerDriver && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--rialto-space-md)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--rialto-space-md)",
              }}
            >
              <Avatar name={drawerDriver.name} size="xl" />
              <div>
                <Badge variant={STATUS_VARIANT[drawerDriver.status]} size="sm">
                  {drawerDriver.status.charAt(0).toUpperCase() + drawerDriver.status.slice(1)}
                </Badge>
              </div>
            </div>
            <DataList
              items={[
                { label: "Car Number", value: `#${drawerDriver.number}` },
                { label: "Team", value: drawerDriver.team },
                { label: "Nationality", value: drawerDriver.nationality },
              ]}
            />
            <div style={{ display: "flex", gap: "var(--rialto-space-md)" }}>
              <Stat value={drawerDriver.points} label="Points" size="lg" />
              <Stat value={drawerDriver.wins} label="Wins" size="lg" />
              <Stat value={drawerDriver.podiums} label="Podiums" size="lg" />
            </div>
          </div>
        )}
      </Drawer>

      {/* ── Delete confirmation ──────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        title={`Remove ${deleteTarget?.name ?? "driver"}?`}
        description="This action can be undone."
        confirmLabel="Remove"
        variant="destructive"
      />
    </DriverLayout>
  );
}

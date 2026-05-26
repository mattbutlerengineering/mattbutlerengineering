import { useState, useEffect, useMemo, useCallback, useReducer, type ChangeEvent } from "react";
import { useAuth } from "@mbe/auth/react";
import { createApiClient, type GuestRiskResponse } from "@mbe/api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  DataList,
  Dialog,
  Divider,
  Drawer,
  EmptyState,
  Input,
  Select,
  Skeleton,
  SkeletonGroup,
  Stack,
  Stat,
  Tag,
  Text,
  TextArea,
} from "@mattbutlerengineering/rialto";
import { ErrorRetryBanner } from "../components/ErrorRetryBanner";
import type { Guest, GuestSegment, Reservation, UpdateGuestRequest } from "@mbe/types";
import { useVenue } from "../contexts/VenueContext.js";
import { PageHeader } from "../components/PageHeader";
import styles from "./GuestsPage.module.css";

/* ── Constants ─────────────────────────────── */

const SEGMENT_ACCENT_COLORS = [
  "var(--rialto-accent)",
  "var(--rialto-success)",
  "var(--rialto-warning)",
  "var(--rialto-text-secondary)",
  "var(--rialto-error)",
  "var(--rialto-info, var(--rialto-accent))",
] as const;

/* ── Loading skeleton ───────────────────────── */

function GuestsLoadingSkeleton() {
  return (
    <div className={styles.container}>
      <PageHeader title="Guests" description="Manage your guest directory" />
      <SkeletonGroup>
        <div className={styles.segmentsGrid}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} variant="card" width="100%" height={80} />
          ))}
        </div>
        <Skeleton variant="card" width="100%" height={300} />
      </SkeletonGroup>
    </div>
  );
}

/* ── Add Guest Dialog ──────────────────────── */

interface AddGuestDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; email: string; phone: string; notes: string }) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}

function AddGuestDialog({ open, onClose, onSubmit, isSubmitting, error }: AddGuestDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const handleClose = useCallback(() => {
    setName("");
    setEmail("");
    setPhone("");
    setNotes("");
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    await onSubmit({ name, email, phone, notes });
    setName("");
    setEmail("");
    setPhone("");
    setNotes("");
  }, [name, email, phone, notes, onSubmit]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Add Guest"
      footer={
        <Stack direction="row" gap="sm" justify="end">
          <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isSubmitting || name.trim().length === 0}
          >
            {isSubmitting ? "Adding..." : "Add Guest"}
          </Button>
        </Stack>
      }
    >
      <Stack gap="md">
        {error && <Alert variant="error">{error}</Alert>}
        <Input
          label="Name"
          type="text"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          label="Email"
          type="email"
          placeholder="guest@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Phone"
          type="tel"
          placeholder="+1 (555) 000-0000"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <Input
          label="Notes"
          type="text"
          placeholder="Preferences, allergies, etc."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Stack>
    </Dialog>
  );
}

/* ── Guest Detail Drawer ───────────────────── */

interface GuestEditFormData {
  name: string;
  email: string;
  phone: string;
  notes: string;
}

interface GuestDetailDrawerProps {
  guest: Guest | null;
  open: boolean;
  onClose: () => void;
  onSave: (guestId: string, data: UpdateGuestRequest) => Promise<void>;
  api: ReturnType<typeof createApiClient>;
}

type DrawerState = {
  isEditing: boolean;
  formData: GuestEditFormData;
  isSaving: boolean;
  saveError: string | null;
  reservationHistory: Reservation[];
  historyLoading: boolean;
  risk: GuestRiskResponse | null;
};

type DrawerAction =
  | { type: "reset"; guest: Guest }
  | { type: "set_editing"; isEditing: boolean }
  | { type: "set_form_data"; formData: GuestEditFormData }
  | { type: "update_field"; field: keyof GuestEditFormData; value: string }
  | { type: "save_start" }
  | { type: "save_success" }
  | { type: "save_error"; error: string }
  | { type: "clear_save_error" }
  | { type: "history_loading" }
  | { type: "history_loaded"; data: Reservation[] }
  | { type: "history_error" }
  | { type: "risk_loaded"; data: GuestRiskResponse }
  | { type: "risk_error" };

const INITIAL_DRAWER_STATE: DrawerState = {
  isEditing: false,
  formData: { name: "", email: "", phone: "", notes: "" },
  isSaving: false,
  saveError: null,
  reservationHistory: [],
  historyLoading: false,
  risk: null,
};

function drawerReducer(state: DrawerState, action: DrawerAction): DrawerState {
  switch (action.type) {
    case "reset":
      return {
        ...INITIAL_DRAWER_STATE,
        formData: {
          name: action.guest.name,
          email: action.guest.email ?? "",
          phone: action.guest.phone ?? "",
          notes: action.guest.notes ?? "",
        },
      };
    case "set_editing":
      return { ...state, isEditing: action.isEditing };
    case "set_form_data":
      return { ...state, formData: action.formData };
    case "update_field":
      return { ...state, formData: { ...state.formData, [action.field]: action.value } };
    case "save_start":
      return { ...state, isSaving: true, saveError: null };
    case "save_success":
      return { ...state, isSaving: false, isEditing: false };
    case "save_error":
      return { ...state, isSaving: false, saveError: action.error };
    case "clear_save_error":
      return { ...state, saveError: null };
    case "history_loading":
      return { ...state, historyLoading: true };
    case "history_loaded":
      return { ...state, historyLoading: false, reservationHistory: action.data };
    case "history_error":
      return { ...state, historyLoading: false, reservationHistory: [] };
    case "risk_loaded":
      return { ...state, risk: action.data };
    case "risk_error":
      return { ...state, risk: null };
  }
}

function GuestDetailDrawer({ guest, open, onClose, onSave, api }: GuestDetailDrawerProps) {
  const [state, drawerDispatch] = useReducer(drawerReducer, INITIAL_DRAWER_STATE);
  const { isEditing, formData, isSaving, saveError, risk } = state;

  // Reset form when guest changes or drawer opens
  useEffect(() => {
    if (guest && open) {
      drawerDispatch({ type: "reset", guest });
    }
  }, [guest, open]);

  // Fetch reservation history and risk score when drawer opens
  const guestId = guest?.id ?? null;
  useEffect(() => {
    if (!guestId || !open || !api) return;
    let cancelled = false;

    drawerDispatch({ type: "history_loading" });
    api.reservations
      .list({ guestId, limit: 10 })
      .then((response) => {
        if (!cancelled) drawerDispatch({ type: "history_loaded", data: response.data });
      })
      .catch(() => {
        if (!cancelled) drawerDispatch({ type: "history_error" });
      });

    api.guests
      .getRisk(guestId)
      .then((data) => {
        if (!cancelled) drawerDispatch({ type: "risk_loaded", data });
      })
      .catch(() => {
        if (!cancelled) drawerDispatch({ type: "risk_error" });
      });

    return () => {
      cancelled = true;
    };
  }, [guestId, open, api]);

  const handleFieldChange = useCallback(
    (field: keyof GuestEditFormData) =>
      (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        drawerDispatch({ type: "update_field", field, value: e.target.value });
      },
    []
  );

  const handleSave = useCallback(async () => {
    if (!guest) return;
    drawerDispatch({ type: "save_start" });
    try {
      await onSave(guest.id, {
        name: formData.name.trim(),
        email: formData.email.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      });
      drawerDispatch({ type: "save_success" });
    } catch (err) {
      drawerDispatch({
        type: "save_error",
        error: err instanceof Error ? err.message : "Failed to save guest",
      });
    }
  }, [guest, formData, onSave]);

  const handleCancelEdit = useCallback(() => {
    if (guest) {
      drawerDispatch({
        type: "set_form_data",
        formData: {
          name: guest.name,
          email: guest.email ?? "",
          phone: guest.phone ?? "",
          notes: guest.notes ?? "",
        },
      });
    }
    drawerDispatch({ type: "set_editing", isEditing: false });
    drawerDispatch({ type: "clear_save_error" });
  }, [guest]);

  if (!guest) return null;

  const formatDate = (isoString: string | null) => {
    if (!isoString) return "Never";
    return new Date(isoString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const detailItems = [
    { label: "Email", value: guest.email ?? "Not provided" },
    { label: "Phone", value: guest.phone ?? "Not provided" },
    { label: "Visits", value: String(guest.visitCount) },
    { label: "Last Visit", value: formatDate(guest.lastVisit) },
    { label: "Created", value: formatDate(guest.createdAt) },
  ];

  if (guest.lifetimeSpend) {
    detailItems.push({ label: "Lifetime Spend", value: `$${guest.lifetimeSpend}` });
  }

  const isNameValid = formData.name.trim().length > 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEditing ? `Edit ${guest.name}` : guest.name}
      side="right"
      size="default"
      footer={
        isEditing ? (
          <Stack direction="row" gap="sm" justify="end">
            <Button variant="ghost" onClick={handleCancelEdit} disabled={isSaving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={isSaving || !isNameValid}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </Stack>
        ) : (
          <Stack direction="row" gap="sm" justify="end">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="secondary"
              onClick={() => drawerDispatch({ type: "set_editing", isEditing: true })}
            >
              Edit Guest
            </Button>
          </Stack>
        )
      }
    >
      {isEditing ? (
        <Stack gap="md">
          {saveError && <Alert variant="error">{saveError}</Alert>}
          <Input
            label="Name"
            type="text"
            placeholder="Full name"
            value={formData.name}
            onChange={handleFieldChange("name")}
            required
          />
          <Input
            label="Email"
            type="email"
            placeholder="guest@example.com"
            value={formData.email}
            onChange={handleFieldChange("email")}
          />
          <Input
            label="Phone"
            type="tel"
            placeholder="+1 (555) 000-0000"
            value={formData.phone}
            onChange={handleFieldChange("phone")}
          />
          <TextArea
            label="Notes"
            placeholder="Preferences, allergies, etc."
            value={formData.notes}
            onChange={handleFieldChange("notes")}
            rows={4}
            autoResize
          />
        </Stack>
      ) : (
        <Stack gap="lg">
          <DataList items={detailItems} orientation="horizontal" striped />

          {risk && (
            <>
              <Divider />
              <Stack gap="xs">
                <Text variant="label" color="secondary">
                  Risk Level
                </Text>
                <Stack direction="row" gap="sm" align="center">
                  <Badge
                    variant={
                      risk.riskLevel === "trusted"
                        ? "success"
                        : risk.riskLevel === "risky"
                          ? "error"
                          : "neutral"
                    }
                  >
                    {risk.riskLevel === "trusted"
                      ? "Trusted"
                      : risk.riskLevel === "risky"
                        ? "At Risk"
                        : "Standard"}
                  </Badge>
                  {risk.noShowCount > 0 && (
                    <Text variant="caption" color="secondary">
                      {risk.noShowCount} no-show{risk.noShowCount !== 1 ? "s" : ""}
                    </Text>
                  )}
                </Stack>
              </Stack>
            </>
          )}

          {guest.notes && (
            <>
              <Divider />
              <Stack gap="xs">
                <Text variant="label" color="secondary">
                  Notes
                </Text>
                <Text variant="body">{guest.notes}</Text>
              </Stack>
            </>
          )}

          {guest.tags && guest.tags.length > 0 && (
            <>
              <Divider />
              <Stack gap="xs">
                <Text variant="label" color="secondary">
                  Tags
                </Text>
                <Stack direction="row" gap="xs" wrap>
                  {guest.tags.map((tag) => (
                    <Tag key={tag}>{tag}</Tag>
                  ))}
                </Stack>
              </Stack>
            </>
          )}
        </Stack>
      )}
    </Drawer>
  );
}

/* ── Mobile Guest Card ─────────────────────── */

interface MobileGuestCardProps {
  guest: Guest;
  onClick: () => void;
}

function MobileGuestCard({ guest, onClick }: MobileGuestCardProps) {
  return (
    <Button type="button" className={styles.mobileCard} onClick={onClick}>
      <div className={styles.mobileCardHeader}>
        <Text variant="body" color="primary" className={styles.guestName}>
          {guest.name}
        </Text>
        <Badge variant="neutral" size="sm">
          {guest.visitCount} {guest.visitCount === 1 ? "visit" : "visits"}
        </Badge>
      </div>
      <div className={styles.mobileCardContact}>
        {guest.email && (
          <Text variant="caption" color="secondary">
            {guest.email}
          </Text>
        )}
        {guest.phone && (
          <Text variant="caption" color="secondary">
            {guest.phone}
          </Text>
        )}
      </div>
      {guest.tags && guest.tags.length > 0 && (
        <div className={styles.tagList}>
          {guest.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      )}
    </Button>
  );
}

/* ── Main component ─────────────────────────── */

export function GuestsPage() {
  const { accessToken } = useAuth();
  const { venues, selectedVenueId, setVenueId, isMultiVenue } = useVenue();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [segments, setSegments] = useState<GuestSegment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Drawer state
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);

  // Add guest dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogSubmitting, setAddDialogSubmitting] = useState(false);
  const [addDialogError, setAddDialogError] = useState<string | null>(null);

  const api = useMemo(
    () =>
      createApiClient({
        baseUrl: import.meta.env.VITE_API_URL ?? "",
        getAccessToken: () => accessToken,
      }),
    [accessToken]
  );

  const selectedGuest = useMemo(
    () => guests.find((g) => g.id === selectedGuestId) ?? null,
    [guests, selectedGuestId]
  );

  const drawerOpen = selectedGuestId !== null;

  const fetchGuests = useCallback(async () => {
    if (!selectedVenueId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [guestsResponse, segmentsResponse] = await Promise.all([
        searchQuery
          ? api.guests.search({ venueId: selectedVenueId, query: searchQuery })
          : api.guests.list({ venueId: selectedVenueId, limit: 50 }),
        api.guests.getSegments(selectedVenueId),
      ]);

      setGuests(guestsResponse.data);
      setSegments(segmentsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load guests");
    } finally {
      setIsLoading(false);
    }
  }, [api, selectedVenueId, searchQuery]);

  useEffect(() => {
    fetchGuests();
  }, [fetchGuests]);

  const venueOptions = useMemo(
    () => [...venues].map((v) => ({ value: v.id, label: v.name })),
    [venues]
  );

  const formatDate = (isoString: string | null) => {
    if (!isoString) return "Never";
    return new Date(isoString).toLocaleDateString();
  };

  const handleRowClick = useCallback((guestId: string) => {
    setSelectedGuestId(guestId);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setSelectedGuestId(null);
  }, []);

  const handleAddGuest = useCallback(
    async (data: { name: string; email: string; phone: string; notes: string }) => {
      if (!selectedVenueId) return;

      setAddDialogSubmitting(true);
      setAddDialogError(null);

      try {
        await api.guests.findOrCreate({
          venueId: selectedVenueId,
          name: data.name.trim(),
          ...(data.email.trim() ? { email: data.email.trim() } : {}),
          ...(data.phone.trim() ? { phone: data.phone.trim() } : {}),
        });
        setAddDialogOpen(false);
        await fetchGuests();
      } catch (err) {
        setAddDialogError(err instanceof Error ? err.message : "Failed to add guest");
      } finally {
        setAddDialogSubmitting(false);
      }
    },
    [api, selectedVenueId, fetchGuests]
  );

  const handleEditGuest = useCallback(
    async (guestId: string, data: UpdateGuestRequest) => {
      await api.guests.update(guestId, data);
      await fetchGuests();
    },
    [api, fetchGuests]
  );

  const totalGuestCount = useMemo(() => segments.reduce((sum, s) => sum + s.count, 0), [segments]);

  if (!selectedVenueId && !isLoading) {
    return (
      <div className={styles.container}>
        <PageHeader title="Guests" description="Manage your guest directory" />
        <Alert variant="warning">Please select a venue to view guests.</Alert>
      </div>
    );
  }

  if (isLoading && guests.length === 0) {
    return <GuestsLoadingSkeleton />;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <PageHeader title="Guests" description="Manage your guest directory" />
        <div className={styles.headerControls}>
          {isMultiVenue && (
            <Select
              label="Venue"
              options={venueOptions}
              value={selectedVenueId ?? ""}
              onChange={(value) => setVenueId(value)}
            />
          )}
          <Input
            type="text"
            placeholder="Search guests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Button variant="primary" onClick={() => setAddDialogOpen(true)}>
            Add Guest
          </Button>
        </div>
      </div>

      {/* Segments Overview */}
      {segments.length > 0 && (
        <div className={styles.segmentsGrid}>
          {segments.map((segment, index) => (
            <Card
              key={segment.name}
              className={styles.segmentCard}
              style={{
                borderInlineStartColor: SEGMENT_ACCENT_COLORS[index % SEGMENT_ACCENT_COLORS.length],
              }}
            >
              <Stat label={segment.name} value={segment.count} />
            </Card>
          ))}
        </div>
      )}

      {error && (
        <ErrorRetryBanner error={error} onRetry={fetchGuests} onDismiss={() => setError(null)} />
      )}

      <Text className={styles.srOnly} aria-live="polite" role="status">
        {`${guests.length} guest${guests.length !== 1 ? "s" : ""} shown`}
      </Text>

      {!isLoading && !error && guests.length === 0 && (
        <div aria-live="polite" role="status">
          <EmptyState
            heading={searchQuery ? "No guests found" : "No guests yet"}
            description={
              searchQuery
                ? "Try adjusting your search query."
                : "Guests will appear here once they make a reservation."
            }
          />
        </div>
      )}

      {!isLoading && !error && guests.length > 0 && (
        <>
          <Text variant="caption" color="secondary" className={styles.resultCount}>
            Showing {guests.length} of {totalGuestCount} guests
          </Text>

          {/* Desktop table */}
          <Card className={styles.desktopTable}>
            <div className={styles.tableWrapper}>
              {/* eslint-disable mbe-local/prefer-rialto-components -- HTML table elements are correct here; Rialto Table has a different API */}
              <table className={styles.table}>
                <thead className={styles.thead}>
                  <tr>
                    <th className={styles.th}>Guest</th>
                    <th className={styles.th}>Contact</th>
                    <th className={styles.th}>Visits</th>
                    <th className={styles.th}>Last Visit</th>
                    <th className={styles.th}>Tags</th>
                  </tr>
                </thead>
                <tbody className={styles.tbody}>
                  {guests.map((guest) => (
                    <tr
                      key={guest.id}
                      className={[
                        styles.tableRow,
                        selectedGuestId === guest.id ? styles.tableRowActive : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => handleRowClick(guest.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleRowClick(guest.id);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`View details for ${guest.name}`}
                    >
                      <td className={styles.td}>
                        <Text variant="body" color="primary" className={styles.guestName}>
                          {guest.name}
                        </Text>
                        {guest.notes && (
                          <Text variant="caption" color="secondary" className={styles.guestNotes}>
                            {guest.notes}
                          </Text>
                        )}
                      </td>
                      <td className={styles.td}>
                        {guest.email && (
                          <Text variant="caption" color="primary">
                            {guest.email}
                          </Text>
                        )}
                        {guest.phone && (
                          <Text variant="caption" color="secondary">
                            {guest.phone}
                          </Text>
                        )}
                      </td>
                      <td className={styles.td}>{guest.visitCount}</td>
                      <td className={styles.tdMuted}>{formatDate(guest.lastVisit)}</td>
                      <td className={styles.tdTags}>
                        <div className={styles.tagList}>
                          {guest.tags?.map((tag) => (
                            <Tag key={tag}>{tag}</Tag>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* eslint-enable mbe-local/prefer-rialto-components */}
            </div>
          </Card>

          {/* Mobile cards */}
          <div className={styles.mobileCards}>
            {guests.map((guest) => (
              <MobileGuestCard
                key={guest.id}
                guest={guest}
                onClick={() => handleRowClick(guest.id)}
              />
            ))}
          </div>
        </>
      )}

      {/* Guest Detail Drawer */}
      <GuestDetailDrawer
        guest={selectedGuest}
        open={drawerOpen}
        onClose={handleDrawerClose}
        onSave={handleEditGuest}
        api={api}
      />

      {/* Add Guest Dialog */}
      <AddGuestDialog
        open={addDialogOpen}
        onClose={() => {
          setAddDialogOpen(false);
          setAddDialogError(null);
        }}
        onSubmit={handleAddGuest}
        isSubmitting={addDialogSubmitting}
        error={addDialogError}
      />
    </div>
  );
}

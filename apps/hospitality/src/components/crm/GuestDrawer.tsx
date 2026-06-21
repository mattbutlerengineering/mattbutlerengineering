import { useReducer, useEffect, useCallback, type ChangeEvent } from "react";
import { z } from "zod";
import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Drawer,
  Input,
  Stack,
  Tag,
  Text,
  TextArea,
  useToast,
} from "@mattbutlerengineering/rialto";
import type { Guest, Reservation, UpdateGuestRequest } from "@mbe/types";
import { useFormState } from "../../hooks/use-form-state.js";
import { GuestCard } from "./GuestCard.js";

/* ── Schema ─────────────────────────────────── */

const guestFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Please enter a valid email address").or(z.literal("")),
  phone: z
    .string()
    .regex(/^[+\d\s\-().]{7,}$/, "Please enter a valid phone number")
    .or(z.literal("")),
  notes: z.string(),
});

/* ── Constants ──────────────────────────────── */

const DIETARY_RESTRICTION_OPTIONS = [
  "vegetarian",
  "vegan",
  "gluten-free",
  "dairy-free",
  "nut-free",
  "halal",
  "kosher",
  "shellfish-free",
] as const;

/* ── Reducer ────────────────────────────────── */

type DrawerExtras = {
  tags: string[];
  dietaryRestrictions: string[];
  tagInput: string;
};

type DrawerState = {
  isEditing: boolean;
  extras: DrawerExtras;
};

type DrawerAction =
  | { type: "reset"; guest: Guest }
  | { type: "set_editing"; isEditing: boolean }
  | { type: "set_extras"; extras: DrawerExtras }
  | { type: "toggle_dietary"; restriction: string }
  | { type: "add_tag" }
  | { type: "remove_tag"; tag: string }
  | { type: "update_tag_input"; value: string };

const INITIAL_EXTRAS: DrawerExtras = { tags: [], dietaryRestrictions: [], tagInput: "" };
const INITIAL_DRAWER_STATE: DrawerState = { isEditing: false, extras: INITIAL_EXTRAS };

function drawerReducer(state: DrawerState, action: DrawerAction): DrawerState {
  switch (action.type) {
    case "reset":
      return {
        isEditing: false,
        extras: {
          tags: action.guest.tags ? [...action.guest.tags] : [],
          dietaryRestrictions: action.guest.dietaryRestrictions
            ? [...action.guest.dietaryRestrictions]
            : [],
          tagInput: "",
        },
      };
    case "set_editing":
      return { ...state, isEditing: action.isEditing };
    case "set_extras":
      return { ...state, extras: action.extras };
    case "toggle_dietary": {
      const current = state.extras.dietaryRestrictions;
      const next = current.includes(action.restriction)
        ? current.filter((r) => r !== action.restriction)
        : [...current, action.restriction];
      return { ...state, extras: { ...state.extras, dietaryRestrictions: next } };
    }
    case "add_tag": {
      const trimmed = state.extras.tagInput.trim();
      if (!trimmed || state.extras.tags.includes(trimmed)) {
        return { ...state, extras: { ...state.extras, tagInput: "" } };
      }
      return {
        ...state,
        extras: { ...state.extras, tags: [...state.extras.tags, trimmed], tagInput: "" },
      };
    }
    case "remove_tag":
      return {
        ...state,
        extras: { ...state.extras, tags: state.extras.tags.filter((t) => t !== action.tag) },
      };
    case "update_tag_input":
      return { ...state, extras: { ...state.extras, tagInput: action.value } };
  }
}

/* ── Props ──────────────────────────────────── */

export interface GuestDrawerProps {
  guest: Guest | null;
  open: boolean;
  onClose: () => void;
  onSave: (guestId: string, data: UpdateGuestRequest) => Promise<void>;
  guestReservations: Reservation[];
  isLoadingHistory: boolean;
}

/* ── Component ──────────────────────────────── */

export function GuestDrawer({
  guest,
  open,
  onClose,
  onSave,
  guestReservations,
  isLoadingHistory,
}: GuestDrawerProps) {
  const [state, dispatch] = useReducer(drawerReducer, INITIAL_DRAWER_STATE);
  const { isEditing, extras } = state;
  const { toast } = useToast();

  const {
    fields,
    setField,
    isPending,
    error,
    reset: resetForm,
    handleSubmit,
  } = useFormState(
    {
      name: guest?.name ?? "",
      email: guest?.email ?? "",
      phone: guest?.phone ?? "",
      notes: guest?.notes ?? "",
    },
    async (data) => {
      if (!guest) return;
      await onSave(guest.id, {
        name: data.name.trim(),
        email: data.email.trim() || undefined,
        phone: data.phone.trim() || undefined,
        notes: data.notes.trim() || undefined,
        tags: extras.tags,
        dietaryRestrictions: extras.dietaryRestrictions,
      });
      dispatch({ type: "set_editing", isEditing: false });
      toast({ title: "Guest updated", variant: "success" });
    },
    guestFormSchema
  );

  useEffect(() => {
    if (guest && open) {
      dispatch({ type: "reset", guest });
      resetForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
  }, [guest?.id, open]);

  const handleTagInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      dispatch({ type: "add_tag" });
    }
  }, []);

  const handleCancelEdit = useCallback(() => {
    if (guest) {
      dispatch({
        type: "set_extras",
        extras: {
          tags: guest.tags ? [...guest.tags] : [],
          dietaryRestrictions: guest.dietaryRestrictions ? [...guest.dietaryRestrictions] : [],
          tagInput: "",
        },
      });
      resetForm();
    }
    dispatch({ type: "set_editing", isEditing: false });
  }, [guest, resetForm]);

  if (!guest) return null;

  const isEmailValid =
    !fields.email.trim() || guestFormSchema.shape.email.safeParse(fields.email).success;
  const isPhoneValid =
    !fields.phone.trim() || guestFormSchema.shape.phone.safeParse(fields.phone).success;
  const isFormValid = fields.name.trim().length > 0 && isEmailValid && isPhoneValid;

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
            <Button variant="ghost" onClick={handleCancelEdit} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={isPending || !isFormValid}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </Stack>
        ) : (
          <Stack direction="row" gap="sm" justify="end">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="secondary"
              onClick={() => dispatch({ type: "set_editing", isEditing: true })}
            >
              Edit Guest
            </Button>
          </Stack>
        )
      }
    >
      {isEditing ? (
        <Stack gap="md">
          {error && <Alert variant="error">{error}</Alert>}
          <Input
            label="Name"
            type="text"
            placeholder="Full name"
            value={fields.name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setField("name", e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            placeholder="guest@example.com"
            value={fields.email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setField("email", e.target.value)}
            error={!isEmailValid}
            hint={!isEmailValid ? "Please enter a valid email address" : undefined}
          />
          <Input
            label="Phone"
            type="tel"
            placeholder="+1 (555) 000-0000"
            value={fields.phone}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setField("phone", e.target.value)}
            error={!isPhoneValid}
            hint={!isPhoneValid ? "Please enter a valid phone number" : undefined}
          />
          <TextArea
            label="Notes"
            placeholder="Preferences, allergies, etc."
            value={fields.notes}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setField("notes", e.target.value)}
            rows={4}
            autoResize
          />

          <Stack gap="xs">
            <Text variant="label" color="secondary">
              Tags
            </Text>
            <Stack direction="row" gap="xs" wrap>
              {extras.tags.map((tag) => (
                <Button
                  key={tag}
                  variant="ghost"
                  onClick={() => dispatch({ type: "remove_tag", tag })}
                  aria-label={`Remove tag ${tag}`}
                >
                  {tag} ×
                </Button>
              ))}
            </Stack>
            <Input
              label=""
              type="text"
              placeholder="Add tag (press Enter)"
              value={extras.tagInput}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                dispatch({ type: "update_tag_input", value: e.target.value })
              }
              onKeyDown={handleTagInputKeyDown}
            />
          </Stack>

          <Stack gap="xs">
            <Text variant="label" color="secondary">
              Dietary Restrictions
            </Text>
            <Stack gap="xs">
              {DIETARY_RESTRICTION_OPTIONS.map((restriction) => (
                <Checkbox
                  key={restriction}
                  label={restriction}
                  checked={extras.dietaryRestrictions.includes(restriction)}
                  onCheckedChange={() => dispatch({ type: "toggle_dietary", restriction })}
                />
              ))}
            </Stack>
          </Stack>
        </Stack>
      ) : (
        <Stack gap="lg">
          <GuestCard
            guestId={guest.id}
            onEditProfile={() => dispatch({ type: "set_editing", isEditing: true })}
          />

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

          {isLoadingHistory && (
            <Text variant="caption" color="secondary">
              Loading reservation history...
            </Text>
          )}

          {!isLoadingHistory && guestReservations.length > 0 && (
            <>
              <Divider />
              <Stack gap="xs">
                <Text variant="label" color="secondary">
                  Recent Reservations
                </Text>
                {guestReservations.slice(0, 5).map((r: Reservation) => (
                  <Text key={r.id} variant="caption" color="secondary">
                    {r.date} &middot; {r.partySize} guests
                  </Text>
                ))}
              </Stack>
            </>
          )}
        </Stack>
      )}
    </Drawer>
  );
}

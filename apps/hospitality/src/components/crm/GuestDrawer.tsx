import { useReducer, useEffect, useCallback, useMemo, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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

function createGuestFormSchema(t: TFunction) {
  return z.object({
    name: z.string().min(1, t("crm.drawer.nameRequired")),
    email: z.string().email(t("crm.drawer.invalidEmail")).or(z.literal("")),
    phone: z
      .string()
      .regex(/^[+\d\s\-().]{7,}$/, t("crm.drawer.invalidPhone"))
      .or(z.literal("")),
    notes: z.string(),
  });
}

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

/**
 * Maps an edited text field to its PATCH value: `undefined` when untouched
 * (server skips it), `null` when the user emptied it (server clears it).
 */
function patchValue(input: string, original: string | null | undefined): string | null | undefined {
  const next = input.trim();
  if (next === (original ?? "")) return undefined;
  return next || null;
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
  const { t } = useTranslation();
  const guestFormSchema = useMemo(() => createGuestFormSchema(t), [t]);
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
        email: patchValue(data.email, guest.email),
        phone: patchValue(data.phone, guest.phone),
        notes: patchValue(data.notes, guest.notes),
        tags: extras.tags,
        dietaryRestrictions: extras.dietaryRestrictions,
      });
      dispatch({ type: "set_editing", isEditing: false });
      toast({ title: t("crm.drawer.updated"), variant: "success" });
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
      title={isEditing ? t("crm.drawer.editTitle", { name: guest.name }) : guest.name}
      side="right"
      size="default"
      footer={
        isEditing ? (
          <Stack direction="row" gap="sm" justify="end">
            <Button variant="ghost" onClick={handleCancelEdit} disabled={isPending}>
              {t("crm.drawer.cancel")}
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={isPending || !isFormValid}>
              {isPending ? t("crm.drawer.saving") : t("crm.drawer.save")}
            </Button>
          </Stack>
        ) : (
          <Stack direction="row" gap="sm" justify="end">
            <Button variant="ghost" onClick={onClose}>
              {t("crm.drawer.close")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => dispatch({ type: "set_editing", isEditing: true })}
            >
              {t("crm.drawer.editGuest")}
            </Button>
          </Stack>
        )
      }
    >
      {isEditing ? (
        <Stack gap="md">
          {error && <Alert variant="error">{error}</Alert>}
          <Input
            label={t("crm.drawer.name")}
            type="text"
            placeholder={t("crm.drawer.namePlaceholder")}
            value={fields.name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setField("name", e.target.value)}
          />
          <Input
            label={t("crm.drawer.email")}
            type="email"
            placeholder={t("crm.drawer.emailPlaceholder")}
            value={fields.email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setField("email", e.target.value)}
            error={!isEmailValid}
            hint={!isEmailValid ? t("crm.drawer.invalidEmail") : undefined}
          />
          <Input
            label={t("crm.drawer.phone")}
            type="tel"
            placeholder="+1 (555) 000-0000"
            value={fields.phone}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setField("phone", e.target.value)}
            error={!isPhoneValid}
            hint={!isPhoneValid ? t("crm.drawer.invalidPhone") : undefined}
          />
          <TextArea
            label={t("crm.drawer.notes")}
            placeholder={t("crm.drawer.notesPlaceholder")}
            value={fields.notes}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setField("notes", e.target.value)}
            rows={4}
            autoResize
          />

          <Stack gap="xs">
            <Text variant="label" color="secondary">
              {t("crm.drawer.tags")}
            </Text>
            <Stack direction="row" gap="xs" wrap>
              {extras.tags.map((tag) => (
                <Button
                  key={tag}
                  variant="ghost"
                  onClick={() => dispatch({ type: "remove_tag", tag })}
                  aria-label={t("crm.drawer.removeTag", { tag })}
                >
                  {tag} ×
                </Button>
              ))}
            </Stack>
            <Input
              label=""
              type="text"
              placeholder={t("crm.drawer.addTag")}
              value={extras.tagInput}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                dispatch({ type: "update_tag_input", value: e.target.value })
              }
              onKeyDown={handleTagInputKeyDown}
            />
          </Stack>

          <Stack gap="xs">
            <Text variant="label" color="secondary">
              {t("crm.card.dietary")}
            </Text>
            <Stack gap="xs">
              {DIETARY_RESTRICTION_OPTIONS.map((restriction) => (
                <Checkbox
                  key={restriction}
                  label={t(`crm.drawer.dietaryOption.${restriction}`)}
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
                  {t("crm.drawer.tags")}
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
              {t("crm.drawer.loadingHistory")}
            </Text>
          )}

          {!isLoadingHistory && guestReservations.length > 0 && (
            <>
              <Divider />
              <Stack gap="xs">
                <Text variant="label" color="secondary">
                  {t("crm.drawer.recent")}
                </Text>
                {guestReservations.slice(0, 5).map((r: Reservation) => (
                  <Text key={r.id} variant="caption" color="secondary">
                    {r.date} &middot; {t("crm.drawer.partyGuests", { count: r.partySize })}
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

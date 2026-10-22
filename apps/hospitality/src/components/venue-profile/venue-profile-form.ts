import type { VenueProfile } from "@mbe/types";
import { VenueProfileSchema } from "@mbe/types/schemas";

/**
 * Flat, all-strings mirror of {@link VenueProfile} for the operator editor
 * (#7250). Text inputs only ever hold strings, so the form keeps strings and
 * {@link parseVenueProfileForm} is the single place that shapes and validates
 * them against the published schema.
 *
 * The address keys are unprefixed (`line1`, `city`, …) so a Zod issue path of
 * `["address", "city"]` maps onto a field by its last segment alone.
 */
export interface VenueProfileForm {
  readonly type: string;
  readonly cuisines: string;
  readonly line1: string;
  readonly line2: string;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly country: string;
  readonly website: string;
  readonly description: string;
}

export const EMPTY_VENUE_PROFILE_FORM: VenueProfileForm = {
  type: "",
  cuisines: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
  website: "",
  description: "",
};

/** Why a field was rejected. The component owns the wording (i18n). */
export type VenueProfileFieldError = "required" | "invalid" | "tooLong";

export type VenueProfileFormErrors = Partial<
  Record<keyof VenueProfileForm, VenueProfileFieldError>
>;

export type VenueProfileFormResult =
  | { readonly ok: true; readonly profile: VenueProfile }
  | { readonly ok: false; readonly errors: VenueProfileFormErrors };

const ADDRESS_FIELDS = ["line1", "line2", "city", "region", "postalCode", "country"] as const;

export function toVenueProfileForm(profile: VenueProfile | undefined): VenueProfileForm {
  return {
    type: profile?.type ?? "",
    cuisines: (profile?.cuisines ?? []).join(", "),
    line1: profile?.address?.line1 ?? "",
    line2: profile?.address?.line2 ?? "",
    city: profile?.address?.city ?? "",
    region: profile?.address?.region ?? "",
    postalCode: profile?.address?.postalCode ?? "",
    country: profile?.address?.country ?? "",
    website: profile?.website ?? "",
    description: profile?.description ?? "",
  };
}

function splitCuisines(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Address fields are all-or-nothing: touch one and the schema requires the rest. */
function addressFrom(form: VenueProfileForm): Record<string, string> | undefined {
  const touched = ADDRESS_FIELDS.some((field) => form[field].trim().length > 0);
  if (!touched) return undefined;

  const line2 = form.line2.trim();
  return {
    line1: form.line1.trim(),
    ...(line2 ? { line2 } : {}),
    city: form.city.trim(),
    region: form.region.trim(),
    postalCode: form.postalCode.trim(),
    country: form.country.trim(),
  };
}

/** Candidate profile, blank fields omitted so nothing stores an empty string. */
function candidateFrom(form: VenueProfileForm): Record<string, unknown> {
  const cuisines = splitCuisines(form.cuisines);
  const website = form.website.trim();
  const description = form.description.trim();
  const address = addressFrom(form);

  return {
    ...(form.type ? { type: form.type } : {}),
    ...(cuisines.length > 0 ? { cuisines } : {}),
    ...(address ? { address } : {}),
    ...(website ? { website } : {}),
    ...(description ? { description } : {}),
  };
}

/**
 * A blank field that the schema rejected is a missing one, whatever issue code
 * Zod used to say so — `city` reports `too_small`, `country` `invalid_format`,
 * and an address key the form never sent `invalid_type`.
 */
function errorCodeFor(code: string, value: string): VenueProfileFieldError {
  if (code === "too_big") return "tooLong";
  if (value.trim().length === 0) return "required";
  return "invalid";
}

/**
 * Validates the form against {@link VenueProfileSchema} — the same schema the
 * service enforces at the HTTP boundary — so the operator sees the problem
 * before a 400 does. Returns a new object either way; the input is untouched.
 */
export function parseVenueProfileForm(form: VenueProfileForm): VenueProfileFormResult {
  const parsed = VenueProfileSchema.safeParse(candidateFrom(form));
  if (parsed.success) return { ok: true, profile: parsed.data };

  const errors: VenueProfileFormErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path.at(-1);
    if (typeof field !== "string" || !(field in EMPTY_VENUE_PROFILE_FORM)) continue;
    const key = field as keyof VenueProfileForm;
    errors[key] = errorCodeFor(issue.code, form[key]);
  }
  return { ok: false, errors };
}

import { z } from "zod";

/** Shown by both the Add Guest form and the find-or-create route when no contact is given. */
export const GUEST_CONTACT_REQUIRED_MESSAGE = "Either email or phone is required";

/** The find-or-create contract needs at least one non-blank contact to match on. */
export function hasGuestContact(contact: {
  email?: string | null | undefined;
  phone?: string | null | undefined;
}): boolean {
  return Boolean(contact.email?.trim() || contact.phone?.trim());
}

/**
 * Add Guest dialog values. Fields are plain strings ("" = not given) because they
 * come from inputs; the contact refinement mirrors the API's find-or-create rule
 * so the form rejects exactly what the server would.
 */
export const AddGuestFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    email: z.string().email("Please enter a valid email address").or(z.literal("")),
    phone: z
      .string()
      .regex(/^[+\d\s\-().]{7,}$/, "Please enter a valid phone number")
      .or(z.literal("")),
    notes: z.string(),
  })
  .refine(hasGuestContact, { message: GUEST_CONTACT_REQUIRED_MESSAGE, path: ["email"] });

export type AddGuestFormValues = z.infer<typeof AddGuestFormSchema>;

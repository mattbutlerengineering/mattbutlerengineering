import { describe, it, expect } from "vitest";
import { CreateReservationBodySchema } from "@mbe/types";
import { isValidGuestEmail } from "./guest-email.js";

// The server validates `guestEmail` with this schema; the widget must accept
// and reject exactly the same addresses, or a guest passes the form and then
// fails at the API (#9996).
const serverAccepts = (value: string) =>
  CreateReservationBodySchema.shape.guestEmail.unwrap().safeParse(value).success;

const SAMPLES = [
  "jane@example.com",
  "jane.doe+tables@sub.example.co.uk",
  "o'brien@example.ie",
  "not-an-email",
  "jane@",
  "@example.com",
  "jane@example",
  "jane doe@example.com",
  " jane@example.com",
  "jane@example.com ",
  "",
];

describe("isValidGuestEmail", () => {
  it.each(SAMPLES)("agrees with the server's guestEmail schema for %j", (value) => {
    expect(isValidGuestEmail(value)).toBe(serverAccepts(value));
  });

  it("accepts a plain address and rejects a malformed one", () => {
    expect(isValidGuestEmail("jane@example.com")).toBe(true);
    expect(isValidGuestEmail("not-an-email")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import {
  UserSchema,
  UserPreferencesSchema,
  PaginationSchema,
  ErrorSchema,
} from "./index.js";

describe("User service schemas", () => {
  it("UserSchema matches snapshot", () => {
    expect(UserSchema).toMatchSnapshot();
  });

  it("UserPreferencesSchema matches snapshot", () => {
    expect(UserPreferencesSchema).toMatchSnapshot();
  });

  it("PaginationSchema matches snapshot", () => {
    expect(PaginationSchema).toMatchSnapshot();
  });

  it("ErrorSchema matches snapshot", () => {
    expect(ErrorSchema).toMatchSnapshot();
  });
});

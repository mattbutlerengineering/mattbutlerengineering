import { describe, it, expect } from "vitest";
import {
  SessionSchema,
  SessionEventSchema,
  CreateSessionBodySchema,
  PaginationSchema,
  ErrorSchema,
} from "./index.js";

describe("Agent service schemas", () => {
  it("SessionSchema matches snapshot", () => {
    expect(SessionSchema).toMatchSnapshot();
  });

  it("SessionEventSchema matches snapshot", () => {
    expect(SessionEventSchema).toMatchSnapshot();
  });

  it("CreateSessionBodySchema matches snapshot", () => {
    expect(CreateSessionBodySchema).toMatchSnapshot();
  });

  it("PaginationSchema matches snapshot", () => {
    expect(PaginationSchema).toMatchSnapshot();
  });

  it("ErrorSchema matches snapshot", () => {
    expect(ErrorSchema).toMatchSnapshot();
  });

  describe("CreateSessionBodySchema taskDescription limits", () => {
    it("enforces minLength of 1", () => {
      const { minLength } = CreateSessionBodySchema.properties.taskDescription;
      expect(minLength).toBe(1);
    });

    it("enforces maxLength of 10000", () => {
      const { maxLength } = CreateSessionBodySchema.properties.taskDescription;
      expect(maxLength).toBe(10_000);
    });
  });
});

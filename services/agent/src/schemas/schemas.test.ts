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
});

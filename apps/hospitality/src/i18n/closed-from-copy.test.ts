import { describe, expect, it } from "vitest";
import esMX from "./catalogs/es-MX.json";

/** `{{time}}` can be 1:00, which takes "la", not "las": the sentence must not carry the article. */
describe("es-MX closure status from a time", () => {
  const { closedFrom, serviceClosedFrom } = esMX.availability.close.status;

  it("reads correctly at any hour", () => {
    expect(closedFrom).not.toMatch(/\blas? \{\{time\}\}/);
    expect(serviceClosedFrom).not.toMatch(/\blas? \{\{time\}\}/);
  });
});

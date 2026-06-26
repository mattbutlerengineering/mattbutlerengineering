import { describe, it, expect } from "vitest";
import { classifyError, getTitleForStatus } from "@mbe/service-bootstrap";
import { AppError } from "@mbe/types";

/**
 * AppError serialization is handled centrally by errorHandlerPlugin →
 * classifyError (in @mbe/service-bootstrap), which the reservations service
 * registers via createServiceApp. These tests assert that classifyError maps an
 * AppError to the RFC 9457 problem-detail fields, preserving the machine-readable
 * `code` as an extension member (the discriminator clients rely on).
 */
describe("AppError classification (via classifyError)", () => {
  for (const status of [404, 409, 410, 422]) {
    it(`maps AppError(${status}) to RFC 9457 fields with the code extension`, () => {
      const result = classifyError(
        new AppError("TEST_CODE", status, `Test error for status ${status}`)
      );

      expect(result).toEqual({
        status,
        title: getTitleForStatus(status),
        detail: `Test error for status ${status}`,
        extensions: { code: "TEST_CODE" },
      });
    });
  }
});

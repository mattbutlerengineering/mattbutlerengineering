import { ProblemDetailsSchema, titleForStatus } from "@mbe/types";
import type { ProblemDetails } from "@mbe/types";

/**
 * Parses an unknown response body into a typed ProblemDetails object.
 *
 * - Well-formed RFC 7807 body: parsed as-is.
 * - Malformed body (partial/missing fields): fallback values filled in.
 * - Non-7807 body (plain text, HTML, etc.): degrades to a sensible shape.
 *
 * Never throws — all parsing is defensive.
 */
export function parseProblemDetails(raw: unknown, httpStatus: number): ProblemDetails {
  const parsed = ProblemDetailsSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }

  const fallbackDetail = extractDetail(raw, httpStatus);

  return {
    type: "about:blank",
    title: titleForStatus(httpStatus),
    status: httpStatus,
    detail: fallbackDetail,
  };
}

function extractDetail(raw: unknown, httpStatus: number): string {
  if (typeof raw === "string" && raw.length > 0 && !raw.trimStart().startsWith("<")) {
    return raw;
  }
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const candidate = obj.detail ?? obj.message ?? obj.error;
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return titleForStatus(httpStatus);
}

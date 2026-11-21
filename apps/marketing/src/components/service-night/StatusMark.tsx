import { Badge } from "@mattbutlerengineering/rialto";
import type { ClaimStatus } from "../../data/service-night";

/** The honesty line, in two words: is this live in the product, or an idea? */
export function StatusMark({ status }: { status: ClaimStatus }) {
  return status === "shipped" ? (
    <Badge variant="success" size="sm" dot>
      Live today
    </Badge>
  ) : (
    <Badge variant="neutral" size="sm">
      Concept
    </Badge>
  );
}

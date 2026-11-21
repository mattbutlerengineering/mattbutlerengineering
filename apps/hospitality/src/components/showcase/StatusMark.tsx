import { useTranslation } from "react-i18next";
import { Badge } from "@mattbutlerengineering/rialto";
import type { ClaimStatus } from "./service-night.js";

/** The honesty line, in two words: is this live in the product, or an idea? */
export function StatusMark({ status }: { status: ClaimStatus }) {
  const { t } = useTranslation();
  return status === "shipped" ? (
    <Badge variant="success" size="sm" dot>
      {t("showcase.status.shipped")}
    </Badge>
  ) : (
    <Badge variant="neutral" size="sm">
      {t("showcase.status.concept")}
    </Badge>
  );
}

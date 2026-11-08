import { useTranslation } from "react-i18next";
import { Checkbox, Stack, Text } from "@mattbutlerengineering/rialto";

export interface GivenBackChoiceProps {
  /** Cancelled guests on the dates the edit gives back, whom a reopen notice can still reach. */
  readonly guests: number;
  readonly tell: boolean;
  readonly onChange: (tell: boolean) => void;
}

/**
 * Step 2 of an edit that shrinks a closure (ux.md F6 step 5): what to do about the guests it had
 * cancelled on the dates it gives back. The same choice a Reopen asks: tell them the date is open
 * again with a link to rebook, or do nothing.
 */
export function GivenBackChoice({ guests, tell, onChange }: GivenBackChoiceProps) {
  const { t } = useTranslation();
  return (
    <Stack gap="sm">
      <Text variant="body" color="primary">
        {t("availability.close.edit.givenBackIntro")}
      </Text>
      <Checkbox
        label={t("availability.close.edit.tellGivenBack", { count: guests })}
        checked={tell}
        onCheckedChange={onChange}
      />
    </Stack>
  );
}

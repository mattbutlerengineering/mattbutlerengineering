import { useTranslation } from "react-i18next";
import { Stack, Text } from "@mattbutlerengineering/rialto";
import { BasicInfoStep, type BasicInfoData, type SlugStatus } from "./BasicInfoStep.js";

interface WelcomeStepProps {
  data: BasicInfoData;
  errors: Partial<Record<keyof BasicInfoData, string>>;
  onChange: (data: BasicInfoData) => void;
  onValidate?: () => void;
  slugStatus?: SlugStatus;
}

/**
 * Step 1 of onboarding — a brief welcome moment above the venue name/slug
 * fields. Presentation only: the name/slug field logic and slug-availability
 * UI are reused wholesale from {@link BasicInfoStep}.
 */
export function WelcomeStep({ data, errors, onChange, onValidate, slugStatus }: WelcomeStepProps) {
  const { t } = useTranslation();
  return (
    <Stack gap="md">
      <Text variant="display" as="h2">
        {t("onboarding.welcome.heading")}
      </Text>
      <Text variant="body" color="secondary">
        {t("onboarding.welcome.intro")}
      </Text>

      <BasicInfoStep
        data={data}
        errors={errors}
        onChange={onChange}
        onValidate={onValidate}
        slugStatus={slugStatus}
      />
    </Stack>
  );
}

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
  return (
    <Stack gap="md">
      <Text variant="display" as="h2">
        Let&apos;s give your venue a home on the platform
      </Text>
      <Text variant="body" color="secondary">
        Choose a name your guests will recognize and a web address for your booking page.
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

/** The onboarding steps that have a chat (#9474, #9475). A leaf module, so the chat and its state hook can share it without importing each other. */
export type OnboardingChatStep = "locationTime" | "settings" | "hours" | "floorPlan";

/**
 * The wizard step numbers that have a chat. The venue's name (1) and Launch (6) are the owner's
 * own, so they are absent: no chat is mounted there and no model call is ever made.
 */
const CHAT_STEP_BY_WIZARD_STEP: Readonly<Record<number, OnboardingChatStep | undefined>> = {
  2: "locationTime",
  3: "hours",
  4: "settings",
  5: "floorPlan",
};

export function chatStepFor(wizardStep: number): OnboardingChatStep | undefined {
  return CHAT_STEP_BY_WIZARD_STEP[wizardStep];
}

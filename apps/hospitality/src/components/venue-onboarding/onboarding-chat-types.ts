/** The onboarding steps that have a chat (#9474). A leaf module, so the chat and its state hook can share it without importing each other. */
export type OnboardingChatStep = "locationTime" | "settings";

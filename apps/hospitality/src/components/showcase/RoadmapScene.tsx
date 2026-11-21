import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Letterboard } from "@mattbutlerengineering/rialto";
import { ROADMAP } from "./service-night.js";
import { SceneShell } from "./SceneShell.js";

const BOARD_IDS = [
  "guestPassport",
  "kitchenAwareBooking",
  "headlessVenue",
  "regularsClub",
] as const;

export function RoadmapScene() {
  const { t } = useTranslation();
  const lines = useMemo(
    () => [
      [{ text: t("showcase.roadmap.boardHeading"), accent: true }],
      ...BOARD_IDS.map((id) => t(`showcase.roadmap.board.${id}`)),
    ],
    [t]
  );

  return (
    <SceneShell sceneId="roadmap" claims={ROADMAP}>
      <Letterboard lines={lines} size="sm" />
    </SceneShell>
  );
}

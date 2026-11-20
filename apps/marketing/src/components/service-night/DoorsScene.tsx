import { NeonSign } from "@mattbutlerengineering/rialto";
import { SceneShell } from "./SceneShell";

/** `lit` is true once the night has reached doors: the tube strikes on. */
export function DoorsScene({ lit }: { lit: boolean }) {
  return (
    <SceneShell sceneId="doors">
      <NeonSign
        size="lg"
        shape="swoosh"
        state={lit ? "open" : "closed"}
        aria-label={lit ? "Open until 11:00 PM" : "Closed. Doors at 5:00 PM"}
      />
    </SceneShell>
  );
}

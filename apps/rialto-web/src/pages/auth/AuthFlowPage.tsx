/**
 * Auth Flow — `/demos/auth-flow`
 *
 * A walkthrough of the OIDC authorization-code + PKCE flow (and its
 * silent-refresh encore) that the real hospitality app runs, projected onto
 * rialto's `Handshake` instrument — the credential negotiation between
 * Identity, Browser, and API.
 *
 * All flow knowledge lives in `authFlowMachine.ts` — this component only
 * renders the current step and drives the player chrome.
 */

import { useEffect, useReducer } from "react";
import {
  Button,
  Card,
  Handshake,
  Heading,
  SplitFlap,
  Text,
  Toggle,
} from "@mattbutlerengineering/rialto";
import {
  HANDSHAKE_STATIONS,
  INITIAL_STATE,
  advance,
  currentStep,
  handshakeFor,
  type StationId,
} from "./authFlowMachine.js";
import styles from "./AuthFlowPage.module.css";

/** Autoplay cadence — slow enough to read each caption. */
const STEP_INTERVAL_MS = 2800;

/** Legend order matches the hub layout: Identity, Browser, API. */
const LEGEND_STATIONS: readonly StationId[] = ["idp", "browser", "api"];

const STATION_META: Record<StationId, { name: string; role: string }> = {
  browser: { name: "Browser", role: "Single-page app" },
  idp: { name: "Identity", role: "Authorization server" },
  api: { name: "API", role: "Resource server" },
};

export function AuthFlowPage() {
  const [state, dispatch] = useReducer(advance, INITIAL_STATE);
  const step = currentStep(state);
  const handshake = handshakeFor(step);

  // Autoplay: advance on a fixed cadence while playing. `next` clamps at the
  // final step, so the interval idles there while the refresh negotiation loops.
  useEffect(() => {
    if (!state.playing) return;
    const id = window.setInterval(() => dispatch({ type: "next" }), STEP_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [state.playing]);

  // Pause everything when the tab is hidden — no animation plays to nobody.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") dispatch({ type: "pause" });
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Heading level={1} size={3}>
          Auth Flow
        </Heading>
        <Text variant="body" color="secondary">
          The OIDC authorization-code + PKCE dance the hospitality app performs on every sign-in —
          played back one signal at a time.
        </Text>
      </header>

      {/*
        The diagram is a protocol schematic: signals travel in protocol order,
        so it opts out of RTL mirroring the way a chart does.
      */}
      <section className={styles.panel} aria-label="OIDC flow diagram" dir="ltr">
        <div className={styles.stations}>
          {LEGEND_STATIONS.map((stationId) => {
            const meta = STATION_META[stationId];
            return (
              <Card
                key={stationId}
                variant="elevated"
                className={styles.station}
                role="group"
                aria-label={`${meta.name} station`}
              >
                <Text className={styles.stationName}>{meta.name}</Text>
                <Text variant="detail" color="tertiary">
                  {meta.role}
                </Text>
              </Card>
            );
          })}
        </div>

        <Handshake
          size="lg"
          stations={HANDSHAKE_STATIONS}
          state={handshake.state}
          lane={handshake.lane}
          aria-label="Authorization-code exchange between Identity, Browser, and API"
          className={styles.handshake}
        />
      </section>

      <div className={styles.readoutRow} data-step-id={step.id}>
        <SplitFlap value={step.readout} length={9} size="sm" aria-label="Current flow step" />
      </div>

      <div className={styles.caption} aria-live="polite">
        <Text variant="body" color="secondary">
          {step.caption}
        </Text>
      </div>

      <div className={styles.controls}>
        <Button
          variant="primary"
          size="sm"
          onClick={() => dispatch({ type: state.playing ? "pause" : "play" })}
        >
          {state.playing ? "Pause" : "Play"}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => dispatch({ type: "next" })}>
          Next
        </Button>
        <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "reset" })}>
          Reset
        </Button>
        <div className={styles.errorToggle}>
          <Toggle
            label="Simulate tampered state"
            checked={state.errorBranch}
            onCheckedChange={(enabled) => dispatch({ type: "set-error-branch", enabled })}
          />
        </div>
      </div>
    </div>
  );
}

AuthFlowPage.displayName = "AuthFlowPage";

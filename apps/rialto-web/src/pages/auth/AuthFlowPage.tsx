/**
 * Auth Flow — `/demos/auth-flow`
 *
 * An animated instrument-panel walkthrough of the OIDC authorization-code +
 * PKCE flow (and its silent-refresh encore) that the real hospitality app
 * runs. Three stations, two signal channels, one gold pulse: the pulse is the
 * credential in flight, which is why it may wear the accent color.
 *
 * All flow knowledge lives in `authFlowMachine.ts` — this component only
 * renders the current step and drives the player chrome.
 */

import { useEffect, useReducer } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Button,
  Card,
  Heading,
  SplitFlap,
  StatusLED,
  Text,
  Toggle,
  useMotionPreset,
} from "@mattbutlerengineering/rialto";
import {
  INITIAL_STATE,
  STATIONS,
  advance,
  currentStep,
  type ChannelId,
  type FlowStep,
  type StationId,
} from "./authFlowMachine.js";
import styles from "./AuthFlowPage.module.css";

/** Autoplay cadence — slow enough to read each caption. */
const STEP_INTERVAL_MS = 2800;

const STATION_META: Record<StationId, { name: string; role: string }> = {
  browser: { name: "Browser", role: "Single-page app" },
  idp: { name: "Identity Provider", role: "Authorization server" },
  api: { name: "API", role: "Resource server" },
};

/** Travel endpoints as a percentage of the lane, keyed by direction. */
const TRAVEL = {
  outbound: { from: "2%", to: "92%" },
  inbound: { from: "92%", to: "2%" },
} as const;

interface ChannelLaneProps {
  id: ChannelId;
  label: string;
  step: FlowStep;
  playing: boolean;
}

function ChannelLane({ id, label, step, playing }: ChannelLaneProps) {
  const motionPreset = useMotionPreset();
  const reducedMotion = useReducedMotion() ?? false;
  const active = step.channel === id;

  // While playing on the refresh step, the pulse gently replays — the silent
  // refresh is a loop in real life too. Reduced motion never loops.
  const loop = active && playing && step.id === "refresh" && !reducedMotion;
  const travel = step.direction ? TRAVEL[step.direction] : TRAVEL.outbound;

  return (
    <div className={`${styles.lane} ${id === "browser-idp" ? styles.laneIdp : styles.laneApi}`}>
      <Text className={styles.laneLabel} aria-hidden="true">
        {label}
      </Text>
      <div className={styles.groove} data-active={active || undefined}>
        {active && (
          <motion.div
            // Keyed by step so every step replays its own travel from rest.
            key={step.id}
            className={styles.pulse}
            initial={{ left: travel.from, opacity: 0 }}
            animate={{ left: travel.to, opacity: 1 }}
            transition={{
              // Under reduced motion the preset collapses to { duration: 0 }:
              // the pulse appears at its destination as an instant opacity
              // change, with no travel animation.
              ...motionPreset.springGentle,
              opacity: { duration: reducedMotion ? 0 : 0.2 },
              ...(loop ? { repeat: Infinity, repeatDelay: 1.6 } : {}),
            }}
          />
        )}
      </div>
    </div>
  );
}

export function AuthFlowPage() {
  const [state, dispatch] = useReducer(advance, INITIAL_STATE);
  const step = currentStep(state);

  // Autoplay: advance on a fixed cadence while playing. `next` clamps at the
  // final step, so the interval idles there while the refresh pulse loops.
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
        The diagram is a protocol schematic: the browser is always the origin
        station and signals travel in protocol order, so it opts out of RTL
        mirroring the way a chart does. Pulse travel animates physical `left`
        against this fixed direction.
      */}
      <section className={styles.panel} aria-label="OIDC flow diagram" dir="ltr">
        <div className={styles.stations}>
          {STATIONS.map((stationId) => {
            const meta = STATION_META[stationId];
            const variant = step.leds[stationId];
            return (
              <Card
                key={stationId}
                variant="elevated"
                className={styles.station}
                role="group"
                aria-label={`${meta.name} station`}
              >
                <StatusLED
                  variant={variant}
                  size="md"
                  pulse={variant === "accent"}
                  label={`${meta.name} status: ${variant}`}
                />
                <Text className={styles.stationName}>{meta.name}</Text>
                <Text variant="detail" color="tertiary">
                  {meta.role}
                </Text>
              </Card>
            );
          })}
        </div>

        <ChannelLane
          id="browser-idp"
          label="SPA ⇄ Identity Provider"
          step={step}
          playing={state.playing}
        />
        <ChannelLane id="browser-api" label="SPA ⇄ API" step={step} playing={state.playing} />
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

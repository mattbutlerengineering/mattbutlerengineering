import { forwardRef, Fragment, type HTMLAttributes } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "../../utils/class-composer";
import { StatusLED, type StatusLEDProps } from "../StatusLED/StatusLED";
import styles from "./Handshake.module.css";

/**
 * Where a multi-party exchange currently stands.
 * - `idle` — nothing in flight; every LED dark.
 * - `negotiating` — a credential is shuttling along the active lane.
 * - `settled` — every party agrees; every LED green.
 * - `failed` — the active lane's endpoints refused each other.
 */
export type HandshakeState = "idle" | "negotiating" | "settled" | "failed";

/**
 * Instrument that visualises a handshake between two or more stations —
 * an OIDC sign-in, a webhook confirmation, a device pairing. Each station is
 * a recessed LED; the legs between them are machined grooves, and during
 * negotiation a single gold credential pulse shuttles along the active leg.
 * Gold is the one jewel accent, so it appears only while something is in
 * flight; success and error use their semantic tokens.
 *
 * Renders as a single `role="img"` — the track is decorative and assistive
 * tech hears only the required `aria-label`.
 *
 * @example
 * <Handshake aria-label="Verifying your sign-in" stations={["Browser", "Identity", "API"]} lane={1} />
 */
export interface HandshakeProps extends Omit<HTMLAttributes<HTMLDivElement>, "aria-label"> {
  /** Accessible name — required because the component renders as role="img". */
  "aria-label": string;
  /** Station names in track order (unique — they double as React keys). A handshake needs at least two parties. */
  stations: readonly [string, string, ...string[]];
  /** Phase of the exchange. @default "negotiating" */
  state?: HandshakeState;
  /**
   * Index of the leg carrying the credential (`0` = first → second station).
   * Out-of-range values clamp to the nearest leg. @default 0
   */
  lane?: number;
  /** Track preset — scales the LEDs, groove, and labels together. @default "md" */
  size?: "sm" | "md" | "lg";
  /** Print each station's name beneath its LED. @default true */
  showLabels?: boolean;
}

type LEDVariant = NonNullable<StatusLEDProps["variant"]>;

const SIZE_CLASS = { sm: styles.sizeSm, md: styles.sizeMd, lg: styles.sizeLg } as const;
const LED_SIZE = { sm: "sm", md: "md", lg: "lg" } as const satisfies Record<
  NonNullable<HandshakeProps["size"]>,
  StatusLEDProps["size"]
>;

function ledVariant(state: HandshakeState, isEndpoint: boolean): LEDVariant {
  switch (state) {
    case "idle":
      return "off";
    case "settled":
      return "success";
    case "negotiating":
      return isEndpoint ? "accent" : "neutral";
    case "failed":
      return isEndpoint ? "danger" : "neutral";
  }
}

export const Handshake = forwardRef<HTMLDivElement, HandshakeProps>(
  (
    {
      "aria-label": ariaLabel,
      stations,
      state = "negotiating",
      lane = 0,
      size = "md",
      showLabels = true,
      className,
      ...rest
    },
    ref
  ) => {
    const shouldReduceMotion = useReducedMotion() ?? false;
    const lastLeg = stations.length - 2;
    const activeLane = Math.min(Math.max(lane, 0), lastLeg);
    const inFlight = state === "negotiating";

    const rootClass = cn(
      styles.handshake,
      SIZE_CLASS[size],
      shouldReduceMotion && styles.reduced,
      className
    );

    return (
      <div
        ref={ref}
        role="img"
        aria-label={ariaLabel}
        data-state={state}
        data-lane={activeLane}
        data-reduced-motion={shouldReduceMotion}
        className={rootClass}
        {...rest}
      >
        <div className={styles.track} data-track="true" aria-hidden="true">
          {stations.map((name, index) => {
            const isEndpoint = index === activeLane || index === activeLane + 1;
            const variant = ledVariant(state, isEndpoint);
            const legActive = index === activeLane;
            const isLast = index === stations.length - 1;

            return (
              <Fragment key={name}>
                <div className={styles.station} data-station={name} data-variant={variant}>
                  <StatusLED
                    variant={variant}
                    size={LED_SIZE[size]}
                    pulse={inFlight && isEndpoint}
                  />
                  {showLabels && <span className={styles.label}>{name}</span>}
                </div>
                {!isLast && (
                  <div className={styles.leg} data-leg={index} data-active={legActive}>
                    {inFlight && legActive && <span className={styles.pulse} data-pulse="true" />}
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
    );
  }
);

Handshake.displayName = "Handshake";

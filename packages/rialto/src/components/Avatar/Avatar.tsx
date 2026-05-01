import { forwardRef, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { StatusLED } from "../StatusLED";
import styles from "./Avatar.module.css";

/* ── Avatar ──────────────────────────────────── */
/**
 * A circular user avatar that displays an image, falls back to engraved initials
 * derived from `name`, or shows a generic person icon. If the image fails to
 * load, the component automatically falls back to initials or icon.
 *
 * The avatar reads as a machined metal disc: warm aluminum-gradient face with a
 * hairline bezel, debossed initials, and a recessed LED status indicator that
 * breathes gently on "live" states (online / busy / away).
 *
 * @example Image with online LED
 * <Avatar src="/photos/user.jpg" name="Max Verstappen" size="lg" status="online" />
 *
 * @example Split-flap swap when the src changes (e.g., identity switch)
 * <Avatar src={userPhoto} name={user.name} transition="splitflap" />
 */
export interface AvatarProps {
  src?: string;
  alt?: string;
  name?: string;
  size?: "sm" | "md" | "lg" | "xl";
  status?: "online" | "offline" | "busy" | "away";
  /**
   * How the avatar reacts when `src` changes.
   * - `"fade"` (default) — swap instantly, matching the legacy behavior.
   * - `"splitflap"` — run the new image through a two-flap horizontal reveal
   *   that mirrors the library's SplitFlap aesthetic. Honors
   *   `prefers-reduced-motion` by snapping directly.
   */
  transition?: "fade" | "splitflap";
  className?: string;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

interface FlapState {
  prevSrc: string;
  key: number;
}

const FLAP_DURATION_MS = 280;
const FLAP_CASCADE_MS = 80;

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ src, alt, name, size = "md", status, transition = "fade", className }, ref) => {
    // Record which src failed so a new URL can try again without a cleanup
    // effect. Comparing against the current `src` is pure derivation.
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const shouldReduceMotion = useReducedMotion();

    // Track the last rendered src so we know what to "flip from" on change.
    const prevSrcRef = useRef<string | undefined>(src);
    const flapKeyRef = useRef(0);
    const [flapState, setFlapState] = useState<FlapState | null>(null);

    useEffect(() => {
      const prev = prevSrcRef.current;
      prevSrcRef.current = src;

      if (transition !== "splitflap") return;
      if (!prev || !src || prev === src) return;
      if (shouldReduceMotion) return;

      flapKeyRef.current += 1;
      setFlapState({ prevSrc: prev, key: flapKeyRef.current });
    }, [src, transition, shouldReduceMotion]);

    const showImage = Boolean(src) && failedSrc !== src;
    const initials = name ? getInitials(name) : undefined;

    return (
      <div
        ref={ref}
        className={[styles.avatar, styles[size], className].filter(Boolean).join(" ")}
        aria-label={alt ?? name}
      >
        {showImage ? (
          <>
            <img
              className={styles.image}
              src={src}
              alt={alt ?? name ?? ""}
              onError={() => setFailedSrc(src ?? null)}
            />
            {flapState && (
              <FlapStage
                key={flapState.key}
                prevSrc={flapState.prevSrc}
                onComplete={() => setFlapState(null)}
              />
            )}
          </>
        ) : initials ? (
          <span className={styles.initials}>{initials}</span>
        ) : (
          <svg
            width="60%"
            height="60%"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            aria-hidden="true"
            style={{ color: "var(--rialto-text-tertiary)" }}
          >
            <circle cx="8" cy="6" r="2.5" />
            <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" />
          </svg>
        )}
        {status && (
          <StatusLED
            variant={status === "offline" ? "off" : status === "busy" ? "danger" : status === "away" ? "accent" : "success"}
            size={size}
            pulse={status !== "offline"}
            label={status}
            className={styles.status}
          />
        )}
      </div>
    );
  }
);

Avatar.displayName = "Avatar";

/* ── Split-flap stage ────────────────────────── */
/**
 * Two horizontal flaps showing the previous image, rotating around the seam
 * while the new image waits underneath. `backface-visibility: hidden` drops
 * each flap out of sight past 90°, revealing the new image cleanly.
 */
interface FlapStageProps {
  prevSrc: string;
  onComplete: () => void;
}

function FlapStage({ prevSrc, onComplete }: FlapStageProps) {
  return (
    <div className={styles.flapStage} aria-hidden="true" data-testid="avatar-flap-stage">
      <motion.div
        className={`${styles.flapHalf} ${styles.flapHalfTop}`}
        initial={{ rotateX: 0 }}
        animate={{ rotateX: -180 }}
        transition={{ duration: FLAP_DURATION_MS / 1000, ease: "easeIn" }}
      >
        <img className={styles.flapImage} src={prevSrc} alt="" />
      </motion.div>
      <motion.div
        className={`${styles.flapHalf} ${styles.flapHalfBottom}`}
        initial={{ rotateX: 0 }}
        animate={{ rotateX: 180 }}
        transition={{
          duration: FLAP_DURATION_MS / 1000,
          delay: FLAP_CASCADE_MS / 1000,
          ease: "easeIn",
        }}
        onAnimationComplete={onComplete}
      >
        <img className={styles.flapImage} src={prevSrc} alt="" />
      </motion.div>
    </div>
  );
}

/* ── Avatar Group ────────────────────────────── */
/**
 * Displays a row of overlapping avatars with an overflow counter when the list exceeds `max`.
 * Avatars are rendered in reverse DOM order so the first avatar visually overlaps the rest.
 *
 * @example
 * <AvatarGroup
 *   avatars={[
 *     { name: "Alice", src: "/a.jpg" },
 *     { name: "Bob", src: "/b.jpg" },
 *   ]}
 *   max={3}
 *   size="md"
 * />
 */
export interface AvatarGroupProps {
  avatars: AvatarProps[];
  /** Maximum visible avatars before showing a "+N" overflow counter */
  max?: number;
  size?: AvatarProps["size"];
  className?: string;
}

export const AvatarGroup = forwardRef<HTMLDivElement, AvatarGroupProps>(
  ({ avatars, max = 4, size = "md", className }, ref) => {
    const visible = avatars.slice(0, max);
    const overflow = avatars.length - max;

    return (
      <div ref={ref} className={[styles.group, className].filter(Boolean).join(" ")}>
        {overflow > 0 && (
          <div className={`${styles.overflow} ${styles[size]}`} aria-label={`${overflow} more`}>
            <span className={styles.overflowText} aria-hidden="true">+{overflow}</span>
          </div>
        )}
        {[...visible].reverse().map((avatar, i) => (
          <Avatar key={i} {...avatar} size={size} />
        ))}
      </div>
    );
  }
);

AvatarGroup.displayName = "AvatarGroup";

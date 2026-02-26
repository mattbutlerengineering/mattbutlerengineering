import { forwardRef, useState } from "react";
import styles from "./Avatar.module.css";

/* ── Avatar ──────────────────────────────────── */
/**
 * A circular user avatar that displays an image, falls back to initials derived from `name`, or shows a generic person icon.
 * If the image fails to load, the component automatically falls back to the initials or icon.
 *
 * @example
 * <Avatar
 *   src="/photos/user.jpg"
 *   name="Max Verstappen"
 *   size="lg"
 *   status="online"
 * />
 */
export interface AvatarProps {
  src?: string;
  alt?: string;
  name?: string;
  size?: "sm" | "md" | "lg" | "xl";
  status?: "online" | "offline" | "busy" | "away";
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

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ src, alt, name, size = "md", status, className }, ref) => {
    const [imgFailed, setImgFailed] = useState(false);
    const showImage = src && !imgFailed;
    const initials = name ? getInitials(name) : undefined;

    return (
      <div
        ref={ref}
        className={[styles.avatar, styles[size], className].filter(Boolean).join(" ")}
        aria-label={alt ?? name}
      >
        {showImage ? (
          <img
            className={styles.image}
            src={src}
            alt={alt ?? name ?? ""}
            onError={() => setImgFailed(true)}
          />
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
            style={{ color: "var(--rialto-text-tertiary)" }}
          >
            <circle cx="8" cy="6" r="2.5" />
            <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" />
          </svg>
        )}
        {status && (
          <span className={`${styles.status} ${styles[status]}`} role="img" aria-label={status} />
        )}
      </div>
    );
  }
);

Avatar.displayName = "Avatar";

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
          <div className={`${styles.overflow} ${styles[size]}`}>
            <span className={styles.overflowText}>+{overflow}</span>
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

import { forwardRef } from 'react';
import styles from './Timeline.module.css';

/* ── Types ───────────────────────────────────── */
/**
 * A single event entry within a `Timeline`, representing one step in a sequence.
 *
 * @example
 * const event: TimelineEvent = {
 *   title: "Pit Stop",
 *   timestamp: "Lap 24",
 *   status: "completed",
 * };
 */
export interface TimelineEvent {
  title: string;
  description?: string;
  timestamp?: string;
  status?: 'completed' | 'active' | 'upcoming' | 'error';
}

/**
 * A vertical event sequence with status-colored nodes and a connecting track line.
 * Use for activity logs, process steps, or any ordered event history.
 *
 * @example
 * <Timeline
 *   events={[
 *     { title: "Race Start", status: "completed" },
 *     { title: "Pit Window", status: "active" },
 *     { title: "Finish", status: "upcoming" },
 *   ]}
 * />
 */
interface TimelineProps {
  events: TimelineEvent[];
  /** Tighter vertical spacing between events */
  compact?: boolean;
  className?: string;
}

/* ── Component ──────────────────────────────── */
export const Timeline = forwardRef<HTMLDivElement, TimelineProps>(
  ({ events, compact = false, className = '' }, ref) => {
    const containerClass = [
      styles.timeline,
      compact ? styles.compact : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        ref={ref}
        className={containerClass}
        role="list"
        aria-label="Timeline"
      >
        {events.map((event, i) => {
          const status = event.status ?? 'upcoming';

          const itemClass = [
            styles.item,
            status === 'completed' ? styles.completed : '',
            status === 'active' ? styles.active : '',
            status === 'error' ? styles.error : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div key={i} className={itemClass} role="listitem">
              <span className={styles.timestamp}>{event.timestamp ?? ''}</span>
              <div className={styles.track}>
                <span className={styles.node} />
              </div>
              <div className={styles.content}>
                <span className={styles.title}>{event.title}</span>
                {event.description && (
                  <span className={styles.description}>
                    {event.description}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
);
Timeline.displayName = 'Timeline';

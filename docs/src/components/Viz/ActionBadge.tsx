/**
 * The allow / review / block badge.
 *
 * Status colour with an ICON AND A LABEL, always. Two of the three status
 * steps sit below 3:1 on the light surface by design, and colour alone
 * would be unreadable for a CVD reader in any case — so the shape and the
 * word carry the meaning and the colour is the accent, never the message.
 */

import type { Action } from "moderato";
import styles from "./viz.module.css";

export const ACTION_COPY: Record<
  Action,
  { short: string; what: string; icon: string }
> = {
  allow: {
    short: "Allow",
    what: "Published, silently. Nobody is told anything.",
    icon: "✓",
  },
  review: {
    short: "Review",
    what: "Published, and put in front of a moderator.",
    icon: "!",
  },
  block: {
    short: "Block",
    what: "Refused. The write never happens and the author is asked to reword.",
    icon: "✕",
  },
};

export function ActionBadge({
  action,
  compact = false,
  pending = false,
}: {
  action: Action;
  compact?: boolean;
  pending?: boolean;
}): JSX.Element {
  const copy = ACTION_COPY[action];
  return (
    <span
      className={`${styles.badge} ${styles[`badge_${action}`]} ${
        compact ? styles.badgeCompact : ""
      }`}
      data-pending={pending || undefined}
    >
      <span aria-hidden className={styles.badgeIcon}>
        {pending ? "…" : copy.icon}
      </span>
      <span>{pending ? "Screening" : copy.short}</span>
    </span>
  );
}

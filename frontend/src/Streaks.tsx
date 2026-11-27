import { useEffect, useState } from "react";
import { getStreaks, isUnauthorized, type Streaks } from "./api";

// F-07 v1.5 §3.3. A failed load stays inside the panel (no role="alert"), same choice as F-09.

const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

interface StreaksPanelProps {
  goalId: number;
  /** Changes after an entry is recorded, so the panel loads again (AC-07.15). */
  refreshKey: number;
  onUnauthorized: () => void;
}

export function StreaksPanel({ goalId, refreshKey, onUnauthorized }: StreaksPanelProps) {
  const [streaks, setStreaks] = useState<Streaks | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStreaks(goalId)
      .then((s) => {
        if (cancelled) return;
        setStreaks(s);
        setLoadError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (isUnauthorized(err)) onUnauthorized();
        else setLoadError("Could not load streaks.");
      });
    return () => {
      cancelled = true;
    };
  }, [goalId, refreshKey]);

  let content;
  if (loadError) content = <p className="status-message">{loadError}</p>;
  else if (!streaks) content = <p className="status-message">Loading streaks…</p>;
  else
    content = (
      <>
        <p className="progress-card__days">Current streak: {days(streaks.currentStreak)}</p>
        <p className="progress-card__today">Longest streak: {days(streaks.longestStreak)}</p>
      </>
    );

  return (
    <section className="card progress-card" aria-label="Streaks">
      {content}
    </section>
  );
}

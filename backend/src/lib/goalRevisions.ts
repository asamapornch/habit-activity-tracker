// F-06 §2.5/§3.4 (SRS D-13, D-14): the one place "the value in effect on day
// D" is computed. Shared by F-06 (this feature), and planned for F-07/F-08.

export interface EffectiveGoal {
  dailyTarget: number;
  endDate: string;
}

export interface EffectiveRevision {
  id: number;
  dailyTarget: number;
  endDate: string;
  effectiveFrom: string;
}

/**
 * The value of `field` in effect on `date`: the revision with the greatest
 * `effectiveFrom <= date`, ties broken by the greatest `id` (D-14); falls
 * back to the goal's own stored value when no revision qualifies.
 */
export function effectiveOn(
  goal: EffectiveGoal,
  revisions: EffectiveRevision[],
  date: string,
  field: "dailyTarget" | "endDate",
): number | string {
  let best: EffectiveRevision | null = null;
  for (const revision of revisions) {
    if (revision.effectiveFrom > date) continue;
    if (
      best === null ||
      revision.effectiveFrom > best.effectiveFrom ||
      (revision.effectiveFrom === best.effectiveFrom && revision.id > best.id)
    ) {
      best = revision;
    }
  }
  return best ? best[field] : goal[field];
}

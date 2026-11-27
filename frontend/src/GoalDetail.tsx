import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  errorMessage,
  getProgress,
  getSummary,
  isUnauthorized,
  listEntries,
  recordEntry,
  reviseGoal,
  type Entry,
  type Goal,
  type Progress,
  type Summary,
  type Template,
} from "./api";
import { ReminderPanel } from "./Reminders";

interface GoalDetailProps {
  goal: Goal;
  template: Template;
  onBack: () => void;
  onUnauthorized: () => void;
}

const byDate = (a: Entry, b: Entry) => a.date.localeCompare(b.date);

export function GoalDetail({ goal, template, onBack, onUnauthorized }: GoalDetailProps) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [value, setValue] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // F-06 §2.6/§3.1: the currently effective values (the PATCH response),
  // not necessarily goal.dailyTarget/goal.endDate once a revision exists.
  const [effectiveTarget, setEffectiveTarget] = useState(goal.dailyTarget);
  const [effectiveEndDate, setEffectiveEndDate] = useState(goal.endDate);
  const [revising, setRevising] = useState(false);
  const [reviseTarget, setReviseTarget] = useState("");
  const [reviseEndDate, setReviseEndDate] = useState("");
  const [reviseError, setReviseError] = useState<string | null>(null);
  const [reviseSubmitting, setReviseSubmitting] = useState(false);

  // F-08 §3.3: fetched independently of entries/progress, so a summary
  // failure never blocks the rest of the goal screen from rendering.
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryRefreshKey, setSummaryRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getSummary(goal.id)
      .then((result) => {
        if (cancelled) return;
        setSummary(result);
        setSummaryError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (isUnauthorized(err)) onUnauthorized();
        else setSummaryError("Could not load the weekly/monthly summary.");
      });
    return () => {
      cancelled = true;
    };
  }, [goal.id, summaryRefreshKey]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listEntries(goal.id), getProgress(goal.id)])
      .then(([list, prog]) => {
        if (cancelled) return;
        setEntries(list);
        setProgress(prog);
        setDate((current) => current || prog.today);
      })
      .catch((err) => {
        if (cancelled) return;
        if (isUnauthorized(err)) onUnauthorized();
        else setLoadError("Could not load this goal.");
      });
    return () => {
      cancelled = true;
    };
  }, [goal.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setRefreshError(null);
    setSubmitting(true);
    try {
      const entry = await recordEntry(goal.id, { date, value: Number(value) });
      setEntries((current) => [...(current ?? []), entry].sort(byDate));
      setValue("");
    } catch (err) {
      if (isUnauthorized(err)) onUnauthorized();
      else setFormError(errorMessage(err));
      return;
    } finally {
      setSubmitting(false);
    }

    // The entry is saved; a failed refresh must not look like a failed save.
    try {
      setProgress(await getProgress(goal.id));
    } catch (err) {
      if (isUnauthorized(err)) onUnauthorized();
      else setRefreshError("Entry saved, but progress could not be refreshed.");
    }
  }

  function openRevise() {
    setReviseTarget(String(effectiveTarget));
    setReviseEndDate(effectiveEndDate);
    setReviseError(null);
    setRevising(true);
  }

  async function handleRevise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviseError(null);

    const body: { dailyTarget?: number; endDate?: string } = {};
    if (Number(reviseTarget) !== effectiveTarget) body.dailyTarget = Number(reviseTarget);
    if (reviseEndDate !== effectiveEndDate) body.endDate = reviseEndDate;

    setReviseSubmitting(true);
    try {
      const revised = await reviseGoal(goal.id, body);
      setEffectiveTarget(revised.dailyTarget);
      setEffectiveEndDate(revised.endDate);
      setRevising(false);
      setSummaryRefreshKey((key) => key + 1); // F-08 AC-08.15: refetch so daysMet reflects the new target
    } catch (err) {
      if (isUnauthorized(err)) onUnauthorized();
      else setReviseError(errorMessage(err));
    } finally {
      setReviseSubmitting(false);
    }
  }

  const header = (
    <div className="goal-detail__header">
      <button type="button" className="btn btn--secondary btn--small" onClick={onBack}>
        Back to goals
      </button>
      <h3 className="card-title">{template.name}</h3>
      <span className="goal-list__meta">
        {effectiveTarget} {template.unit} a day · {goal.startDate} → {effectiveEndDate}
      </span>
      {!revising && (
        <button type="button" className="btn btn--secondary btn--small" onClick={openRevise}>
          Revise goal
        </button>
      )}
      {revising && (
        <form onSubmit={handleRevise} aria-label="Revise goal" className="card template-form">
          <h3 className="card-title">Revise goal</h3>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="revise-target">Daily target</label>
              <input
                id="revise-target"
                type="number"
                step="0.01"
                className="input"
                value={reviseTarget}
                onChange={(event) => setReviseTarget(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="revise-end-date">End date</label>
              <input
                id="revise-end-date"
                type="date"
                className="input"
                value={reviseEndDate}
                onChange={(event) => setReviseEndDate(event.target.value)}
                required
              />
            </div>
          </div>
          <div className="template-form__actions">
            <button type="submit" className="btn btn--primary" disabled={reviseSubmitting}>
              Save
            </button>
          </div>
          {reviseError && (
            <p role="alert" className="error-box">
              {reviseError}
            </p>
          )}
        </form>
      )}
    </div>
  );

  if (loadError)
    return (
      <section className="goal-detail">
        {header}
        <p role="alert" className="error-box">
          {loadError}
        </p>
      </section>
    );
  if (!entries || !progress)
    return (
      <section className="goal-detail">
        {header}
        <p className="status-message">Loading goal…</p>
      </section>
    );

  return (
    <section className="goal-detail">
      {header}
      <div className="card progress-card" aria-label="Progress">
        <p className="progress-card__pct">{progress.progress}%</p>
        <p className="progress-card__days">
          {progress.daysMet} of {progress.daysElapsed} days met
        </p>
        <div className="progress-bar" aria-hidden="true">
          <div className="progress-bar__fill" style={{ width: `${Math.min(progress.progress, 100)}%` }} />
        </div>
        <p className="progress-card__today">Today (Asia/Bangkok): {progress.today}</p>
        {refreshError && (
          <p role="status" className="error-box">
            {refreshError}
          </p>
        )}
      </div>

      <section className="card summary-card" aria-label="Summary">
        <h3 className="card-title">This week / this month</h3>
        {!summary && !summaryError && <p className="status-message">Loading summary…</p>}
        {summaryError && (
          <p role="alert" className="error-box">
            {summaryError}
          </p>
        )}
        {summary && (
          <div className="summary-windows">
            <div className="summary-window">
              <h4>This week</h4>
              <p>
                {summary.week.start} to {summary.week.end}
              </p>
              {summary.week.daysRecorded === 0 ? (
                <p className="status-message">No entries recorded this week.</p>
              ) : (
                <p>
                  {summary.week.daysRecorded} days recorded, {summary.week.daysMet} met, total{" "}
                  {summary.week.total}, average {summary.week.average}
                </p>
              )}
            </div>
            <div className="summary-window">
              <h4>This month</h4>
              <p>
                {summary.month.start} to {summary.month.end}
              </p>
              {summary.month.daysRecorded === 0 ? (
                <p className="status-message">No entries recorded this month.</p>
              ) : (
                <p>
                  {summary.month.daysRecorded} days recorded, {summary.month.daysMet} met, total{" "}
                  {summary.month.total}, average {summary.month.average}
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      <form onSubmit={handleSubmit} aria-label="Record entry" className="card template-form">
        <h3 className="card-title">Record entry</h3>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="entry-date">Date</label>
            <input
              id="entry-date"
              type="date"
              className="input"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="entry-value">Value ({template.unit})</label>
            <input
              id="entry-value"
              type="number"
              step="0.01"
              className="input"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              required
            />
          </div>
        </div>
        <div className="template-form__actions">
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            Record
          </button>
        </div>
        {formError && (
          <p role="alert" className="error-box">
            {formError}
          </p>
        )}
      </form>

      <h3 className="section-subtitle">History</h3>
      {entries.length === 0 ? (
        <p className="status-message">No entries yet.</p>
      ) : (
        <table className="card history-table" aria-label="Entry history">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.date}</td>
                <td>
                  {entry.value} {template.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ReminderPanel goalId={goal.id} onUnauthorized={onUnauthorized} />
    </section>
  );
}

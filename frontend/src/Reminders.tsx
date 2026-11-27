import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiError,
  deleteReminder,
  errorMessage,
  getReminder,
  isUnauthorized,
  listUpcomingReminders,
  putReminder,
  type Goal,
  type ReminderSchedule,
  type Template,
  type UpcomingReminder,
} from "./api";

// F-09 v1.2 §3.3. Nothing is sent or delivered: the schedule is only stored and shown.
// A failed load stays inside the panel (no role="alert"), so the rest of the screen keeps working.

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NO_SCHEDULE_MESSAGE = "No reminder schedule set for this goal.";

const describeSchedule = (s: ReminderSchedule) =>
  `${[...s.weekdays].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(", ")} at ${s.time}`;

const isNoSchedule = (err: unknown) =>
  err instanceof ApiError && err.status === 404 && err.message === NO_SCHEDULE_MESSAGE;

interface ReminderPanelProps {
  goalId: number;
  onUnauthorized: () => void;
}

export function ReminderPanel({ goalId, onUnauthorized }: ReminderPanelProps) {
  // undefined = loading, null = no schedule.
  const [schedule, setSchedule] = useState<ReminderSchedule | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [time, setTime] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function show(next: ReminderSchedule | null) {
    setSchedule(next);
    setDays(next ? [...next.weekdays] : []);
    setTime(next ? next.time : "");
  }

  useEffect(() => {
    let cancelled = false;
    getReminder(goalId)
      .then((s) => !cancelled && show(s))
      .catch((err) => {
        if (cancelled) return;
        if (isNoSchedule(err)) show(null);
        else if (isUnauthorized(err)) onUnauthorized();
        else setLoadError("Could not load the reminder.");
      });
    return () => {
      cancelled = true;
    };
  }, [goalId]);

  function toggle(day: number) {
    setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day]));
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      // D-20: ascending JSON integers; BR-13 (at least one day) is the server's check.
      show(await putReminder(goalId, { weekdays: [...days].sort((a, b) => a - b), time }));
    } catch (err) {
      if (isUnauthorized(err)) onUnauthorized();
      else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setFormError(null);
    setBusy(true);
    try {
      await deleteReminder(goalId);
      show(null);
    } catch (err) {
      if (isUnauthorized(err)) onUnauthorized();
      else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  let content;
  if (loadError) content = <p className="status-message">{loadError}</p>;
  else if (schedule === undefined) content = <p className="status-message">Loading reminder…</p>;
  else
    content = (
      <>
        <p className="status-message">{schedule ? describeSchedule(schedule) : "No reminder set."}</p>
        <form onSubmit={handleSave} aria-label="Reminder schedule" className="template-form">
          <fieldset className="field">
            <legend>Weekdays</legend>
            {DAY_NAMES.map((name, day) => (
              <label key={name} className="reminder-day">
                <input type="checkbox" checked={days.includes(day)} onChange={() => toggle(day)} /> {name}
              </label>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor={`reminder-time-${goalId}`}>Reminder time</label>
            <input
              id={`reminder-time-${goalId}`}
              type="time"
              className="input"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              required
            />
          </div>
          <div className="template-form__actions">
            <button type="submit" className="btn btn--primary" disabled={busy}>
              Save reminder
            </button>
            {schedule && (
              <button type="button" className="btn btn--secondary" disabled={busy} onClick={handleRemove}>
                Remove reminder
              </button>
            )}
          </div>
          {formError && (
            <p role="alert" className="error-box">
              {formError}
            </p>
          )}
        </form>
      </>
    );

  return (
    <section className="card" aria-label="Reminder">
      <h3 className="card-title">Reminder</h3>
      {content}
    </section>
  );
}

interface UpcomingRemindersProps {
  goals: Goal[];
  templates: Template[];
  onUnauthorized: () => void;
}

export function UpcomingReminders({ goals, templates, onUnauthorized }: UpcomingRemindersProps) {
  const [items, setItems] = useState<UpcomingReminder[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listUpcomingReminders()
      .then((list) => !cancelled && setItems(list))
      .catch((err) => {
        if (cancelled) return;
        if (isUnauthorized(err)) onUnauthorized();
        else setLoadError("Could not load upcoming reminders.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const goalName = (goalId: number) => {
    const goal = goals.find((g) => g.id === goalId);
    return templates.find((t) => t.id === goal?.templateId)?.name ?? `Goal ${goalId}`;
  };

  let content;
  if (loadError) content = <p className="status-message">{loadError}</p>;
  else if (!items) content = <p className="status-message">Loading reminders…</p>;
  else if (items.length === 0) content = <p className="status-message">No reminders in the next 7 days.</p>;
  else
    content = (
      <table className="history-table" aria-label="Upcoming reminders">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Time</th>
            <th scope="col">Goal</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.goalId}-${item.date}`}>
              <td>{item.date}</td>
              <td>{item.time}</td>
              <td>{goalName(item.goalId)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );

  return (
    <section className="card" aria-label="Upcoming reminders panel">
      <h3 className="card-title">Upcoming reminders</h3>
      {content}
    </section>
  );
}

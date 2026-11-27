import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  createGoal,
  errorMessage,
  isUnauthorized,
  listGoals,
  listTemplates,
  type Goal,
  type Template,
} from "./api";
import { GoalDetail } from "./GoalDetail";
import { UpcomingReminders } from "./Reminders";

interface GoalFormProps {
  templates: Template[];
  onCreated: (goal: Goal) => void;
  onUnauthorized: () => void;
}

function GoalForm({ templates, onCreated, onUnauthorized }: GoalFormProps) {
  const [templateId, setTemplateId] = useState("");
  const [dailyTarget, setDailyTarget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const goal = await createGoal({
        templateId: Number(templateId),
        dailyTarget: Number(dailyTarget),
        startDate,
        endDate,
      });
      onCreated(goal);
      setTemplateId("");
      setDailyTarget("");
      setStartDate("");
      setEndDate("");
    } catch (err) {
      if (isUnauthorized(err)) {
        onUnauthorized();
        return;
      }
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const selected = templates.find((t) => String(t.id) === templateId);

  return (
    <form onSubmit={handleSubmit} aria-label="Create goal" className="card template-form">
      <h3 className="card-title">Create goal</h3>
      <div className="field">
        <label htmlFor="goal-template">Template</label>
        <select
          id="goal-template"
          className="input"
          value={templateId}
          onChange={(event) => setTemplateId(event.target.value)}
          required
        >
          <option value="">Choose a template</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.unit}, {t.minValue}–{t.maxValue})
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="goal-target">Daily target{selected ? ` (${selected.unit})` : ""}</label>
        <input
          id="goal-target"
          type="number"
          step="0.01"
          className="input"
          value={dailyTarget}
          onChange={(event) => setDailyTarget(event.target.value)}
          required
        />
      </div>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="goal-start">Start date</label>
          <input
            id="goal-start"
            type="date"
            className="input"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="goal-end">End date</label>
          <input
            id="goal-end"
            type="date"
            className="input"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            required
          />
        </div>
      </div>
      <div className="template-form__actions">
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          Create goal
        </button>
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </form>
  );
}

export function Goals({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listTemplates(), listGoals()])
      .then(([templateList, goalList]) => {
        if (cancelled) return;
        setTemplates(templateList);
        setGoals(goalList);
      })
      .catch((err) => {
        if (cancelled) return;
        if (isUnauthorized(err)) onUnauthorized();
        else setLoadError("Could not load goals.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const templateOf = (goal: Goal) => templates.find((t) => t.id === goal.templateId);
  const openGoal = goals?.find((g) => g.id === openId);
  const openTemplate = openGoal && templateOf(openGoal);

  let body;
  if (loadError)
    body = (
      <p role="alert" className="error-box">
        {loadError}
      </p>
    );
  else if (!goals) body = <p className="status-message">Loading goals…</p>;
  else if (openGoal && openTemplate)
    body = (
      <GoalDetail
        goal={openGoal}
        template={openTemplate}
        onBack={() => setOpenId(null)}
        onUnauthorized={onUnauthorized}
      />
    );
  else
    body = (
      <>
        <GoalForm
          templates={templates}
          onCreated={(goal) => setGoals((current) => [...(current ?? []), goal])}
          onUnauthorized={onUnauthorized}
        />
        <UpcomingReminders goals={goals} templates={templates} onUnauthorized={onUnauthorized} />
        {goals.length === 0 ? (
          <p className="status-message">No goals yet.</p>
        ) : (
          <ul className="template-list">
            {goals.map((goal) => {
              const template = templateOf(goal);
              const name = template?.name ?? `Template ${goal.templateId}`;
              return (
                <li key={goal.id} className="template-list__item">
                  <div className="template-list__info">
                    <span className="template-list__name">{name}</span>
                    <span className="template-list__meta">
                      {goal.dailyTarget} {template?.unit} · {goal.startDate} → {goal.endDate}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn--secondary btn--small"
                    aria-label={`Open ${name} goal`}
                    onClick={() => setOpenId(goal.id)}
                  >
                    Open
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </>
    );

  return (
    <section className="templates goals">
      <h2 className="section-title">Goals</h2>
      {body}
    </section>
  );
}

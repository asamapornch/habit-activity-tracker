import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiError,
  createTemplate,
  listTemplates,
  updateTemplate,
  type Template,
  type TemplateInput,
} from "./api";

interface TemplateFormProps {
  mode: "create" | "edit";
  initial?: Template;
  onSaved: (template: Template) => void;
  onCancel?: () => void;
  onUnauthorized: () => void;
}

function TemplateForm({ mode, initial, onSaved, onCancel, onUnauthorized }: TemplateFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [minValue, setMinValue] = useState(initial ? String(initial.minValue) : "");
  const [maxValue, setMaxValue] = useState(initial ? String(initial.maxValue) : "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const input: TemplateInput = {
      name,
      unit,
      minValue: Number(minValue),
      maxValue: Number(maxValue),
    };

    try {
      const saved =
        mode === "create" ? await createTemplate(input) : await updateTemplate(initial!.id, input);
      onSaved(saved);
      if (mode === "create") {
        setName("");
        setUnit("");
        setMinValue("");
        setMaxValue("");
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return;
      }
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  const idPrefix = mode === "create" ? "create" : `edit-${initial?.id}`;

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={mode === "create" ? "Create template" : "Edit template"}
      className="card template-form"
    >
      <h3 className="card-title">{mode === "create" ? "Create template" : "Edit template"}</h3>
      <div className="field">
        <label htmlFor={`${idPrefix}-name`}>Name</label>
        <input
          id={`${idPrefix}-name`}
          className="input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor={`${idPrefix}-unit`}>Unit</label>
        <input
          id={`${idPrefix}-unit`}
          className="input"
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
          required
        />
      </div>
      <div className="field-grid">
        <div className="field">
          <label htmlFor={`${idPrefix}-min`}>Min value</label>
          <input
            id={`${idPrefix}-min`}
            type="number"
            step="0.01"
            className="input"
            value={minValue}
            onChange={(event) => setMinValue(event.target.value)}
            onWheel={(event) => event.currentTarget.blur()}
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`${idPrefix}-max`}>Max value</label>
          <input
            id={`${idPrefix}-max`}
            type="number"
            step="0.01"
            className="input"
            value={maxValue}
            onChange={(event) => setMaxValue(event.target.value)}
            onWheel={(event) => event.currentTarget.blur()}
            required
          />
        </div>
      </div>
      <div className="template-form__actions">
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {mode === "create" ? "Create" : "Save"}
        </button>
        {onCancel && (
          <button type="button" className="btn btn--secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
    </form>
  );
}

export function Templates({
  role,
  onUnauthorized,
}: {
  role: "MANAGER" | "PARTICIPANT";
  onUnauthorized: () => void;
}) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const list = await listTemplates();
        if (cancelled) return;
        setTemplates(list);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          onUnauthorized();
          return;
        }
        setLoadError("Could not load templates.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleCreated(template: Template) {
    setTemplates((current) => [...(current ?? []), template]);
  }

  function handleUpdated(template: Template) {
    setTemplates((current) => (current ?? []).map((t) => (t.id === template.id ? template : t)));
    setEditingId(null);
  }

  if (loading) return <p className="status-message">Loading templates…</p>;
  if (loadError)
    return (
      <p role="alert" className="error-box">
        {loadError}
      </p>
    );

  return (
    <section className="templates">
      <h2 className="section-title">Templates</h2>
      {role === "MANAGER" && (
        <TemplateForm mode="create" onSaved={handleCreated} onUnauthorized={onUnauthorized} />
      )}
      <ul className="template-list">
        {(templates ?? []).map((template) =>
          editingId === template.id ? (
            <li key={template.id} className="template-list__item template-list__item--editing">
              <TemplateForm
                mode="edit"
                initial={template}
                onSaved={handleUpdated}
                onCancel={() => setEditingId(null)}
                onUnauthorized={onUnauthorized}
              />
            </li>
          ) : (
            <li key={template.id} className="template-list__item">
              <div className="template-list__info">
                <span className="template-list__name">{template.name}</span>
                <span className="template-list__meta">
                  {template.unit} · {template.minValue}–{template.maxValue}
                </span>
              </div>
              {role === "MANAGER" && (
                <button
                  type="button"
                  className="btn btn--secondary btn--small"
                  aria-label={`Edit ${template.name}`}
                  onClick={() => setEditingId(template.id)}
                >
                  Edit
                </button>
              )}
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

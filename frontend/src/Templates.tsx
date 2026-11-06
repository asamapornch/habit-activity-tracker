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
    <form onSubmit={handleSubmit} aria-label={mode === "create" ? "Create template" : "Edit template"}>
      <div>
        <label htmlFor={`${idPrefix}-name`}>Name</label>
        <input
          id={`${idPrefix}-name`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-unit`}>Unit</label>
        <input
          id={`${idPrefix}-unit`}
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-min`}>Min value</label>
        <input
          id={`${idPrefix}-min`}
          type="number"
          step="0.01"
          value={minValue}
          onChange={(event) => setMinValue(event.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-max`}>Max value</label>
        <input
          id={`${idPrefix}-max`}
          type="number"
          step="0.01"
          value={maxValue}
          onChange={(event) => setMaxValue(event.target.value)}
          required
        />
      </div>
      <button type="submit" disabled={submitting}>
        {mode === "create" ? "Create" : "Save"}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      )}
      {error && <p role="alert">{error}</p>}
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

  if (loading) return <p>Loading templates…</p>;
  if (loadError) return <p role="alert">{loadError}</p>;

  return (
    <section>
      <h2>Templates</h2>
      {role === "MANAGER" && (
        <TemplateForm mode="create" onSaved={handleCreated} onUnauthorized={onUnauthorized} />
      )}
      <ul>
        {(templates ?? []).map((template) =>
          editingId === template.id ? (
            <li key={template.id}>
              <TemplateForm
                mode="edit"
                initial={template}
                onSaved={handleUpdated}
                onCancel={() => setEditingId(null)}
                onUnauthorized={onUnauthorized}
              />
            </li>
          ) : (
            <li key={template.id}>
              <span>{template.name}</span> ({template.unit}){" "}
              <span>
                {template.minValue}–{template.maxValue}
              </span>
              {role === "MANAGER" && (
                <button
                  type="button"
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

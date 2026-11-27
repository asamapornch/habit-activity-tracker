const API_URL = import.meta.env.VITE_API_URL ?? "";

export interface CurrentUser {
  id: number;
  email: string;
  role: "MANAGER" | "PARTICIPANT";
}

interface ErrorBody {
  error?: { code: string; message: string };
}

async function readJson(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}));
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  const body = await readJson(res);
  if (!res.ok) {
    throw new Error((body as ErrorBody).error?.message ?? "Login failed.");
  }
  return body as CurrentUser;
}

export async function logout(): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" });
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const res = await fetch(`${API_URL}/auth/me`, { credentials: "include" });
  if (!res.ok) return null;
  return (await readJson(res)) as CurrentUser;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface Template {
  id: number;
  name: string;
  unit: string;
  minValue: number;
  maxValue: number;
  /** Back-dating limit in days (Lab 7, SRS D-12); null = no limit. */
  backdateDays?: number | null;
  createdById: number;
}

export interface TemplateInput {
  name: string;
  unit: string;
  minValue: number;
  maxValue: number;
  backdateDays: number | null;
}

async function apiRequest(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`, { credentials: "include", ...init });
  const body = await readJson(res);
  if (!res.ok) {
    const err = (body as ErrorBody).error;
    throw new ApiError(res.status, err?.message ?? "Request failed.", err?.code);
  }
  return body;
}

export async function listTemplates(): Promise<Template[]> {
  return apiRequest("/templates") as Promise<Template[]>;
}

export async function createTemplate(input: TemplateInput): Promise<Template> {
  return apiRequest("/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }) as Promise<Template>;
}

export async function updateTemplate(id: number, input: TemplateInput): Promise<Template> {
  return apiRequest(`/templates/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }) as Promise<Template>;
}

export interface Goal {
  id: number;
  userId: number;
  templateId: number;
  dailyTarget: number;
  startDate: string;
  endDate: string;
}

export interface GoalInput {
  templateId: number;
  dailyTarget: number;
  startDate: string;
  endDate: string;
}

export interface Entry {
  id: number;
  goalId: number;
  date: string;
  value: number;
}

export interface EntryInput {
  date: string;
  value: number;
}

export interface Progress {
  goalId: number;
  today: string;
  daysElapsed: number;
  daysMet: number;
  progress: number;
}

function postJson(path: string, body: unknown): Promise<unknown> {
  return apiRequest(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const listGoals = () => apiRequest("/goals") as Promise<Goal[]>;
export const createGoal = (input: GoalInput) => postJson("/goals", input) as Promise<Goal>;
export const listEntries = (goalId: number) =>
  apiRequest(`/goals/${goalId}/entries`) as Promise<Entry[]>;
export const recordEntry = (goalId: number, input: EntryInput) =>
  postJson(`/goals/${goalId}/entries`, input) as Promise<Entry>;
export const getProgress = (goalId: number) =>
  apiRequest(`/goals/${goalId}/progress`) as Promise<Progress>;

/** F-06 §3.1: at least one of the two keys, never both omitted. */
export interface GoalRevisionInput {
  dailyTarget?: number;
  endDate?: string;
}

export const reviseGoal = (goalId: number, input: GoalRevisionInput) =>
  apiRequest(`/goals/${goalId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }) as Promise<Goal>;

/** F-09 §3.1: weekdays 0 = Sunday to 6 = Saturday (D-20), time "HH:MM". */
export interface ReminderSchedule {
  goalId: number;
  weekdays: number[];
  time: string;
}

export interface ReminderInput {
  weekdays: number[];
  time: string;
}

export interface UpcomingReminder {
  goalId: number;
  date: string;
  time: string;
}

export const getReminder = (goalId: number) =>
  apiRequest(`/goals/${goalId}/reminder`) as Promise<ReminderSchedule>;
export const putReminder = (goalId: number, input: ReminderInput) =>
  apiRequest(`/goals/${goalId}/reminder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }) as Promise<ReminderSchedule>;
export const deleteReminder = (goalId: number) =>
  apiRequest(`/goals/${goalId}/reminder`, { method: "DELETE" }).then(() => undefined);
export const listUpcomingReminders = () =>
  apiRequest("/reminders/upcoming") as Promise<UpcomingReminder[]>;

export const isUnauthorized = (err: unknown) => err instanceof ApiError && err.status === 401;
export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Request failed.");

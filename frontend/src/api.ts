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
  createdById: number;
}

export interface TemplateInput {
  name: string;
  unit: string;
  minValue: number;
  maxValue: number;
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

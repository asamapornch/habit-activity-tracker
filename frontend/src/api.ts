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

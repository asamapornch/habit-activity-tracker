import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type Handler = (init?: RequestInit) => Response | Promise<Response>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(routes: Record<string, Handler>) {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    for (const [key, handler] of Object.entries(routes)) {
      const [routeMethod, routePath] = key.split(" ");
      if (method === routeMethod && url === `${API_URL}${routePath}`) {
        return handler(init);
      }
    }
    throw new Error(`Unhandled fetch: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("on page load", () => {
  it("shows the login form when GET /auth/me is unauthenticated", async () => {
    mockFetch({
      "GET /auth/me": () =>
        jsonResponse(401, { error: { code: "UNAUTHENTICATED", message: "Authentication required." } }),
    });

    render(<App />);

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
  });

  it("shows the signed-in view directly when GET /auth/me is authenticated", async () => {
    mockFetch({
      "GET /auth/me": () => jsonResponse(200, { id: 1, email: "p1@example.com", role: "PARTICIPANT" }),
    });

    render(<App />);

    expect(await screen.findByText(/p1@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/participant/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log ?out/i })).toBeInTheDocument();
  });
});

describe("login form", () => {
  it("renders email and password fields and a submit button", async () => {
    mockFetch({
      "GET /auth/me": () =>
        jsonResponse(401, { error: { code: "UNAUTHENTICATED", message: "Authentication required." } }),
    });

    render(<App />);

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
  });

  it("shows the server's message on a 401", async () => {
    mockFetch({
      "GET /auth/me": () =>
        jsonResponse(401, { error: { code: "UNAUTHENTICATED", message: "Authentication required." } }),
      "POST /auth/login": () =>
        jsonResponse(401, { error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password." } }),
    });

    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByLabelText(/email/i), "p1@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
  });

  it("shows the signed-in email and role and a Logout button on a successful login", async () => {
    mockFetch({
      "GET /auth/me": () =>
        jsonResponse(401, { error: { code: "UNAUTHENTICATED", message: "Authentication required." } }),
      "POST /auth/login": () => jsonResponse(200, { id: 1, email: "p1@example.com", role: "PARTICIPANT" }),
    });

    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByLabelText(/email/i), "p1@example.com");
    await user.type(screen.getByLabelText(/password/i), "correct-password");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/p1@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/participant/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log ?out/i })).toBeInTheDocument();
  });
});

describe("logout", () => {
  it("calls POST /auth/logout and returns to the form", async () => {
    const logoutHandler = vi.fn(() => jsonResponse(200, { message: "logged out" }));
    mockFetch({
      "GET /auth/me": () => jsonResponse(200, { id: 1, email: "p1@example.com", role: "PARTICIPANT" }),
      "POST /auth/logout": logoutHandler,
    });

    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /log ?out/i }));

    await waitFor(() => expect(logoutHandler).toHaveBeenCalledTimes(1));
    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Templates } from "./Templates";

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

const TEMPLATE_A = { id: 1, name: "Running", unit: "km", minValue: 0, maxValue: 50, createdById: 9 };
const TEMPLATE_B = { id: 2, name: "Cycling", unit: "km", minValue: 0, maxValue: 100, createdById: 9 };

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("loading and error states", () => {
  it("TEST-02.13a shows a loading message while GET /templates is pending", async () => {
    let resolveList: (value: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      resolveList = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending),
    );

    render(<Templates role="PARTICIPANT" onUnauthorized={vi.fn()} />);

    expect(await screen.findByText(/loading/i)).toBeInTheDocument();

    resolveList(jsonResponse(200, [TEMPLATE_A]));

    expect(await screen.findByText(TEMPLATE_A.name)).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it("TEST-02.13b shows an error message if GET /templates fails, not endless loading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network error"))),
    );

    render(<Templates role="PARTICIPANT" onUnauthorized={vi.fn()} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });
});

describe("AC-02.14 / AC-02.15 role-based controls", () => {
  it("TEST-02.14 a Participant sees the list only, with no create or edit controls", async () => {
    mockFetch({ "GET /templates": () => jsonResponse(200, [TEMPLATE_A]) });

    render(<Templates role="PARTICIPANT" onUnauthorized={vi.fn()} />);

    expect(await screen.findByText(TEMPLATE_A.name)).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: /create/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
  });

  it("TEST-02.15 a Manager sees a create form and an edit control for each template", async () => {
    mockFetch({ "GET /templates": () => jsonResponse(200, [TEMPLATE_A, TEMPLATE_B]) });

    render(<Templates role="MANAGER" onUnauthorized={vi.fn()} />);

    expect(await screen.findByText(TEMPLATE_A.name)).toBeInTheDocument();
    expect(screen.getByRole("form", { name: /create/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /edit/i })).toHaveLength(2);
  });
});

describe("AC-02.16 / AC-02.17 create flow", () => {
  it("TEST-02.16 a Manager creating a valid template sends POST /templates and it appears in the list", async () => {
    const createHandler = vi.fn(() => jsonResponse(201, TEMPLATE_A));
    mockFetch({
      "GET /templates": () => jsonResponse(200, []),
      "POST /templates": createHandler,
    });

    const user = userEvent.setup();
    render(<Templates role="MANAGER" onUnauthorized={vi.fn()} />);

    const form = await screen.findByRole("form", { name: /create/i });
    await user.type(within(form).getByLabelText(/name/i), TEMPLATE_A.name);
    await user.type(within(form).getByLabelText(/unit/i), TEMPLATE_A.unit);
    await user.type(within(form).getByLabelText(/min/i), String(TEMPLATE_A.minValue));
    await user.type(within(form).getByLabelText(/max/i), String(TEMPLATE_A.maxValue));
    await user.click(within(form).getByRole("button", { name: /create/i }));

    await waitFor(() => expect(createHandler).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(TEMPLATE_A.name)).toBeInTheDocument();
  });

  it("TEST-02.17 shows the server's validation message verbatim and keeps what was typed", async () => {
    mockFetch({
      "GET /templates": () => jsonResponse(200, []),
      "POST /templates": () =>
        jsonResponse(400, { error: { code: "VALIDATION_ERROR", message: "minValue must be less than maxValue." } }),
    });

    const user = userEvent.setup();
    render(<Templates role="MANAGER" onUnauthorized={vi.fn()} />);

    const form = await screen.findByRole("form", { name: /create/i });
    await user.type(within(form).getByLabelText(/name/i), "Running");
    await user.type(within(form).getByLabelText(/unit/i), "km");
    await user.type(within(form).getByLabelText(/min/i), "50");
    await user.type(within(form).getByLabelText(/max/i), "10");
    await user.click(within(form).getByRole("button", { name: /create/i }));

    expect(await screen.findByText("minValue must be less than maxValue.")).toBeInTheDocument();
    expect(within(form).getByLabelText(/name/i)).toHaveValue("Running");
    expect(within(form).getByLabelText(/min/i)).toHaveValue(50);
    expect(within(form).getByLabelText(/max/i)).toHaveValue(10);
  });
});

describe("AC-02.18 edit flow", () => {
  it("TEST-02.18 pre-fills the form, sends PUT /templates/:id, and the list shows the new values", async () => {
    const updated = { ...TEMPLATE_A, maxValue: 75 };
    const updateHandler = vi.fn(() => jsonResponse(200, updated));
    mockFetch({
      "GET /templates": () => jsonResponse(200, [TEMPLATE_A]),
      [`PUT /templates/${TEMPLATE_A.id}`]: updateHandler,
    });

    const user = userEvent.setup();
    render(<Templates role="MANAGER" onUnauthorized={vi.fn()} />);

    await screen.findByText(TEMPLATE_A.name);
    await user.click(screen.getByRole("button", { name: /edit/i }));

    const form = await screen.findByRole("form", { name: /edit/i });
    expect(within(form).getByLabelText(/name/i)).toHaveValue(TEMPLATE_A.name);
    expect(within(form).getByLabelText(/max/i)).toHaveValue(TEMPLATE_A.maxValue);

    await user.clear(within(form).getByLabelText(/max/i));
    await user.type(within(form).getByLabelText(/max/i), "75");
    await user.click(within(form).getByRole("button", { name: /save/i }));

    await waitFor(() => expect(updateHandler).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/75/)).toBeInTheDocument();
  });
});

describe("AC-02.19 session expiry", () => {
  it("TEST-02.19 calls onUnauthorized when a template request returns 401", async () => {
    mockFetch({
      "GET /templates": () =>
        jsonResponse(401, { error: { code: "UNAUTHENTICATED", message: "Authentication required." } }),
    });
    const onUnauthorized = vi.fn();

    render(<Templates role="PARTICIPANT" onUnauthorized={onUnauthorized} />);

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
  });
});

describe("AC-02.20 in-flight submit", () => {
  it("TEST-02.20 disables the submit button while the create request is in flight", async () => {
    let resolveCreate: (value: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      resolveCreate = resolve;
    });
    mockFetch({
      "GET /templates": () => jsonResponse(200, []),
      "POST /templates": () => pending,
    });

    const user = userEvent.setup();
    render(<Templates role="MANAGER" onUnauthorized={vi.fn()} />);

    const form = await screen.findByRole("form", { name: /create/i });
    await user.type(within(form).getByLabelText(/name/i), TEMPLATE_A.name);
    await user.type(within(form).getByLabelText(/unit/i), TEMPLATE_A.unit);
    await user.type(within(form).getByLabelText(/min/i), String(TEMPLATE_A.minValue));
    await user.type(within(form).getByLabelText(/max/i), String(TEMPLATE_A.maxValue));
    await user.click(within(form).getByRole("button", { name: /create/i }));

    expect(within(form).getByRole("button", { name: /create/i })).toBeDisabled();

    resolveCreate(jsonResponse(201, TEMPLATE_A));
    await screen.findByText(TEMPLATE_A.name);
  });
});

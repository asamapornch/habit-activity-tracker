import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Goals } from "./Goals";
import App from "./App";
import { deferred, errorResponse, jsonResponse, mockFetch, sentBody } from "./test/http";

const T = { id: 1, name: "Running", unit: "km", minValue: 0, maxValue: 50, createdById: 9 };
const T2 = { id: 2, name: "Reading", unit: "minutes", minValue: 0, maxValue: 300, createdById: 9 };
const G1 = { id: 11, userId: 5, templateId: 1, dailyTarget: 5, startDate: "2026-11-01", endDate: "2026-11-30" };
const NEW_GOAL = { id: 12, userId: 5, templateId: 2, dailyTarget: 2.5, startDate: "2026-11-01", endDate: "2026-11-30" };
const PARTICIPANT = { id: 5, email: "p1@example.com", role: "PARTICIPANT" };
const MANAGER = { id: 9, email: "manager@example.com", role: "MANAGER" };

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function fillGoalForm(user: ReturnType<typeof userEvent.setup>, target = "2.5") {
  const form = await screen.findByRole("form", { name: /create goal/i });
  await user.selectOptions(within(form).getByLabelText(/template/i), String(T2.id));
  await user.type(within(form).getByLabelText(/daily target/i), target);
  await user.type(within(form).getByLabelText(/start date/i), "2026-11-01");
  await user.type(within(form).getByLabelText(/end date/i), "2026-11-30");
  return form;
}

describe("AC-03.15 goal list", () => {
  it("TEST-03.15a shows a loading message, then the Participant's goals with template, target and dates", async () => {
    const goals = deferred<Response>();
    mockFetch({
      "GET /templates": () => jsonResponse(200, [T, T2]),
      "GET /goals": () => goals.promise,
    });

    render(<Goals onUnauthorized={vi.fn()} />);

    expect(await screen.findByText(/loading goals/i)).toBeInTheDocument();
    goals.resolve(jsonResponse(200, [G1]));

    const row = (await screen.findByText("Running")).closest("li")!;
    expect(row).toHaveTextContent("5 km");
    expect(row).toHaveTextContent("2026-11-01 → 2026-11-30");
    expect(screen.queryByText(/loading goals/i)).not.toBeInTheDocument();
  });

  it("TEST-03.15b shows an error message if GET /goals fails, not endless loading", async () => {
    mockFetch({
      "GET /templates": () => jsonResponse(200, [T]),
      "GET /goals": () => Promise.reject(new Error("network error")),
    });

    render(<Goals onUnauthorized={vi.fn()} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/loading goals/i)).not.toBeInTheDocument();
  });
});

describe("AC-03.16 Participant-only section", () => {
  it("TEST-03.16 a Participant sees the Goals section; a Manager does not and never calls GET /goals", async () => {
    mockFetch({
      "GET /auth/me": () => jsonResponse(200, PARTICIPANT),
      "GET /templates": () => jsonResponse(200, [T]),
      "GET /goals": () => jsonResponse(200, []),
    });
    render(<App />);
    expect(await screen.findByRole("heading", { name: /^goals$/i })).toBeInTheDocument();
    expect(await screen.findByRole("form", { name: /create goal/i })).toBeInTheDocument();
    cleanup();

    const goalsHandler = vi.fn(() => jsonResponse(200, []));
    mockFetch({
      "GET /auth/me": () => jsonResponse(200, MANAGER),
      "GET /templates": () => jsonResponse(200, [T]),
      "GET /goals": goalsHandler,
    });
    render(<App />);
    expect(await screen.findByText("Running")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^goals$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: /create goal/i })).not.toBeInTheDocument();
    expect(goalsHandler).not.toHaveBeenCalled();
  });
});

describe("AC-03.17 create flow", () => {
  it("TEST-03.17 sends POST /goals with numeric templateId and dailyTarget and date strings; the goal appears", async () => {
    const createHandler = vi.fn((_init?: RequestInit) => jsonResponse(201, NEW_GOAL));
    mockFetch({
      "GET /templates": () => jsonResponse(200, [T, T2]),
      "GET /goals": () => jsonResponse(200, []),
      "POST /goals": createHandler,
    });

    const user = userEvent.setup();
    render(<Goals onUnauthorized={vi.fn()} />);
    const form = await fillGoalForm(user);
    expect(within(form).getByLabelText(/daily target/i)).toHaveAttribute("step", "0.01");
    await user.click(within(form).getByRole("button", { name: /create goal/i }));

    await waitFor(() => expect(createHandler).toHaveBeenCalledTimes(1));
    expect(sentBody(createHandler)).toStrictEqual({
      templateId: 2,
      dailyTarget: 2.5,
      startDate: "2026-11-01",
      endDate: "2026-11-30",
    });
    const row = (await screen.findByText("Reading", { selector: "li *" })).closest("li")!;
    expect(row).toHaveTextContent("2.5 minutes");
  });
});

describe("AC-03.18 server errors", () => {
  it("TEST-03.18a shows a 409 overlap message verbatim and keeps what was typed", async () => {
    const message = "You already have a goal for this template that overlaps these dates.";
    mockFetch({
      "GET /templates": () => jsonResponse(200, [T, T2]),
      "GET /goals": () => jsonResponse(200, []),
      "POST /goals": () => errorResponse(409, "CONFLICT", message),
    });

    const user = userEvent.setup();
    render(<Goals onUnauthorized={vi.fn()} />);
    const form = await fillGoalForm(user);
    await user.click(within(form).getByRole("button", { name: /create goal/i }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(within(form).getByLabelText(/daily target/i)).toHaveValue(2.5);
    expect(within(form).getByLabelText(/start date/i)).toHaveValue("2026-11-01");
    expect(within(form).getByLabelText(/end date/i)).toHaveValue("2026-11-30");
  });

  it("TEST-03.18b shows a 400 range message verbatim, keeps the target and adds no goal", async () => {
    const message = "Daily target must be within the template range.";
    mockFetch({
      "GET /templates": () => jsonResponse(200, [T, T2]),
      "GET /goals": () => jsonResponse(200, []),
      "POST /goals": () => errorResponse(400, "VALIDATION_ERROR", message),
    });

    const user = userEvent.setup();
    render(<Goals onUnauthorized={vi.fn()} />);
    const form = await fillGoalForm(user, "999");
    await user.click(within(form).getByRole("button", { name: /create goal/i }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(within(form).getByLabelText(/daily target/i)).toHaveValue(999);
    expect(screen.queryByRole("button", { name: /^open/i })).not.toBeInTheDocument();
  });
});

describe("AC-03.19 session expiry", () => {
  it("TEST-03.19 rendered through App, a 401 from GET /goals shows the login form", async () => {
    mockFetch({
      "GET /auth/me": () => jsonResponse(200, PARTICIPANT),
      "GET /templates": () => jsonResponse(200, [T]),
      "GET /goals": () => errorResponse(401, "UNAUTHENTICATED", "Authentication required."),
    });

    render(<App />);

    expect(await screen.findByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
  });
});

describe("AC-03.20 in-flight submit", () => {
  it("TEST-03.20 disables the create button while POST /goals is in flight", async () => {
    const create = deferred<Response>();
    mockFetch({
      "GET /templates": () => jsonResponse(200, [T, T2]),
      "GET /goals": () => jsonResponse(200, []),
      "POST /goals": () => create.promise,
    });

    const user = userEvent.setup();
    render(<Goals onUnauthorized={vi.fn()} />);
    const form = await fillGoalForm(user);
    await user.click(within(form).getByRole("button", { name: /create goal/i }));

    expect(within(form).getByRole("button", { name: /create goal/i })).toBeDisabled();
    create.resolve(jsonResponse(201, NEW_GOAL));
    await waitFor(() => expect(within(form).getByRole("button", { name: /create goal/i })).toBeEnabled());
  });
});

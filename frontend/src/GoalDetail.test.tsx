import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoalDetail } from "./GoalDetail";
import { Goals } from "./Goals";
import App from "./App";
import { deferred, errorResponse, jsonResponse, mockFetch, sentBody } from "./test/http";

const T = { id: 1, name: "Running", unit: "km", minValue: 0, maxValue: 50, createdById: 9 };
const G1 = { id: 11, userId: 5, templateId: 1, dailyTarget: 5, startDate: "2026-11-01", endDate: "2026-11-30" };
const PARTICIPANT = { id: 5, email: "p1@example.com", role: "PARTICIPANT" };
const E1 = { id: 101, goalId: 11, date: "2026-11-01", value: 5 };
const E3 = { id: 103, goalId: 11, date: "2026-11-03", value: 6 };
const NEW_ENTRY = { id: 104, goalId: 11, date: "2026-11-03", value: 7.25 };

function progress(daysElapsed: number, daysMet: number, pct: number) {
  return { goalId: 11, today: "2026-11-05", daysElapsed, daysMet, progress: pct };
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDetail() {
  const onBack = vi.fn();
  render(<GoalDetail goal={G1} template={T} onBack={onBack} onUnauthorized={vi.fn()} />);
  return { onBack };
}

function historyDates() {
  const table = screen.getByRole("table", { name: /history/i });
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0].textContent);
}

async function submitEntry(user: ReturnType<typeof userEvent.setup>, date: string, value: string) {
  const form = await screen.findByRole("form", { name: /record entry/i });
  await user.clear(within(form).getByLabelText(/date/i));
  await user.type(within(form).getByLabelText(/date/i), date);
  await user.type(within(form).getByLabelText(/value/i), value);
  await user.click(within(form).getByRole("button", { name: /record/i }));
  return form;
}

describe("AC-04.18 history and progress", () => {
  it("TEST-04.18a shows the history in date order and the progress from the server", async () => {
    mockFetch({
      "GET /goals/11/entries": () => jsonResponse(200, [E1, E3]),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 2, 40)),
    });

    renderDetail();

    expect(await screen.findByText("2 of 5 days met")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(historyDates()).toEqual(["2026-11-01", "2026-11-03"]);
    expect(screen.getByRole("table", { name: /history/i })).toHaveTextContent("6 km");
    const headers = within(screen.getByRole("table", { name: /history/i }))
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual(["Date", "Value"]);
  });

  it("TEST-04.18b (a) shows a loading message while pending; (b) an error message if GET entries fails", async () => {
    const entries = deferred<Response>();
    mockFetch({
      "GET /goals/11/entries": () => entries.promise,
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 0, 0)),
    });
    renderDetail();
    expect(await screen.findByText(/loading goal/i)).toBeInTheDocument();
    entries.resolve(jsonResponse(200, []));
    expect(await screen.findByText("0 of 5 days met")).toBeInTheDocument();
    expect(screen.queryByText(/loading goal/i)).not.toBeInTheDocument();
    cleanup();

    mockFetch({
      "GET /goals/11/entries": () => Promise.reject(new Error("network error")),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 0, 0)),
    });
    renderDetail();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/loading goal/i)).not.toBeInTheDocument();
  });
});

describe("AC-04.19 empty history", () => {
  it("TEST-04.19 shows an empty-history message and 0%", async () => {
    mockFetch({
      "GET /goals/11/entries": () => jsonResponse(200, []),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 0, 0)),
    });

    renderDetail();

    expect(await screen.findByText("No entries yet.")).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});

describe("AC-04.20 record flow", () => {
  it("TEST-04.20a prefills today, sends a numeric value, inserts by date and refreshes progress from the server", async () => {
    const createHandler = vi.fn((_init?: RequestInit) => jsonResponse(201, NEW_ENTRY));
    const progressHandler = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse(200, progress(5, 1, 20)))
      .mockImplementationOnce(() => jsonResponse(200, progress(5, 2, 40)));
    mockFetch({
      "GET /goals/11/entries": () => jsonResponse(200, [E1]),
      "GET /goals/11/progress": progressHandler,
      "POST /goals/11/entries": createHandler,
    });

    const user = userEvent.setup();
    renderDetail();

    const form = await screen.findByRole("form", { name: /record entry/i });
    await waitFor(() => expect(within(form).getByLabelText(/date/i)).toHaveValue("2026-11-05"));
    expect(within(form).getByLabelText(/value/i)).toHaveAttribute("step", "0.01");
    expect(screen.getByText("20%")).toBeInTheDocument();

    await submitEntry(user, "2026-11-03", "7.25");

    await waitFor(() => expect(createHandler).toHaveBeenCalledTimes(1));
    expect(sentBody(createHandler)).toStrictEqual({ date: "2026-11-03", value: 7.25 });
    expect(await screen.findByText("40%")).toBeInTheDocument();
    expect(progressHandler).toHaveBeenCalledTimes(2);
    expect(historyDates()).toEqual(["2026-11-01", "2026-11-03"]);
  });

  it("TEST-04.20c a saved entry stays saved when only the progress refresh fails", async () => {
    const createHandler = vi.fn(() => jsonResponse(201, NEW_ENTRY));
    const progressHandler = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse(200, progress(5, 1, 20)))
      .mockImplementationOnce(() => Promise.reject(new Error("network error")));
    mockFetch({
      "GET /goals/11/entries": () => jsonResponse(200, [E1]),
      "GET /goals/11/progress": progressHandler,
      "POST /goals/11/entries": createHandler,
    });

    const user = userEvent.setup();
    renderDetail();
    await screen.findByText("1 of 5 days met");
    const form = await submitEntry(user, "2026-11-03", "7.25");

    expect(await screen.findByText("Entry saved, but progress could not be refreshed.")).toBeInTheDocument();
    expect(historyDates()).toEqual(["2026-11-01", "2026-11-03"]);
    expect(within(form).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(form).getByLabelText(/value/i)).toHaveValue(null);
    expect(createHandler).toHaveBeenCalledTimes(1);
  });

  it("TEST-04.20b Open on a goal shows its goal screen and Back returns to the goal list", async () => {
    mockFetch({
      "GET /templates": () => jsonResponse(200, [T]),
      "GET /goals": () => jsonResponse(200, [G1]),
      "GET /goals/11/entries": () => jsonResponse(200, [E1]),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 1, 20)),
    });

    const user = userEvent.setup();
    render(<Goals onUnauthorized={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: /open running goal/i }));
    expect(await screen.findByText("1 of 5 days met")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /history/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /back to goals/i }));
    expect(await screen.findByRole("button", { name: /open running goal/i })).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: /history/i })).not.toBeInTheDocument();
  });
});

describe("AC-04.21 server errors", () => {
  it("TEST-04.21a shows a 409 duplicate message verbatim, keeps the form and leaves the history unchanged", async () => {
    const message = "An entry already exists for this date.";
    mockFetch({
      "GET /goals/11/entries": () => jsonResponse(200, [E1]),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 1, 20)),
      "POST /goals/11/entries": () => errorResponse(409, "CONFLICT", message),
    });

    const user = userEvent.setup();
    renderDetail();
    await screen.findByText("1 of 5 days met");
    const form = await submitEntry(user, "2026-11-01", "4");

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(within(form).getByLabelText(/date/i)).toHaveValue("2026-11-01");
    expect(within(form).getByLabelText(/value/i)).toHaveValue(4);
    expect(historyDates()).toEqual(["2026-11-01"]);
  });

  it("TEST-04.21b shows a 400 future-date message verbatim and keeps the form", async () => {
    const message = "Entry date must not be in the future.";
    mockFetch({
      "GET /goals/11/entries": () => jsonResponse(200, []),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 0, 0)),
      "POST /goals/11/entries": () => errorResponse(400, "VALIDATION_ERROR", message),
    });

    const user = userEvent.setup();
    renderDetail();
    await screen.findByText("0 of 5 days met");
    const form = await submitEntry(user, "2026-11-20", "3");

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(within(form).getByLabelText(/date/i)).toHaveValue("2026-11-20");
    expect(within(form).getByLabelText(/value/i)).toHaveValue(3);
  });
});

describe("AC-04.22 session expiry", () => {
  it("TEST-04.22 rendered through App, a 401 from GET progress shows the login form", async () => {
    mockFetch({
      "GET /auth/me": () => jsonResponse(200, PARTICIPANT),
      "GET /templates": () => jsonResponse(200, [T]),
      "GET /goals": () => jsonResponse(200, [G1]),
      "GET /goals/11/entries": () => jsonResponse(200, []),
      "GET /goals/11/progress": () => errorResponse(401, "UNAUTHENTICATED", "Authentication required."),
    });

    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /open running goal/i }));

    expect(await screen.findByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
  });
});

describe("AC-04.23 in-flight submit", () => {
  it("TEST-04.23 disables the record button while POST entries is in flight", async () => {
    const create = deferred<Response>();
    mockFetch({
      "GET /goals/11/entries": () => jsonResponse(200, []),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 0, 0)),
      "POST /goals/11/entries": () => create.promise,
    });

    const user = userEvent.setup();
    renderDetail();
    await screen.findByText("0 of 5 days met");
    const form = await submitEntry(user, "2026-11-03", "6");

    expect(within(form).getByRole("button", { name: /record/i })).toBeDisabled();
    create.resolve(jsonResponse(201, E3));
    await waitFor(() => expect(within(form).getByRole("button", { name: /record/i })).toBeEnabled());
  });
});

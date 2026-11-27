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
const MANAGER = { id: 9, email: "manager@example.com", role: "MANAGER" };
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

async function openRevise(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /revise goal/i }));
  return screen.findByRole("form", { name: /revise goal/i });
}

describe("AC-06.14 revise form prefilled (TEST-06.15)", () => {
  it("TEST-06.15 opens a form prefilled with the currently effective dailyTarget and endDate", async () => {
    mockFetch({
      "GET /goals/11/entries": () => jsonResponse(200, []),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 0, 0)),
    });
    const user = userEvent.setup();
    renderDetail();
    await screen.findByText("0 of 5 days met");

    const form = await openRevise(user);
    expect(within(form).getByLabelText(/daily target/i)).toHaveValue(5);
    expect(within(form).getByLabelText(/end date/i)).toHaveValue("2026-11-30");
  });
});

describe("AC-06.15 revise sends only the changed field (TEST-06.16)", () => {
  it("TEST-06.16a changing only the target sends { dailyTarget } alone and updates the screen", async () => {
    const reviseHandler = vi.fn(() =>
      jsonResponse(200, { id: 11, userId: 5, templateId: 1, dailyTarget: 8, startDate: "2026-11-01", endDate: "2026-11-30" }),
    );
    mockFetch({
      "GET /goals/11/entries": () => jsonResponse(200, []),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 0, 0)),
      "PATCH /goals/11": reviseHandler,
    });
    const user = userEvent.setup();
    renderDetail();
    await screen.findByText("0 of 5 days met");

    const form = await openRevise(user);
    await user.clear(within(form).getByLabelText(/daily target/i));
    await user.type(within(form).getByLabelText(/daily target/i), "8");
    await user.click(within(form).getByRole("button", { name: /save/i }));

    await waitFor(() => expect(reviseHandler).toHaveBeenCalledTimes(1));
    expect(sentBody(reviseHandler)).toStrictEqual({ dailyTarget: 8 });
    expect(screen.queryByRole("form", { name: /revise goal/i })).not.toBeInTheDocument();
    expect(await screen.findByText(/8 km a day/i)).toBeInTheDocument();
  });

  it("TEST-06.16b changing only the end date sends { endDate } alone and updates the screen", async () => {
    const reviseHandler = vi.fn(() =>
      jsonResponse(200, { id: 11, userId: 5, templateId: 1, dailyTarget: 5, startDate: "2026-11-01", endDate: "2026-12-15" }),
    );
    mockFetch({
      "GET /goals/11/entries": () => jsonResponse(200, []),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 0, 0)),
      "PATCH /goals/11": reviseHandler,
    });
    const user = userEvent.setup();
    renderDetail();
    await screen.findByText("0 of 5 days met");

    const form = await openRevise(user);
    await user.clear(within(form).getByLabelText(/end date/i));
    await user.type(within(form).getByLabelText(/end date/i), "2026-12-15");
    await user.click(within(form).getByRole("button", { name: /save/i }));

    await waitFor(() => expect(reviseHandler).toHaveBeenCalledTimes(1));
    expect(sentBody(reviseHandler)).toStrictEqual({ endDate: "2026-12-15" });
    expect(await screen.findByText(/2026-12-15/)).toBeInTheDocument();
  });
});

describe("AC-06.16 revise server error (TEST-06.17)", () => {
  it("TEST-06.17 shows the server's message verbatim and keeps the form open with what was typed", async () => {
    const message = "Daily target must be within the template range.";
    mockFetch({
      "GET /goals/11/entries": () => jsonResponse(200, []),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 0, 0)),
      "PATCH /goals/11": () => errorResponse(400, "VALIDATION_ERROR", message),
    });
    const user = userEvent.setup();
    renderDetail();
    await screen.findByText("0 of 5 days met");

    const form = await openRevise(user);
    await user.clear(within(form).getByLabelText(/daily target/i));
    await user.type(within(form).getByLabelText(/daily target/i), "999");
    await user.click(within(form).getByRole("button", { name: /save/i }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(within(form).getByLabelText(/daily target/i)).toHaveValue(999);
  });
});

describe("AC-06.17 in-flight revise submit (TEST-06.18)", () => {
  it("TEST-06.18 disables the Save button while PATCH is in flight", async () => {
    const revise = deferred<Response>();
    mockFetch({
      "GET /goals/11/entries": () => jsonResponse(200, []),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 0, 0)),
      "PATCH /goals/11": () => revise.promise,
    });
    const user = userEvent.setup();
    renderDetail();
    await screen.findByText("0 of 5 days met");

    const form = await openRevise(user);
    await user.clear(within(form).getByLabelText(/daily target/i));
    await user.type(within(form).getByLabelText(/daily target/i), "8");
    await user.click(within(form).getByRole("button", { name: /save/i }));

    expect(within(form).getByRole("button", { name: /save/i })).toBeDisabled();
    revise.resolve(
      jsonResponse(200, { id: 11, userId: 5, templateId: 1, dailyTarget: 8, startDate: "2026-11-01", endDate: "2026-11-30" }),
    );
    await waitFor(() => expect(screen.queryByRole("form", { name: /revise goal/i })).not.toBeInTheDocument());
  });
});

describe("AC-06.18 revise session expiry (TEST-06.19)", () => {
  it("TEST-06.19 rendered through App, a 401 from PATCH returns to the login form", async () => {
    mockFetch({
      "GET /auth/me": () => jsonResponse(200, PARTICIPANT),
      "GET /templates": () => jsonResponse(200, [T]),
      "GET /goals": () => jsonResponse(200, [G1]),
      "GET /goals/11/entries": () => jsonResponse(200, []),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 0, 0)),
      "PATCH /goals/11": () => errorResponse(401, "UNAUTHENTICATED", "Authentication required."),
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /open running goal/i }));
    await screen.findByText("0 of 5 days met");

    const form = await openRevise(user);
    await user.clear(within(form).getByLabelText(/daily target/i));
    await user.type(within(form).getByLabelText(/daily target/i), "8");
    await user.click(within(form).getByRole("button", { name: /save/i }));

    expect(await screen.findByLabelText(/^email/i)).toBeInTheDocument();
  });
});

describe("AC-06.19 revise control visibility (TEST-06.20)", () => {
  it("TEST-06.20 a Participant opening a goal sees Revise goal; a Manager never calls GET /goals at all", async () => {
    mockFetch({
      "GET /auth/me": () => jsonResponse(200, PARTICIPANT),
      "GET /templates": () => jsonResponse(200, [T]),
      "GET /goals": () => jsonResponse(200, [G1]),
      "GET /goals/11/entries": () => jsonResponse(200, []),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 0, 0)),
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /open running goal/i }));
    expect(await screen.findByRole("button", { name: /revise goal/i })).toBeInTheDocument();
    cleanup();

    // AC-03.16's own guarantee: a Manager never sees the Goals section or
    // calls GET /goals, so there is no path to this screen at all for them.
    const goalsHandler = vi.fn(() => jsonResponse(200, []));
    mockFetch({
      "GET /auth/me": () => jsonResponse(200, MANAGER),
      "GET /templates": () => jsonResponse(200, [T]),
      "GET /goals": goalsHandler,
    });
    render(<App />);
    await screen.findByRole("heading", { name: /templates/i });
    expect(screen.queryByRole("button", { name: /revise goal/i })).not.toBeInTheDocument();
    expect(goalsHandler).not.toHaveBeenCalled();
  });
});

function summaryWindow(start: string, end: string, daysRecorded: number, daysMet: number, total: number, average: number) {
  return { start, end, daysRecorded, daysMet, total, average };
}

const SUMMARY = {
  goalId: 11,
  week: summaryWindow("2026-11-09", "2026-11-12", 3, 2, 15, 5),
  month: summaryWindow("2026-11-01", "2026-11-12", 4, 3, 25, 6.25),
};

describe("AC-08.10 summary panel (TEST-08.10)", () => {
  it("TEST-08.10a shows a loading message first, then both windows' figures", async () => {
    const deferredSummary = deferred<Response>();
    mockFetch({
      "GET /goals/11/entries": () => jsonResponse(200, []),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 0, 0)),
      "GET /goals/11/summary": () => deferredSummary.promise,
    });
    renderDetail();
    expect(await screen.findByText(/loading summary/i)).toBeInTheDocument();
    deferredSummary.resolve(jsonResponse(200, SUMMARY));

    const panel = await screen.findByRole("region", { name: /summary/i });
    expect(within(panel).getByText(/3 days recorded, 2 met, total 15, average 5/i)).toBeInTheDocument();
    expect(within(panel).getByText(/4 days recorded, 3 met, total 25, average 6.25/i)).toBeInTheDocument();
    expect(screen.queryByText(/loading summary/i)).not.toBeInTheDocument();
  });

  it("TEST-08.10b (also AC-08.13) an error fetching the summary shows an alert, not a stuck loading state", async () => {
    mockFetch({
      "GET /goals/11/entries": () => jsonResponse(200, []),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 0, 0)),
      "GET /goals/11/summary": () => Promise.reject(new Error("network error")),
    });
    renderDetail();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/loading summary/i)).not.toBeInTheDocument();
  });
});

describe("AC-08.11 window date-range labels (TEST-08.11)", () => {
  it("TEST-08.11 each window shows its start-to-end date range", async () => {
    mockFetch({
      "GET /goals/11/entries": () => jsonResponse(200, []),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 0, 0)),
      "GET /goals/11/summary": () => jsonResponse(200, SUMMARY),
    });
    renderDetail();
    const panel = await screen.findByRole("region", { name: /summary/i });
    expect(within(panel).getByText("2026-11-09 to 2026-11-12")).toBeInTheDocument();
    expect(within(panel).getByText("2026-11-01 to 2026-11-12")).toBeInTheDocument();
  });
});

describe("AC-08.12 empty window (TEST-08.12)", () => {
  it("TEST-08.12 a window with daysRecorded 0 shows an explicit empty message", async () => {
    mockFetch({
      "GET /goals/11/entries": () => jsonResponse(200, []),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 0, 0)),
      "GET /goals/11/summary": () =>
        jsonResponse(200, {
          goalId: 11,
          week: summaryWindow("2026-11-09", "2026-11-12", 0, 0, 0, 0),
          month: SUMMARY.month,
        }),
    });
    renderDetail();
    const panel = await screen.findByRole("region", { name: /summary/i });
    expect(within(panel).getByText("No entries recorded this week.")).toBeInTheDocument();
    expect(within(panel).queryByText(/0 days recorded/i)).not.toBeInTheDocument();
  });
});

describe("AC-08.13 summary session expiry (TEST-08.13)", () => {
  it("TEST-08.13 rendered through App, a 401 from GET summary returns to the login form", async () => {
    mockFetch({
      "GET /auth/me": () => jsonResponse(200, PARTICIPANT),
      "GET /templates": () => jsonResponse(200, [T]),
      "GET /goals": () => jsonResponse(200, [G1]),
      "GET /goals/11/entries": () => jsonResponse(200, []),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 0, 0)),
      "GET /goals/11/summary": () => errorResponse(401, "UNAUTHENTICATED", "Authentication required."),
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /open running goal/i }));

    expect(await screen.findByLabelText(/^email/i)).toBeInTheDocument();
  });
});

describe("AC-08.14 summary panel visibility (TEST-08.14)", () => {
  it("TEST-08.14 a Participant opening a goal sees the summary panel; a Manager has no path to it", async () => {
    mockFetch({
      "GET /auth/me": () => jsonResponse(200, PARTICIPANT),
      "GET /templates": () => jsonResponse(200, [T]),
      "GET /goals": () => jsonResponse(200, [G1]),
      "GET /goals/11/entries": () => jsonResponse(200, []),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 0, 0)),
      "GET /goals/11/summary": () => jsonResponse(200, SUMMARY),
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: /open running goal/i }));
    expect(await screen.findByRole("region", { name: /summary/i })).toBeInTheDocument();
    cleanup();

    const goalsHandler = vi.fn(() => jsonResponse(200, []));
    mockFetch({
      "GET /auth/me": () => jsonResponse(200, MANAGER),
      "GET /templates": () => jsonResponse(200, [T]),
      "GET /goals": goalsHandler,
    });
    render(<App />);
    await screen.findByRole("heading", { name: /templates/i });
    expect(screen.queryByRole("region", { name: /summary/i })).not.toBeInTheDocument();
    expect(goalsHandler).not.toHaveBeenCalled();
  });
});

describe("AC-08.15 summary refetch after a revision (TEST-08.15)", () => {
  it("TEST-08.15 a successful revision triggers a second GET summary", async () => {
    const summaryHandler = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse(200, SUMMARY))
      .mockImplementationOnce(() =>
        jsonResponse(200, { ...SUMMARY, week: summaryWindow("2026-11-09", "2026-11-12", 3, 3, 24, 8) }),
      );
    mockFetch({
      "GET /goals/11/entries": () => jsonResponse(200, []),
      "GET /goals/11/progress": () => jsonResponse(200, progress(5, 0, 0)),
      "GET /goals/11/summary": summaryHandler,
      "PATCH /goals/11": () =>
        jsonResponse(200, { id: 11, userId: 5, templateId: 1, dailyTarget: 8, startDate: "2026-11-01", endDate: "2026-11-30" }),
    });
    const user = userEvent.setup();
    renderDetail();
    await screen.findByRole("region", { name: /summary/i });

    const form = await openRevise(user);
    await user.clear(within(form).getByLabelText(/daily target/i));
    await user.type(within(form).getByLabelText(/daily target/i), "8");
    await user.click(within(form).getByRole("button", { name: /save/i }));

    await waitFor(() => expect(summaryHandler).toHaveBeenCalledTimes(2));
    const panel = await screen.findByRole("region", { name: /summary/i });
    expect(within(panel).getByText(/3 days recorded, 3 met, total 24, average 8/i)).toBeInTheDocument();
  });
});

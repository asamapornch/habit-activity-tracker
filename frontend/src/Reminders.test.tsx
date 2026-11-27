import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoalDetail } from "./GoalDetail";
import { Goals } from "./Goals";
import { errorResponse, jsonResponse, mockFetch, sentBody, type Handler } from "./test/http";

// F-09 v1.2 §3.3 and §5.2: the goal screen's Reminder panel and the Goals screen's
// Upcoming reminders panel. Goal G1 (template Running), today 2026-11-10.

const T = { id: 1, name: "Running", unit: "km", minValue: 0, maxValue: 50, createdById: 9 };
const G1 = { id: 11, userId: 5, templateId: 1, dailyTarget: 5, startDate: "2026-11-01", endDate: "2026-11-30" };
const PROGRESS = { goalId: 11, today: "2026-11-10", daysElapsed: 10, daysMet: 0, progress: 0 };
const MWF = { goalId: 11, weekdays: [1, 3, 5], time: "08:00" };
const NO_SCHEDULE: Handler = () => errorResponse(404, "NOT_FOUND", "No reminder schedule set for this goal.");
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockGoalScreen(reminderRoutes: Record<string, Handler>) {
  return mockFetch({
    "GET /goals/11/entries": () => jsonResponse(200, []),
    "GET /goals/11/progress": () => jsonResponse(200, PROGRESS),
    ...reminderRoutes,
  });
}

function renderDetail() {
  const onUnauthorized = vi.fn();
  render(<GoalDetail goal={G1} template={T} onBack={vi.fn()} onUnauthorized={onUnauthorized} />);
  return { onUnauthorized };
}

const reminderPanel = () => screen.findByRole("region", { name: "Reminder" });

describe("AC-09.14 Reminder panel shows the current schedule", () => {
  it("TEST-09.14a no schedule (404) shows 'No reminder set.' and no Remove button", async () => {
    mockGoalScreen({ "GET /goals/11/reminder": NO_SCHEDULE });
    renderDetail();

    const panel = await reminderPanel();
    expect(await within(panel).findByText("No reminder set.")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });

  it("TEST-09.14b a schedule shows its weekday names Sun to Sat and the time", async () => {
    mockGoalScreen({ "GET /goals/11/reminder": () => jsonResponse(200, MWF) });
    renderDetail();

    const panel = await reminderPanel();
    expect(await within(panel).findByText("Mon, Wed, Fri at 08:00")).toBeInTheDocument();
  });
});

describe("AC-09.15 saving a schedule", () => {
  it("TEST-09.15 Save sends the ticked weekdays as ascending integers and HH:MM, then shows the saved schedule", async () => {
    const putHandler = vi.fn<Handler>(() => jsonResponse(200, { goalId: 11, weekdays: [1, 3], time: "07:30" }));
    mockGoalScreen({ "GET /goals/11/reminder": NO_SCHEDULE, "PUT /goals/11/reminder": putHandler });
    const user = userEvent.setup();
    renderDetail();

    const panel = await reminderPanel();
    await within(panel).findByText("No reminder set.");
    await user.click(within(panel).getByRole("checkbox", { name: "Wed" }));
    await user.click(within(panel).getByRole("checkbox", { name: "Mon" }));
    await user.type(within(panel).getByLabelText(/time/i), "07:30");
    await user.click(within(panel).getByRole("button", { name: /save/i }));

    await waitFor(() => expect(putHandler).toHaveBeenCalledTimes(1));
    expect(sentBody(putHandler)).toStrictEqual({ weekdays: [1, 3], time: "07:30" });
    expect(await within(panel).findByText("Mon, Wed at 07:30")).toBeInTheDocument();
  });

  it("TEST-09.15b the form is pre-filled from an existing schedule", async () => {
    mockGoalScreen({ "GET /goals/11/reminder": () => jsonResponse(200, MWF) });
    renderDetail();

    const panel = await reminderPanel();
    await within(panel).findByText("Mon, Wed, Fri at 08:00");
    const ticked = DAYS.filter((day) => (within(panel).getByRole("checkbox", { name: day }) as HTMLInputElement).checked);
    expect(ticked).toEqual(["Mon", "Wed", "Fri"]);
    expect(within(panel).getByLabelText(/time/i)).toHaveValue("08:00");
  });
});

describe("AC-09.16 a rejected save", () => {
  it("TEST-09.16 a 400 shows the server's message as returned and the form keeps what was typed", async () => {
    const message = "At least one weekday is required.";
    const putHandler = vi.fn<Handler>(() => errorResponse(400, "VALIDATION_ERROR", message));
    mockGoalScreen({ "GET /goals/11/reminder": NO_SCHEDULE, "PUT /goals/11/reminder": putHandler });
    const user = userEvent.setup();
    renderDetail();

    const panel = await reminderPanel();
    await within(panel).findByText("No reminder set.");
    await user.type(within(panel).getByLabelText(/time/i), "09:00");
    await user.click(within(panel).getByRole("button", { name: /save/i }));

    expect(await within(panel).findByText(message)).toBeInTheDocument();
    expect(sentBody(putHandler)).toStrictEqual({ weekdays: [], time: "09:00" });
    expect(within(panel).getByLabelText(/time/i)).toHaveValue("09:00");
    expect(within(panel).getByText("No reminder set.")).toBeInTheDocument();
  });
});

describe("AC-09.17 removing a schedule", () => {
  it("TEST-09.17 Remove sends DELETE, then the panel shows 'No reminder set.' without Remove", async () => {
    const deleteHandler = vi.fn<Handler>(() => new Response(null, { status: 204 }));
    mockGoalScreen({ "GET /goals/11/reminder": () => jsonResponse(200, MWF), "DELETE /goals/11/reminder": deleteHandler });
    const user = userEvent.setup();
    renderDetail();

    const panel = await reminderPanel();
    await within(panel).findByText("Mon, Wed, Fri at 08:00");
    await user.click(within(panel).getByRole("button", { name: /remove/i }));

    await waitFor(() => expect(deleteHandler).toHaveBeenCalledTimes(1));
    expect(await within(panel).findByText("No reminder set.")).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
  });
});

describe("AC-09.18 Upcoming reminders panel on the Goals screen", () => {
  function mockGoalsScreen(upcoming: unknown) {
    return mockFetch({
      "GET /templates": () => jsonResponse(200, [T]),
      "GET /goals": () => jsonResponse(200, [G1]),
      "GET /reminders/upcoming": () => jsonResponse(200, upcoming),
    });
  }

  it("TEST-09.18a lists each instance as date, time and goal name in the server's order", async () => {
    mockGoalsScreen([
      { goalId: 11, date: "2026-11-11", time: "08:00" },
      { goalId: 11, date: "2026-11-13", time: "08:00" },
    ]);
    render(<Goals onUnauthorized={vi.fn()} />);

    const table = await screen.findByRole("table", { name: /upcoming reminders/i });
    const rows = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent));
    expect(rows).toEqual([
      ["2026-11-11", "08:00", "Running"],
      ["2026-11-13", "08:00", "Running"],
    ]);
  });

  it("TEST-09.18b an empty list shows 'No reminders in the next 7 days.'", async () => {
    mockGoalsScreen([]);
    render(<Goals onUnauthorized={vi.fn()} />);

    expect(await screen.findByText("No reminders in the next 7 days.")).toBeInTheDocument();
  });
});

describe("AC-09.19 a 401 from a reminder request", () => {
  it("TEST-09.19 the Reminder panel's GET returning 401 calls onUnauthorized", async () => {
    mockGoalScreen({
      "GET /goals/11/reminder": () => errorResponse(401, "UNAUTHENTICATED", "Authentication required."),
    });
    const { onUnauthorized } = renderDetail();

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
  });
});

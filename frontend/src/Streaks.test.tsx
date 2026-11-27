import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GoalDetail } from "./GoalDetail";
import { errorResponse, jsonResponse, mockFetch, type Handler } from "./test/http";

// F-07 v1.5 §3.3 and §5.2: the goal screen's Streaks panel. Goal G1 (template Running), today 2026-11-10.

const T = { id: 1, name: "Running", unit: "km", minValue: 0, maxValue: 50, createdById: 9 };
const G1 = { id: 11, userId: 5, templateId: 1, dailyTarget: 5, startDate: "2026-11-01", endDate: "2026-11-30" };
const PROGRESS = { goalId: 11, today: "2026-11-10", daysElapsed: 10, daysMet: 0, progress: 0 };
const streaks = (currentStreak: number, longestStreak: number) => ({ goalId: 11, currentStreak, longestStreak });
// F-08's Summary panel (merged in #85) loads on the same goal screen; mocked so it renders normally.
const EMPTY_WINDOW = { daysRecorded: 0, daysMet: 0, total: 0, average: 0 };
const SUMMARY = {
  goalId: 11,
  week: { start: "2026-11-09", end: "2026-11-10", ...EMPTY_WINDOW },
  month: { start: "2026-11-01", end: "2026-11-10", ...EMPTY_WINDOW },
};

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockGoalScreen(extra: Record<string, Handler>) {
  return mockFetch({
    "GET /goals/11/entries": () => jsonResponse(200, []),
    "GET /goals/11/progress": () => jsonResponse(200, PROGRESS),
    "GET /goals/11/summary": () => jsonResponse(200, SUMMARY),
    ...extra,
  });
}

function renderDetail() {
  const onUnauthorized = vi.fn();
  render(<GoalDetail goal={G1} template={T} onBack={vi.fn()} onUnauthorized={onUnauthorized} />);
  return { onUnauthorized };
}

const streaksPanel = () => screen.findByRole("region", { name: "Streaks" });

describe("AC-07.14 Streaks panel", () => {
  it("TEST-07.14a shows the current and longest streak from the server", async () => {
    mockGoalScreen({ "GET /goals/11/streaks": () => jsonResponse(200, streaks(3, 5)) });
    renderDetail();

    const panel = await streaksPanel();
    expect(await within(panel).findByText("Current streak: 3 days")).toBeInTheDocument();
    expect(within(panel).getByText("Longest streak: 5 days")).toBeInTheDocument();
  });

  it("TEST-07.14b uses 'day' for 1", async () => {
    mockGoalScreen({ "GET /goals/11/streaks": () => jsonResponse(200, streaks(1, 1)) });
    renderDetail();

    const panel = await streaksPanel();
    expect(await within(panel).findByText("Current streak: 1 day")).toBeInTheDocument();
    expect(within(panel).getByText("Longest streak: 1 day")).toBeInTheDocument();
  });
});

describe("AC-07.15 refresh after an entry", () => {
  it("TEST-07.15 recording an entry loads the streaks again and shows the new numbers", async () => {
    const streaksHandler = vi
      .fn<Handler>()
      .mockImplementationOnce(() => jsonResponse(200, streaks(0, 0)))
      .mockImplementation(() => jsonResponse(200, streaks(1, 1)));
    mockGoalScreen({
      "GET /goals/11/streaks": streaksHandler,
      "POST /goals/11/entries": () => jsonResponse(201, { id: 101, goalId: 11, date: "2026-11-10", value: 6 }),
    });
    const user = userEvent.setup();
    renderDetail();

    const panel = await streaksPanel();
    await within(panel).findByText("Current streak: 0 days");
    const form = screen.getByRole("form", { name: /record entry/i });
    await user.type(within(form).getByLabelText(/value/i), "6");
    await user.click(within(form).getByRole("button", { name: /record/i }));

    await waitFor(() => expect(streaksHandler).toHaveBeenCalledTimes(2));
    expect(await within(panel).findByText("Current streak: 1 day")).toBeInTheDocument();
  });
});

describe("AC-07.16 a failed load stays inside the panel", () => {
  it("TEST-07.16 streaks GET 500: panel message, no alert, the goal screen still works", async () => {
    mockGoalScreen({ "GET /goals/11/streaks": () => errorResponse(500, "INTERNAL", "Something went wrong.") });
    renderDetail();

    const panel = await streaksPanel();
    expect(await within(panel).findByText("Could not load streaks.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("0 of 10 days met")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: /record entry/i })).toBeInTheDocument();
  });
});

describe("AC-07.17 a 401 from the streaks request", () => {
  it("TEST-07.17 calls onUnauthorized", async () => {
    mockGoalScreen({
      "GET /goals/11/streaks": () => errorResponse(401, "UNAUTHENTICATED", "Authentication required."),
    });
    const { onUnauthorized } = renderDetail();

    await waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1));
  });
});

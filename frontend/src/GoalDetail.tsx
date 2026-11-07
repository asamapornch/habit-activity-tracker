// Stub: goal screen is not implemented yet (F-04 v1.2 red phase).
import type { Template } from "./api";

export interface Goal {
  id: number;
  userId: number;
  templateId: number;
  dailyTarget: number;
  startDate: string;
  endDate: string;
}

export function GoalDetail(_props: {
  goal: Goal;
  template: Template;
  onBack: () => void;
  onUnauthorized: () => void;
}) {
  return null;
}

// Shared runtime values stay independent of Zod and Node for the renderer.
export const executionStatuses = [
  "unknown",
  "backlog",
  "in-progress",
  "partial",
  "blocked",
  "completed",
  "future",
] as const;
export const workPriorities = [
  "unknown",
  "low",
  "medium",
  "high",
  "urgent",
] as const;
export const workRisks = [
  "unknown",
  "low",
  "medium",
  "high",
  "critical",
] as const;

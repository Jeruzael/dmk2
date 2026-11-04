import type { Entity } from "../../core/schema.js";
import { stateLabels, taskCode, workData } from "./model.js";
export type OpenTask = (
  task: Entity,
  element?: HTMLElement,
  section?: "Details" | "Acceptance" | "Checklist" | "Links & History",
) => void;
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`work-status ${status}`} data-status={status}>
      {stateLabels[status] ?? status}
    </span>
  );
}
export function TaskIdentity({ task }: { task: Entity }) {
  const d = workData(task);
  return (
    <span
      className="work-code"
      title={`${d.sourceNamespace ? d.sourceNamespace + ":" : ""}${d.sourceIdentifier || task.id}`}
    >
      {taskCode(task)}
    </span>
  );
}
export function PlanningBadge({
  kind,
  value,
}: {
  kind: "Priority" | "Risk";
  value?: string;
}) {
  return value && value !== "unknown" ? (
    <span className={`work-planning ${value}`}>
      {kind}: {value}
    </span>
  ) : null;
}
export function WorkEmpty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="work-empty">
      <span aria-hidden="true">◇</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Pagination({
  total,
  page,
  size,
  onPage,
}: {
  total: number;
  page: number;
  size: number;
  onPage: (n: number) => void;
}) {
  const last = Math.max(0, Math.ceil(total / size) - 1);
  const current = Math.min(page, last);
  return (
    <div className="work-pagination">
      <span>
        {total
          ? `${current * size + 1}–${Math.min(total, (current + 1) * size)} of ${total}`
          : "0 work items"}
      </span>
      <button
        onClick={() => onPage(Math.max(0, current - 1))}
        disabled={current === 0}
      >
        Previous
      </button>
      <button
        onClick={() => onPage(Math.min(last, current + 1))}
        disabled={current === last}
      >
        Next
      </button>
    </div>
  );
}

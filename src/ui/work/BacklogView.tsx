import type { Entity } from "../../core/schema.js";
import { workData } from "./model.js";
import {
  Pagination,
  StatusBadge,
  TaskIdentity,
  WorkEmpty,
  type OpenTask,
} from "./shared.js";
export function BacklogView({
  tasks,
  records,
  page,
  onPage,
  openTask,
}: {
  tasks: Entity[];
  records: Entity[];
  page: number;
  onPage: (n: number) => void;
  openTask: OpenTask;
}) {
  const byId = new Map(records.map((r) => [r.id, r]));
  const size = 50;
  const current = Math.min(
    page,
    Math.max(0, Math.ceil(tasks.length / size) - 1),
  );
  if (!tasks.length)
    return (
      <WorkEmpty title="No matching work items">
        Adjust the filters or create a work item.
      </WorkEmpty>
    );
  return (
    <>
      <div
        className="work-table-scroll"
        tabIndex={0}
        aria-label="Scrollable work backlog"
      >
        <table className="work-table">
          <thead>
            <tr>
              {[
                "ID / Title",
                "Parent or group",
                "Priority",
                "Risk",
                "Execution status",
                "Source status",
                "Sprint",
              ].map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.slice(current * size, (current + 1) * size).map((task) => {
              const d = workData(task);
              const name = (id: string | null | undefined) =>
                id
                  ? String(byId.get(id)?.data.title ?? "Missing record")
                  : "Not set";
              return (
                <tr
                  key={task.id}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest("button"))
                      openTask(task, e.currentTarget.querySelector("button")!);
                  }}
                >
                  <td>
                    <TaskIdentity task={task} />
                    <button
                      className="work-title-button"
                      title={d.title}
                      onClick={(e) => openTask(task, e.currentTarget)}
                    >
                      {d.title}
                    </button>
                    {d.owner && <small>Owner: {d.owner}</small>}
                  </td>
                  <td title={name(d.parentId)}>{name(d.parentId)}</td>
                  <td>
                    {d.priority && d.priority !== "unknown"
                      ? d.priority
                      : "Not set"}
                  </td>
                  <td>{d.risk && d.risk !== "unknown" ? d.risk : "Unknown"}</td>
                  <td>
                    <StatusBadge status={d.executionStatus} />
                  </td>
                  <td>
                    <span className="work-source-chip">
                      {d.sourceStatus || "Not set"}
                    </span>
                  </td>
                  <td title={name(d.sprintId)}>{name(d.sprintId)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        total={tasks.length}
        page={current}
        size={size}
        onPage={onPage}
      />
    </>
  );
}

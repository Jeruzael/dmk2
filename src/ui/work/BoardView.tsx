import { useState } from "react";
import type { Entity } from "../../core/schema.js";
import { executionStatuses } from "../../core/work-values.js";
import { stateLabels, workData } from "./model.js";
import {
  PlanningBadge,
  StatusBadge,
  TaskIdentity,
  type OpenTask,
} from "./shared.js";
export function BoardView({
  tasks,
  openTask,
  filterKey,
}: {
  tasks: Entity[];
  openTask: OpenTask;
  filterKey: string;
}) {
  const [paging, setPaging] = useState<{
    key: string;
    limits: Record<string, number>;
  }>({ key: filterKey, limits: {} });
  const limits = paging.key === filterKey ? paging.limits : {};
  return (
    <div className="work-board" aria-label="Work board" tabIndex={0}>
      {executionStatuses.map((status) => {
        const column = tasks.filter(
          (t) => workData(t).executionStatus === status,
        );
        const limit = limits[status] ?? 50;
        return (
          <section
            className={`work-column ${status}`}
            key={status}
            aria-label={`${stateLabels[status]} column`}
          >
            <header>
              <h2>{stateLabels[status]}</h2>
              <span>{column.length}</span>
            </header>
            <div className="work-column-body">
              {column.length ? (
                column.slice(0, limit).map((task) => {
                  const d = workData(task);
                  const steps = d.checklist ?? [];
                  return (
                    <button
                      className="work-board-card"
                      key={task.id}
                      data-work-card={task.id}
                      onClick={(e) => openTask(task, e.currentTarget)}
                    >
                      <div className="work-card-top">
                        <TaskIdentity task={task} />
                        <PlanningBadge kind="Priority" value={d.priority} />
                      </div>
                      <h3>{d.title}</h3>
                      <p className="work-source-label">
                        Source: {d.sourceStatus || "Not set"}
                      </p>
                      <div className="work-card-meta">
                        <PlanningBadge kind="Risk" value={d.risk} />
                        {d.owner && <span>{d.owner}</span>}
                        {steps.length > 0 && (
                          <span>
                            Checklist: {steps.filter((i) => i.done).length}/
                            {steps.length}
                          </span>
                        )}
                      </div>
                      <StatusBadge status={d.executionStatus} />
                    </button>
                  );
                })
              ) : (
                <p className="work-column-empty">No matching work items</p>
              )}
              {column.length > limit && (
                <button
                  className="work-more"
                  onClick={() =>
                    setPaging({
                      key: filterKey,
                      limits: { ...limits, [status]: limit + 50 },
                    })
                  }
                >
                  Show more · {column.length - limit} remaining
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

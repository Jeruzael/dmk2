import { useState } from "react";
import type { ChecklistItem, Entity } from "../../core/schema.js";
import { workData } from "./model.js";
import {
  Pagination,
  StatusBadge,
  TaskIdentity,
  WorkEmpty,
  type OpenTask,
} from "./shared.js";
export function ChecklistsView({
  tasks,
  page,
  onPage,
  openTask,
  toggle,
}: {
  tasks: Entity[];
  page: number;
  onPage: (n: number) => void;
  openTask: OpenTask;
  toggle: (task: Entity, item: ChecklistItem) => Promise<void>;
}) {
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const size = 20;
  const current = Math.min(
    page,
    Math.max(0, Math.ceil(tasks.length / size) - 1),
  );
  return (
    <>
      <div className="work-view-tools">
        <div>
          <h2>Task checklists</h2>
          <p>
            Step completion is tracked separately from execution status,
            acceptance and evidence verification.
          </p>
        </div>
        <label>
          Checklist entries
          <select
            aria-label="Filter checklist entries"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All entries</option>
            <option value="incomplete">Incomplete</option>
            <option value="complete">Completed</option>
          </select>
        </label>
      </div>
      {error && (
        <div className="work-error" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {tasks.length ? (
        <div className="work-checklist-groups">
          {tasks
            .slice(current * size, (current + 1) * size)
            .map((task, index) => {
              const d = workData(task);
              const items = d.checklist ?? [];
              const done = items.filter((i) => i.done).length;
              const shown = items.filter(
                (i) =>
                  filter === "all" ||
                  (filter === "complete" ? i.done : !i.done),
              );
              return (
                <details
                  key={task.id}
                  className="work-checklist-group"
                  open={index < 3}
                >
                  <summary>
                    <div>
                      <TaskIdentity task={task} />
                      <strong>{d.title}</strong>
                    </div>
                    <StatusBadge status={d.executionStatus} />
                    <span>
                      {done}/{items.length} complete
                    </span>
                  </summary>
                  <div className="work-checklist-body">
                    <div className="work-checklist-heading">
                      <span>
                        Checklist steps: {done} / {items.length}
                      </span>
                      <button
                        onClick={(e) =>
                          openTask(task, e.currentTarget, "Checklist")
                        }
                      >
                        {items.length
                          ? "Edit checklist"
                          : "Add checklist steps"}
                      </button>
                    </div>
                    {items.length > 0 ? (
                      <>
                        <progress
                          value={done}
                          max={items.length}
                          aria-label={`Checklist progress for ${d.title}`}
                        />
                        {shown.length ? (
                          shown.map((item) => (
                            <label
                              className="work-checklist-item"
                              key={item.id}
                            >
                              <input
                                type="checkbox"
                                checked={item.done}
                                disabled={!!busy}
                                onChange={async () => {
                                  setBusy(item.id);
                                  setError("");
                                  try {
                                    await toggle(task, item);
                                  } catch (e) {
                                    setError((e as Error).message);
                                  } finally {
                                    setBusy("");
                                  }
                                }}
                              />
                              <div>
                                <span>{item.text}</span>
                                {item.kind && <small>{item.kind} step</small>}
                                {item.sourceRef && (
                                  <small>Source: {item.sourceRef}</small>
                                )}
                                {item.evidence?.length ? (
                                  <small>
                                    Evidence references:{" "}
                                    {item.evidence.join(", ")}
                                  </small>
                                ) : null}
                              </div>
                            </label>
                          ))
                        ) : (
                          <p className="work-caption">
                            No {filter} entries in this checklist.
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="work-caption">
                        No checklist recorded. Acceptance criteria remain
                        separate statements.
                      </p>
                    )}
                  </div>
                </details>
              );
            })}
        </div>
      ) : (
        <WorkEmpty title="No matching work items">
          Adjust filters or add a work item to start a checklist.
        </WorkEmpty>
      )}
      <Pagination
        total={tasks.length}
        page={current}
        size={size}
        onPage={onPage}
      />
    </>
  );
}

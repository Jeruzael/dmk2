import type { Entity } from "../../core/schema.js";
import { progressCounts, stateLabels, workData } from "./model.js";
import { BacklogView } from "./BacklogView.js";
import { WorkEmpty, type OpenTask } from "./shared.js";
export function SprintsView({
  tasks,
  all,
  records,
  selected,
  onSelect,
  page,
  onPage,
  openTask,
  editSprint,
}: {
  tasks: Entity[];
  all: Entity[];
  records: Entity[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  page: number;
  onPage: (n: number) => void;
  openTask: OpenTask;
  editSprint: (s?: Entity) => void;
}) {
  const sprints = records.filter((r) => r.kind === "sprint");
  const active = sprints.find((s) => s.id === selected);
  const scope = tasks.filter((t) =>
    active ? workData(t).sprintId === active.id : !workData(t).sprintId,
  );
  const counts = progressCounts(scope);
  return (
    <>
      <div className="work-view-tools">
        <div>
          <h2>Milestone planning</h2>
          <p>
            Optional scope and recorded goals. Task-count completion is not
            delivery verification.
          </p>
        </div>
        <button onClick={() => editSprint()}>+ Sprint</button>
      </div>
      <div className="work-sprint-selector" aria-label="Sprint selection">
        <button
          className={!active ? "selected" : ""}
          onClick={() => onSelect(null)}
        >
          <strong>Unassigned work</strong>
          <span>{all.filter((t) => !workData(t).sprintId).length} tasks</span>
        </button>
        {sprints.map((s) => {
          const assigned = all.filter((t) => workData(t).sprintId === s.id);
          return (
            <button
              key={s.id}
              className={s.id === active?.id ? "selected" : ""}
              onClick={() => onSelect(s.id)}
            >
              <strong>{String(s.data.title)}</strong>
              <span>
                {assigned.length} tasks · {progressCounts(assigned).completed}{" "}
                completed
              </span>
            </button>
          );
        })}
      </div>
      {!sprints.length && (
        <WorkEmpty title="No sprints recorded">
          Create a milestone when it helps. Existing tasks remain unassigned
          until explicitly linked.
        </WorkEmpty>
      )}
      <section className="work-sprint-summary">
        <header>
          <div>
            <span className="work-eyebrow">
              {active ? "RECORDED SPRINT" : "NO SPRINT ASSIGNMENT"}
            </span>
            <h2>{active ? String(active.data.title) : "Unassigned work"}</h2>
          </div>
          {active && (
            <button onClick={() => editSprint(active)}>Edit sprint</button>
          )}
        </header>
        {active?.data.goal ? <p>{String(active.data.goal)}</p> : null}
        {active && Boolean(active.data.startDate || active.data.endDate) && (
          <p className="work-caption">
            {String(active.data.startDate || "Start not set")} →{" "}
            {String(active.data.endDate || "End not set")}
          </p>
        )}
        <div className="work-sprint-metrics">
          <div>
            <strong>{counts.total}</strong>
            <span>Tasks in filtered scope</span>
          </div>
          <div>
            <strong>{counts.completed}</strong>
            <span>Execution marked completed</span>
          </div>
          <div className="work-count-progress">
            <label>
              Task-count completion: {counts.completed} / {counts.total}
            </label>
            {counts.total > 0 && (
              <progress
                value={counts.completed}
                max={counts.total}
                aria-label="Task-count completion"
              />
            )}
          </div>
        </div>
        <div className="work-state-counts">
          {Object.entries(stateLabels).map(([status, label]) => {
            const count = scope.filter(
              (t) => workData(t).executionStatus === status,
            ).length;
            return count ? (
              <span key={status}>
                {label}: {count}
              </span>
            ) : null;
          })}
        </div>
      </section>
      <BacklogView
        tasks={scope}
        records={records}
        page={page}
        onPage={onPage}
        openTask={openTask}
      />
    </>
  );
}

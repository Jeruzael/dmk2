import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChecklistItem, Entity } from "../../core/schema.js";
import {
  executionStatuses,
  workPriorities,
  workRisks,
} from "../../core/work-values.js";
import { execute } from "../bridge.js";
import { Editor } from "../Editor.js";
import {
  filterWork,
  sortWork,
  stateLabels,
  workData,
  type WorkFilters,
  type WorkSort,
} from "./model.js";
import { BoardView } from "./BoardView.js";
import { BacklogView } from "./BacklogView.js";
import { WbsView } from "./WbsView.js";
import { SprintsView } from "./SprintsView.js";
import { ChecklistsView } from "./ChecklistsView.js";
import { TaskDrawer, type DrawerSection } from "./TaskDrawer.js";
import type { OpenTask } from "./shared.js";

const tabs = ["Board", "WBS", "Backlog", "Sprints", "Checklists"] as const;
type WorkTab = (typeof tabs)[number];
type Session = {
  tab: WorkTab;
  filters: WorkFilters;
  sort: WorkSort;
  direction: "asc" | "desc";
  page: number;
  sprint: string | null;
};
const sessions = new Map<string, Session>();
export function WorkManagement({
  project,
  records,
  onChanged,
  onLeaveGuardChange,
}: {
  project: Entity;
  records: Entity[];
  onChanged: (entity?: Entity) => Promise<void>;
  onLeaveGuardChange?: (guard: () => boolean) => void;
}) {
  const [session, setSession] = useState<Session>(
    () =>
      sessions.get(project.id) ?? {
        tab: "Board",
        filters: {},
        sort: "source",
        direction: "asc",
        page: 0,
        sprint: null,
      },
  );
  const [showFilters, setShowFilters] = useState(true);
  const [selected, setSelected] = useState<
    { kind: "create" } | { kind: "task"; id: string } | null
  >(null);
  const [drawerSection, setDrawerSection] = useState<DrawerSection>("Details");
  const [sprintEditor, setSprintEditor] = useState<{ entity?: Entity }>();
  const [error, setError] = useState("");
  const dirty = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  const tabBar = useRef<HTMLDivElement>(null);
  const guard = useCallback(
    () =>
      !dirty.current || window.confirm("Discard unsaved work-item changes?"),
    [],
  );
  const setDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  useEffect(() => {
    sessions.set(project.id, session);
  }, [project.id, session]);
  useEffect(() => {
    onLeaveGuardChange?.(guard);
    return () => onLeaveGuardChange?.(() => true);
  }, [guard, onLeaveGuardChange]);
  const all = useMemo(
    () => records.filter((r) => r.kind === "work_item"),
    [records],
  );
  const sorted = useMemo(
    () => sortWork(all, session.sort, session.direction),
    [all, session.sort, session.direction],
  );
  const matched = useMemo(
    () => filterWork(sorted, session.filters),
    [sorted, session.filters],
  );
  const sprints = records.filter((r) => r.kind === "sprint");
  const parents = new Set(all.map((t) => workData(t).parentId).filter(Boolean));
  const sources = [...new Set(all.map((t) => workData(t).sourceStatus))].sort();
  const owners = [
    ...new Set(all.map((t) => workData(t).owner).filter(Boolean)),
  ].sort();
  const filterKey = JSON.stringify(session.filters);
  const filtering = Object.values(session.filters).some(Boolean);
  const filter = (key: keyof WorkFilters, value: string) =>
    setSession((s) => ({
      ...s,
      page: 0,
      filters: { ...s.filters, [key]: value },
    }));
  const openTask: OpenTask = (task, element, section = "Details") => {
    if ((selected?.kind !== "task" || selected.id !== task.id) && !guard())
      return;
    opener.current = element ?? (document.activeElement as HTMLElement);
    setDrawerSection(section);
    setSelected({ kind: "task", id: task.id });
  };
  const closeTask = useCallback(() => {
    setSelected(null);
    dirty.current = false;
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus();
      else
        tabBar.current
          ?.querySelector<HTMLElement>('[aria-selected="true"]')
          ?.focus();
    });
  }, []);
  const committed = async (entity: Entity) => {
    await onChanged(entity);
    if (selected?.kind === "create" && entity.kind === "work_item")
      setSelected({ kind: "task", id: entity.id });
  };
  const toggle = async (task: Entity, item: ChecklistItem) => {
    try {
      const result = await execute<Entity>("save_work_item", {
        projectId: project.id,
        id: task.id,
        expectedRevision: task.revision,
        operationId: crypto.randomUUID(),
        origin: "local-app",
        data: {
          ...task.data,
          checklist: (workData(task).checklist ?? []).map((i) =>
            i.id === item.id ? { ...i, done: !i.done } : i,
          ),
        },
      });
      await onChanged(result);
    } catch (error) {
      await onChanged();
      throw error;
    }
  };
  const selectTab = (tab: WorkTab) =>
    setSession((s) => ({ ...s, tab, page: 0 }));
  const selectFilter = (
    key: keyof WorkFilters,
    label: string,
    values: { value: string; label: string }[],
  ) => (
    <label>
      {label}
      <select
        aria-label={`Filter ${label.toLowerCase()}`}
        value={session.filters[key] ?? ""}
        onChange={(e) => filter(key, e.target.value)}
      >
        <option value="">All</option>
        {values.map((v) => (
          <option key={v.value} value={v.value}>
            {v.label}
          </option>
        ))}
      </select>
    </label>
  );
  const page = (n: number) => setSession((s) => ({ ...s, page: n }));
  const task =
    selected?.kind === "task"
      ? all.find((t) => t.id === selected.id)
      : undefined;
  return (
    <section className="work-management" aria-label="Structured work workspace">
      <div
        className="work-tabs"
        role="tablist"
        aria-label="Work Management views"
        ref={tabBar}
      >
        {tabs.map((tab, i) => (
          <button
            key={tab}
            role="tab"
            id={`work-tab-${tab.toLowerCase()}`}
            aria-controls="work-view-panel"
            aria-selected={session.tab === tab}
            tabIndex={session.tab === tab ? 0 : -1}
            onClick={() => selectTab(tab)}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? tabs.length - 1
                      : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                        tabs.length;
                selectTab(tabs[next]!);
                tabBar.current
                  ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                  [next]?.focus();
              }
            }}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="work-toolbar">
        <div className="work-search-row">
          <input
            aria-label="Search work items"
            type="search"
            placeholder="Search task names, source IDs, descriptions…"
            value={session.filters.search ?? ""}
            onChange={(e) => filter("search", e.target.value)}
          />
          <button
            aria-expanded={showFilters}
            aria-controls="work-filters"
            onClick={() => setShowFilters((v) => !v)}
          >
            Filters{filtering ? " · active" : ""}
          </button>
          <button
            className="primary"
            onClick={(e) => {
              if (!guard()) return;
              opener.current = e.currentTarget;
              setDrawerSection("Details");
              setSelected({ kind: "create" });
            }}
          >
            + Work item
          </button>
        </div>
        {showFilters && (
          <div id="work-filters" className="work-filters">
            {selectFilter(
              "execution",
              "Execution status",
              executionStatuses.map((value) => ({
                value,
                label: stateLabels[value]!,
              })),
            )}
            {selectFilter(
              "source",
              "Source status",
              sources.map((value) => ({ value, label: value || "Not set" })),
            )}
            {selectFilter(
              "parent",
              "Parent / group",
              all
                .filter((t) => parents.has(t.id))
                .map((t) => ({ value: t.id, label: workData(t).title })),
            )}
            {selectFilter(
              "priority",
              "Priority",
              workPriorities.map((value) => ({
                value,
                label: value === "unknown" ? "Not set" : value,
              })),
            )}
            {selectFilter(
              "risk",
              "Risk",
              workRisks.map((value) => ({
                value,
                label: value === "unknown" ? "Unknown" : value,
              })),
            )}
            {selectFilter("sprint", "Sprint", [
              { value: "@unassigned", label: "Unassigned" },
              ...sprints.map((s) => ({
                value: s.id,
                label: String(s.data.title),
              })),
            ])}
            {owners.length > 0 &&
              selectFilter("owner", "Owner", [
                { value: "@unassigned", label: "Unassigned" },
                ...owners.map((value) => ({
                  value: "owner:" + value,
                  label: value,
                })),
              ])}
          </div>
        )}
        <div className="work-toolbar-bottom">
          <strong aria-live="polite">
            {matched.length === all.length
              ? `${all.length} work items`
              : `${matched.length} of ${all.length} work items`}
          </strong>
          {filtering && (
            <button
              className="work-clear"
              onClick={() =>
                setSession((s) => ({ ...s, filters: {}, page: 0 }))
              }
            >
              Clear filters
            </button>
          )}
          <label>
            Sort by
            <select
              aria-label="Sort work items"
              value={session.sort}
              onChange={(e) =>
                setSession((s) => ({
                  ...s,
                  sort: e.target.value as WorkSort,
                  page: 0,
                }))
              }
            >
              <option value="source">Source identifier</option>
              <option value="title">Title</option>
              <option value="updated">Updated time</option>
              <option value="execution">Execution status</option>
              <option value="priority">Priority</option>
            </select>
          </label>
          <button
            aria-label="Reverse sort direction"
            onClick={() =>
              setSession((s) => ({
                ...s,
                direction: s.direction === "asc" ? "desc" : "asc",
              }))
            }
          >
            {session.direction === "asc" ? "↑ Ascending" : "↓ Descending"}
          </button>
        </div>
      </div>
      {error && (
        <div className="work-error" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      <div
        id="work-view-panel"
        role="tabpanel"
        aria-labelledby={`work-tab-${session.tab.toLowerCase()}`}
        className="work-view-panel"
      >
        {session.tab === "Board" && (
          <BoardView
            tasks={matched}
            openTask={openTask}
            filterKey={filterKey}
          />
        )}
        {session.tab === "WBS" && (
          <WbsView
            all={sorted}
            matched={matched}
            filtering={filtering}
            openTask={openTask}
          />
        )}
        {session.tab === "Backlog" && (
          <BacklogView
            tasks={matched}
            records={records}
            page={session.page}
            onPage={page}
            openTask={openTask}
          />
        )}
        {session.tab === "Sprints" && (
          <SprintsView
            tasks={matched}
            all={all}
            records={records}
            selected={session.sprint}
            onSelect={(sprint) =>
              setSession((s) => ({ ...s, sprint, page: 0 }))
            }
            page={session.page}
            onPage={page}
            openTask={openTask}
            editSprint={(entity) => setSprintEditor({ entity })}
          />
        )}
        {session.tab === "Checklists" && (
          <ChecklistsView
            tasks={matched}
            page={session.page}
            onPage={page}
            openTask={openTask}
            toggle={toggle}
          />
        )}
      </div>
      {selected && (selected.kind === "create" || task) ? (
        <TaskDrawer
          key={JSON.stringify(selected)}
          project={project}
          task={task}
          records={records}
          initialSection={drawerSection}
          onChanged={committed}
          onClose={closeTask}
          onDirtyChange={setDirty}
        />
      ) : (
        selected && (
          <div className="work-error" role="alert">
            This task is no longer available. Your view has not been replaced
            with another record.<button onClick={closeTask}>Close task</button>
          </div>
        )
      )}
      {sprintEditor && (
        <Editor
          key={sprintEditor.entity?.id ?? "new-sprint"}
          kind="sprint"
          entity={sprintEditor.entity}
          records={records}
          onClose={() => setSprintEditor(undefined)}
          onSave={async (data) => {
            const entity = await execute<Entity>("save_sprint", {
              projectId: project.id,
              ...(sprintEditor.entity
                ? {
                    id: sprintEditor.entity.id,
                    expectedRevision: sprintEditor.entity.revision,
                  }
                : {}),
              operationId: crypto.randomUUID(),
              origin: "local-app",
              data,
            });
            await onChanged(entity);
            setSession((s) => ({ ...s, sprint: entity.id, page: 0 }));
          }}
        />
      )}
    </section>
  );
}

import type { ChecklistItem, Entity } from "../../core/schema.js";
export type WorkFilters = {
  search?: string;
  execution?: string;
  source?: string;
  parent?: string;
  priority?: string;
  risk?: string;
  sprint?: string;
  owner?: string;
};
export type WorkSort =
  "title" | "updated" | "source" | "execution" | "priority";
export type OutlineRow = {
  task: Entity;
  depth: number;
  context: boolean;
  childCount: number;
};
export type WorkData = Entity["data"] & {
  title: string;
  description: string;
  parentId: string | null;
  dependencies: string[];
  relatedIds: string[];
  sourceIdentifier: string;
  sourceNamespace: string;
  sourceStatus: string;
  executionStatus: string;
  acceptanceCriteria: string[];
  owner: string;
  evidence: string[];
  lastSourceRevision: string;
  sources: string[];
  priority?: string;
  risk?: string;
  sprintId?: string | null;
  checklist?: ChecklistItem[];
};
export const workData = (task: Entity) => task.data as WorkData;
export const taskCode = (task: Entity) =>
  String(task.data.sourceIdentifier || task.id.slice(0, 8));
export const stateLabels: Record<string, string> = {
  unknown: "Unknown",
  backlog: "Backlog",
  "in-progress": "In progress",
  partial: "Partial",
  blocked: "Blocked",
  completed: "Completed",
  future: "Future",
};

export function filterWork(tasks: Entity[], filters: WorkFilters): Entity[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const inBranch = (task: Entity, selected: string) => {
    let current: Entity | undefined = task;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      if (current.id === selected) return true;
      seen.add(current.id);
      current = byId.get(workData(current).parentId ?? "");
    }
    return false;
  };
  const needle = (filters.search ?? "").trim().toLowerCase();
  return tasks.filter((task) => {
    const d = workData(task);
    return (
      (!needle ||
        [
          d.title,
          d.description,
          d.sourceIdentifier,
          d.sourceNamespace,
          d.owner,
        ].some((s) => s.toLowerCase().includes(needle))) &&
      (!filters.execution || d.executionStatus === filters.execution) &&
      (!filters.source || d.sourceStatus === filters.source) &&
      (!filters.priority || (d.priority ?? "unknown") === filters.priority) &&
      (!filters.risk || (d.risk ?? "unknown") === filters.risk) &&
      (!filters.owner ||
        (filters.owner === "@unassigned"
          ? !d.owner
          : d.owner ===
            (filters.owner.startsWith("owner:")
              ? filters.owner.slice(6)
              : filters.owner))) &&
      (!filters.sprint ||
        (filters.sprint === "@unassigned"
          ? !d.sprintId
          : d.sprintId === filters.sprint)) &&
      (!filters.parent || inBranch(task, filters.parent))
    );
  });
}
export function sortWork(
  tasks: Entity[],
  sort: WorkSort,
  direction: "asc" | "desc",
): Entity[] {
  const rank: Record<string, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
    unknown: 4,
  };
  const value = (t: Entity) =>
    sort === "updated"
      ? t.updatedAt
      : sort === "source"
        ? taskCode(t)
        : sort === "execution"
          ? workData(t).executionStatus
          : workData(t).title;
  return [...tasks].sort((a, b) => {
    const compared =
      sort === "priority"
        ? rank[workData(a).priority ?? "unknown"]! -
          rank[workData(b).priority ?? "unknown"]!
        : value(a).localeCompare(value(b), undefined, { numeric: true });
    return compared
      ? compared * (direction === "asc" ? 1 : -1)
      : a.id.localeCompare(b.id);
  });
}
export function outlineRows(
  all: Entity[],
  matched: Set<string>,
  collapsed: Set<string>,
  searching: boolean,
): OutlineRow[] {
  const byId = new Map(all.map((t) => [t.id, t]));
  const children = new Map<string, Entity[]>();
  const included = new Set(matched);
  for (const task of all) {
    const parent = workData(task).parentId;
    if (parent && byId.has(parent))
      children.set(parent, [...(children.get(parent) ?? []), task]);
  }
  for (const id of matched) {
    let parent = workData(byId.get(id)!).parentId;
    const seen = new Set<string>([id]);
    while (parent && byId.has(parent) && !seen.has(parent)) {
      seen.add(parent);
      included.add(parent);
      parent = workData(byId.get(parent)!).parentId;
    }
  }
  const roots = all.filter(
    (t) => !workData(t).parentId || !byId.has(workData(t).parentId!),
  );
  // Hierarchical roots first; independent tasks keep their own identity afterward.
  const ordered = [
    ...roots.filter((t) => children.has(t.id)),
    ...roots.filter((t) => !children.has(t.id)),
  ];
  const stack = [...ordered].reverse().map((task) => ({ task, depth: 0 }));
  const rows: OutlineRow[] = [];
  const visited = new Set<string>();
  while (stack.length) {
    const { task, depth } = stack.pop()!;
    if (!included.has(task.id) || visited.has(task.id)) continue;
    visited.add(task.id);
    const nested = children.get(task.id) ?? [];
    rows.push({
      task,
      depth,
      context: !matched.has(task.id),
      childCount: nested.length,
    });
    if (searching || !collapsed.has(task.id))
      for (const child of [...nested].reverse())
        stack.push({ task: child, depth: depth + 1 });
  }
  return rows;
}
export function reconcileDraft(
  base: Entity["data"],
  draft: Entity["data"],
  latest: Entity["data"],
): { data: Entity["data"]; conflicts: string[] } {
  const data = { ...latest };
  const conflicts: string[] = [];
  for (const key of new Set([...Object.keys(base), ...Object.keys(draft)])) {
    if (JSON.stringify(base[key]) === JSON.stringify(draft[key])) continue;
    if (
      JSON.stringify(latest[key]) !== JSON.stringify(base[key]) &&
      JSON.stringify(latest[key]) !== JSON.stringify(draft[key])
    )
      conflicts.push(key);
    if (Object.hasOwn(draft, key)) data[key] = draft[key];
    else delete data[key];
  }
  return { data, conflicts };
}
export function progressCounts(tasks: Entity[]): {
  total: number;
  completed: number;
  checklistTotal: number;
  checklistDone: number;
} {
  return tasks.reduce(
    (counts, task) => {
      const d = workData(task);
      counts.total++;
      if (d.executionStatus === "completed") counts.completed++;
      counts.checklistTotal += d.checklist?.length ?? 0;
      counts.checklistDone += d.checklist?.filter((i) => i.done).length ?? 0;
      return counts;
    },
    { total: 0, completed: 0, checklistTotal: 0, checklistDone: 0 },
  );
}

import { useMemo, useState } from "react";
import type { Entity } from "../../core/schema.js";
import { outlineRows, workData } from "./model.js";
import {
  StatusBadge,
  TaskIdentity,
  WorkEmpty,
  type OpenTask,
} from "./shared.js";
export function WbsView({
  all,
  matched,
  filtering,
  openTask,
}: {
  all: Entity[];
  matched: Entity[];
  filtering: boolean;
  openTask: OpenTask;
}) {
  const parents = useMemo(
    () =>
      new Set(
        all.map((t) => workData(t).parentId).filter((id): id is string => !!id),
      ),
    [all],
  );
  const [collapsed, setCollapsed] = useState(() => new Set(parents));
  const [limit, setLimit] = useState(100);
  const matches = new Set(matched.map((t) => t.id));
  const rows = outlineRows(all, matches, collapsed, filtering);
  const toggle = (id: string) =>
    setCollapsed((old) => {
      const next = new Set(old);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const byId = new Map(all.map((t) => [t.id, t]));
  const standalone = (t: Entity) => !workData(t).parentId && !parents.has(t.id);
  const firstSolo = rows.findIndex((r) => standalone(r.task));
  return (
    <>
      <div className="work-view-tools">
        <div>
          <h2>Work breakdown</h2>
          <p>
            Parent groups and independent work, with source labels kept
            distinct.
          </p>
        </div>
        <button onClick={() => setCollapsed(new Set())}>Expand all</button>
        <button onClick={() => setCollapsed(new Set(parents))}>
          Collapse all
        </button>
      </div>
      {!rows.length ? (
        <WorkEmpty title="No matching hierarchy">
          Search matches include their ancestor context. Independent tasks stay
          without a parent.
        </WorkEmpty>
      ) : (
        <div
          className="work-outline"
          role="tree"
          aria-label="Work breakdown hierarchy"
        >
          {rows.slice(0, limit).map((row, index) => {
            const d = workData(row.task);
            const missing = d.parentId && !byId.has(d.parentId);
            return (
              <div key={row.task.id}>
                {index === firstSolo && (
                  <h3 className="work-unassigned-heading">Without parent</h3>
                )}
                <div
                  className={`work-tree-row ${row.context ? "context-row" : ""}`}
                  role="treeitem"
                  aria-level={row.depth + 1}
                  aria-expanded={
                    row.childCount
                      ? filtering || !collapsed.has(row.task.id)
                      : undefined
                  }
                  style={{ paddingLeft: 12 + Math.min(row.depth, 6) * 20 }}
                  onKeyDown={(e) => {
                    if (
                      row.childCount &&
                      ["ArrowRight", "ArrowLeft"].includes(e.key)
                    ) {
                      e.preventDefault();
                      setCollapsed((old) => {
                        const next = new Set(old);
                        e.key === "ArrowLeft"
                          ? next.add(row.task.id)
                          : next.delete(row.task.id);
                        return next;
                      });
                    }
                  }}
                >
                  {row.childCount ? (
                    <button
                      className="work-disclosure"
                      aria-label={`${collapsed.has(row.task.id) && !filtering ? "Expand" : "Collapse"} ${d.title}`}
                      onClick={() => toggle(row.task.id)}
                    >
                      {collapsed.has(row.task.id) && !filtering ? "▸" : "▾"}
                    </button>
                  ) : (
                    <span className="work-leaf" aria-hidden="true">
                      ·
                    </span>
                  )}
                  <TaskIdentity task={row.task} />
                  <button
                    className="work-tree-title"
                    title={d.title}
                    onClick={(e) => openTask(row.task, e.currentTarget)}
                  >
                    {d.title}
                    {row.context && <small>Ancestor context</small>}
                    {row.depth > 6 && <small>Level {row.depth + 1}</small>}
                    {missing && (
                      <small className="work-warning">
                        Missing parent reference
                      </small>
                    )}
                  </button>
                  {row.childCount > 0 && (
                    <span className="work-child-count">
                      {row.childCount} children
                    </span>
                  )}
                  <StatusBadge status={d.executionStatus} />
                  <span className="work-source-chip">
                    Source: {d.sourceStatus || "Not set"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {rows.length > limit && (
        <button className="work-more" onClick={() => setLimit((n) => n + 100)}>
          Show more · {rows.length - limit} rows remaining
        </button>
      )}
      <p className="work-caption">
        {rows.length} visible hierarchy rows, including ancestor context when
        filtered.
      </p>
    </>
  );
}

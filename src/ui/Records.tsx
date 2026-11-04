import { Children, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChangeEvent, Entity } from "../core/schema.js";
import { labels } from "./Editor.js";
export function display(value: unknown): string {
  return Array.isArray(value)
    ? value.map(display).join("\n")
    : value && typeof value === "object"
      ? Object.entries(value)
          .map(([k, v]) => `${k}: ${display(v)}`)
          .join("\n")
      : String(value ?? "");
}
const headingId = (children: ReactNode) =>
  Children.toArray(children)
    .map((c) =>
      typeof c === "string" || typeof c === "number" ? String(c) : "",
    )
    .join("")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
export function SafeMarkdown({
  content,
  documents,
  onDocument,
}: {
  content: string;
  documents: Entity[];
  onDocument: (id: string) => void;
}) {
  return (
    <article className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) =>
          url.startsWith("#") ||
          url.startsWith("dmk2:document/") ||
          documents.some(
            (d) => d.data.repositoryPath && d.data.repositoryPath === url,
          )
            ? url
            : ""
        }
        components={{
          img: () => null,
          a: ({ href, children }) => {
            if (href?.startsWith("#")) return <a href={href}>{children}</a>;
            const doc = documents.find(
              (d) =>
                `dmk2:document/${d.id}` === href ||
                (d.data.repositoryPath && d.data.repositoryPath === href),
            );
            return doc ? (
              <button className="text-link" onClick={() => onDocument(doc.id)}>
                {children}
              </button>
            ) : (
              <span title="External links are displayed as text">
                {children}
              </span>
            );
          },
          h1: ({ children }) => <h1 id={headingId(children)}>{children}</h1>,
          h2: ({ children }) => <h2 id={headingId(children)}>{children}</h2>,
          h3: ({ children }) => <h3 id={headingId(children)}>{children}</h3>,
        }}
      >
        {content}
      </Markdown>
    </article>
  );
}
export function Fields({
  data,
  records,
  fullSnapshot = false,
}: {
  data: Entity["data"];
  records: Entity[];
  fullSnapshot?: boolean;
}) {
  const named = (value: unknown): string =>
    typeof value === "string"
      ? String(records.find((r) => r.id === value)?.data.title ?? value)
      : Array.isArray(value)
        ? value.map(named).join("\n")
        : display(value);
  return (
    <dl className="fields">
      {Object.entries(data)
        .filter(
          ([key, value]) =>
            fullSnapshot ||
            (!["title", "markdown", "sourceStatus", "executionStatus"].includes(
              key,
            ) &&
              value !== "" &&
              value !== null &&
              (!Array.isArray(value) || value.length > 0)),
        )
        .map(([key, value]) => (
          <div key={key}>
            <dt>
              {key === "confirmation"
                ? "User confirmation (agent claim)"
                : (labels[key] ?? key)}
            </dt>
            <dd>
              {fullSnapshot
                ? display(value) || "— (empty)"
                : [
                      "relatedIds",
                      "parentId",
                      "dependencies",
                      "fromId",
                      "toId",
                    ].includes(key)
                  ? named(value)
                  : display(value)}
            </dd>
          </div>
        ))}
    </dl>
  );
}
export function RecordCard({
  record,
  records,
  edit,
  history,
}: {
  record: Entity;
  records: Entity[];
  edit: (entity: Entity) => void;
  history: (entity: Entity) => void;
}) {
  const status =
    record.data.executionStatus ?? record.data.state ?? record.data.status;
  return (
    <section className={`record-card ${record.kind}`}>
      <header>
        <div>
          <span className="eyebrow">
            {record.kind.replace("_", " ")} · r{record.revision}
            {record.data.sourceIdentifier
              ? ` · ${record.data.sourceIdentifier}`
              : ""}
          </span>
          <h3>{String(record.data.title)}</h3>
        </div>
        {status ? (
          <span className={`badge ${status}`}>{String(status)}</span>
        ) : null}
      </header>
      {record.kind === "work_item" && (
        <p className="source-status">
          Source: {String(record.data.sourceStatus)}
        </p>
      )}
      <Fields data={record.data} records={records} />
      <footer>
        <small>{new Date(record.updatedAt).toLocaleString()}</small>
        <button
          aria-label={`History ${record.data.title}`}
          onClick={() => history(record)}
        >
          History
        </button>
        <button
          aria-label={`Edit ${record.data.title}`}
          onClick={() => edit(record)}
        >
          Edit
        </button>
      </footer>
    </section>
  );
}
export function HistoryList({
  events,
  records,
}: {
  events: ChangeEvent[];
  records: Entity[];
}) {
  return (
    <div className="timeline">
      {events.map((event) => (
        <section key={event.id} className="timeline-entry">
          <div className="timeline-dot" />
          <span className="eyebrow">
            #{event.sequence} · {new Date(event.timestamp).toLocaleString()}
          </span>
          <h3>{String(event.after.data.title ?? event.after.data.name)}</h3>
          <p>
            {event.operation.replaceAll("_", " ")} · r{event.previousRevision} →
            r{event.newRevision} · <span>{event.origin}</span>
          </p>
          {event.sourceRef && (
            <small className="provenance">{event.sourceRef}</small>
          )}
          <details>
            <summary>View revision</summary>
            <div className="revision-pair">
              {event.before && (
                <div>
                  <h4>Before · r{event.before.revision}</h4>
                  <Fields
                    data={event.before.data}
                    records={records}
                    fullSnapshot
                  />
                </div>
              )}
              <div>
                <h4>After · r{event.newRevision}</h4>
                <Fields
                  data={event.after.data}
                  records={records}
                  fullSnapshot
                />
              </div>
            </div>
          </details>
        </section>
      ))}
    </div>
  );
}

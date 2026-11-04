import { Children, isValidElement, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChangeEvent, Entity } from "../core/schema.js";
import { labels } from "./Editor.js";
import { resolveRepositoryLink } from "./documents/navigation.js";
import { prepareRepositoryMarkdown } from "./documents/rendering.js";
export function display(value: unknown): string {
  return Array.isArray(value)
    ? value.map(display).join("\n")
    : value && typeof value === "object"
      ? Object.entries(value)
          .map(([k, v]) => `${k}: ${display(v)}`)
          .join("\n")
      : String(value ?? "");
}
const headingText = (children: ReactNode): string =>
  Children.toArray(children)
    .map((c) =>
      typeof c === "string" || typeof c === "number"
        ? String(c)
        : isValidElement<{ children?: ReactNode }>(c)
          ? headingText(c.props.children)
          : "",
    )
    .join("");
const headingId = (children: ReactNode) =>
  headingText(children)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
export function SafeMarkdown({
  content,
  documents,
  onDocument,
  repository,
  optimizeLongProse = false,
}: {
  content: string;
  documents: Entity[];
  onDocument: (id: string) => void;
  optimizeLongProse?: boolean;
  repository?: {
    currentPath: string;
    paths: readonly string[];
    onNavigate: (path: string, fragment: string) => void;
  };
}) {
  const ids = new Map<string, number>();
  const uniqueHeading = (children: ReactNode) => {
    const base = headingId(children);
    let count = ids.get(base) ?? 0;
    let candidate = base;
    while (ids.has(candidate)) candidate = `${base}-${++count}`;
    ids.set(base, count);
    // Generated IDs must also be reserved against literal suffixed headings.
    ids.set(candidate, 0);
    return candidate;
  };
  const repositoryLink = (href: string) =>
    repository
      ? resolveRepositoryLink(repository.currentPath, href, repository.paths)
      : null;
  return (
    <article className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) =>
          repositoryLink(url) ||
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
            const sourceLink = href ? repositoryLink(href) : null;
            if (sourceLink)
              return (
                <button
                  className="text-link"
                  onClick={() =>
                    repository!.onNavigate(sourceLink.path, sourceLink.fragment)
                  }
                >
                  {children}
                </button>
              );
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
          h1: ({ children }) => (
            <h1 id={uniqueHeading(children)}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 id={uniqueHeading(children)}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 id={uniqueHeading(children)}>{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 id={uniqueHeading(children)}>{children}</h4>
          ),
          h5: ({ children }) => (
            <h5 id={uniqueHeading(children)}>{children}</h5>
          ),
          h6: ({ children }) => (
            <h6 id={uniqueHeading(children)}>{children}</h6>
          ),
        }}
      >
        {optimizeLongProse ? prepareRepositoryMarkdown(content) : content}
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

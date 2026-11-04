import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceService } from "../src/core/service.js";
import { HistoryList } from "../src/ui/Records.js";
import type { ChangeEvent } from "../src/core/schema.js";

test("revision display includes changed titles and both source/execution statuses", () => {
  const s = new WorkspaceService(":memory:");
  try {
    const p = s.execute("create_project", {
      operationId: "p",
      origin: "test",
      data: { name: "Synthetic" },
    }) as any;
    const r = s.execute("save_work_item", {
      projectId: p.id,
      operationId: "r",
      origin: "test",
      data: {
        title: "Original title",
        sourceStatus: "PARTIAL",
        executionStatus: "unknown",
      },
    }) as any;
    s.execute("save_work_item", {
      projectId: p.id,
      id: r.id,
      expectedRevision: 1,
      operationId: "u",
      origin: "test",
      data: {
        ...r.data,
        title: "Revised title",
        sourceStatus: "DONE",
        executionStatus: "completed",
      },
    });
    const events = s.execute("get_history", {
      projectId: p.id,
      entityId: r.id,
      afterSequence: 2,
    }) as ChangeEvent[];
    const html = renderToStaticMarkup(
      createElement(HistoryList, { events, records: [] }),
    );
    for (const text of [
      "Original title",
      "Revised title",
      "PARTIAL",
      "DONE",
      "unknown",
      "completed",
      "Source status",
      "Execution status",
    ])
      assert.ok(html.includes(text), `Missing historical value: ${text}`);
  } finally {
    s.close();
  }
});

test("document revisions show metadata and removed values as well as Markdown", () => {
  const s = new WorkspaceService(":memory:");
  try {
    const p = s.execute("create_project", {
      operationId: "p",
      origin: "test",
      data: { name: "Synthetic" },
    }) as any;
    const r = s.execute("save_document", {
      projectId: p.id,
      operationId: "r",
      origin: "test",
      data: {
        title: "Old document",
        markdown: "# Old body",
        category: "proposal",
        repositoryPath: "docs/old.md",
      },
    }) as any;
    s.execute("save_document", {
      projectId: p.id,
      id: r.id,
      expectedRevision: 1,
      operationId: "u",
      origin: "test",
      data: {
        ...r.data,
        title: "New document",
        category: "accepted",
        repositoryPath: "",
        markdown: "# New body",
      },
    });
    const events = s.execute("get_history", {
      projectId: p.id,
      entityId: r.id,
      afterSequence: 2,
    }) as ChangeEvent[];
    const html = renderToStaticMarkup(
      createElement(HistoryList, { events, records: [] }),
    );
    for (const text of [
      "Old document",
      "proposal",
      "accepted",
      "docs/old.md",
      "# Old body",
      "# New body",
      "(empty)",
    ])
      assert.ok(html.includes(text), `Missing historical value: ${text}`);
  } finally {
    s.close();
  }
});

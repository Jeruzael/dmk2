import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BacklogView } from "../src/ui/work/BacklogView.js";
import { recordSchemas, type Entity } from "../src/core/schema.js";

function backlog(sourceStatus: string) {
  const task: Entity = {
    id: "long-source",
    projectId: "synthetic",
    kind: "work_item",
    revision: 1,
    createdAt: "2026-11-05T00:00:00Z",
    updatedAt: "2026-11-05T00:00:00Z",
    data: recordSchemas.work_item.parse({
      title: "Readable planning task",
      sourceStatus,
    }),
  };
  return renderToStaticMarkup(
    createElement(BacklogView, {
      tasks: [task],
      records: [task],
      page: 0,
      onPage() {},
      openTask() {},
    }),
  );
}
test("Backlog compacts an explicit leading source classification without changing its original text", () => {
  const full =
    "DONE — source author reports implementation; independent verification is still pending";
  const html = backlog(full);
  assert.match(
    html,
    /title="DONE — source author reports implementation; independent verification is still pending"/,
  );
  assert.match(html, /class="work-source-chip"[^>]*>DONE<\/span>/);
  assert.doesNotMatch(html, />DONE — source author/);
});
test("Backlog does not guess an execution classification from an unrecognized or ambiguous source value", () => {
  for (const full of [
    "not done; needs evidence",
    "DONE / BLOCKED",
    "Pending review and stakeholder comment",
  ]) {
    const html = backlog(full);
    assert.match(html, /class="work-source-chip"[^>]*>Unrecognized<\/span>/);
    assert.ok(html.includes(`title="${full}"`));
  }
  assert.match(
    backlog("UNKNOWN"),
    /class="work-source-chip"[^>]*>UNKNOWN<\/span>/,
  );
});

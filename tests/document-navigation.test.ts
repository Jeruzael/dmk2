import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SafeMarkdown } from "../src/ui/Records.js";

test("repository Markdown resolves relative encoded document links and stable nested duplicate heading targets", () => {
  const content =
    "# System **map**\n\n## Repeat\n\n## Repeat\n\n[Guide](../Guides/with%20space.md#start-here)\n\n[Unsafe](../../../../secret.md)\n\n![No image](https://example.invalid/image.png)\n";
  const html = renderToStaticMarkup(
    createElement(SafeMarkdown, {
      content,
      documents: [],
      onDocument() {},
      repository: {
        currentPath: "Docs/Architecture/overview.md",
        paths: ["Docs/Architecture/overview.md", "Docs/Guides/with space.md"],
        onNavigate() {},
      },
    }),
  );
  assert.match(html, /id="system-map"/);
  assert.match(html, /id="repeat-1"/);
  assert.match(html, /<button[^>]*>Guide<\/button>/);
  assert.doesNotMatch(html, /<button[^>]*>Unsafe<\/button>/);
  assert.doesNotMatch(html, /<img|https:\/\//);
});

test("repository preview renders a megabyte of plain prose within an interactive bound", () => {
  const content =
    "# Long field guide\n\n" +
    "Ω😀 Keep every training note local and readable.\n".repeat(28000) +
    "\n## Final evidence\n\nEND-OF-SYNTHETIC-LONG-DOCUMENT\n";
  const started = performance.now();
  const html = renderToStaticMarkup(
    createElement(SafeMarkdown, {
      content,
      documents: [],
      onDocument() {},
      optimizeLongProse: true,
    }),
  );
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 5000, `Long prose render took ${Math.round(elapsed)} ms`);
  assert.ok(html.includes("END-OF-SYNTHETIC-LONG-DOCUMENT"));
});

test("long-prose rendering preserves fenced code, tables and explicit Markdown hard breaks", () => {
  const code = "```text\n" + "line one\nline two\n\n".repeat(3000) + "```";
  const html = renderToStaticMarkup(
    createElement(SafeMarkdown, {
      content: `${code}\n\n| Column | Value |\n| --- | --- |\n| A | B |\n\nHard break  \nnext line`,
      documents: [],
      onDocument() {},
      optimizeLongProse: true,
    }),
  );
  assert.ok(html.includes("line one\nline two\n\nline one"));
  assert.match(html, /<table>/);
  assert.match(html, /Hard break<br\/>\nnext line/);
});

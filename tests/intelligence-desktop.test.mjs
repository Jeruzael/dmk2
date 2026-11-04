import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { _electron as electron } from "playwright";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createIntelligenceSample } from "./intelligence-sample.mjs";

async function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "dmk2-intelligence-"));
  const client = new Client({ name: "intelligence-acceptance", version: "1" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [resolve("dist-node/mcp/server.js")],
      env: { ...process.env, DMK2_DATA_DIR: dir },
      stderr: "pipe",
    }),
  );
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content.find((c) => c.type === "text").text;
    if (result.isError) throw new Error(text);
    return JSON.parse(text);
  };
  await call("get_capabilities");
  await call("list_projects");
  const ids = await createIntelligenceSample(call);
  const env = { ...process.env, DMK2_DATA_DIR: dir };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ args: ["."], env });
  const page = await app.firstWindow();
  await page
    .getByRole("heading", { name: "Trailhead Fitness", exact: true })
    .waitFor();
  t.after(async () => {
    await app.close();
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { app, page, call, ids, dir };
}
test(
  "Backlog contains long source statuses within their cells at all accepted desktop widths",
  { timeout: 90000 },
  async (t) => {
    const { page, ids } = await setup(t);
    await page.getByRole("button", { name: "Plan & WBS", exact: true }).click();
    await page.getByRole("tab", { name: "Backlog", exact: true }).click();
    for (const width of [1024, 1366, 1920]) {
      await page.setViewportSize({ width, height: 950 });
      const source = page
        .locator(".work-table tbody tr")
        .filter({ hasText: "Resolve workout persistence blocker" })
        .locator("td")
        .nth(5);
      const geometry = await source.evaluate((cell) => {
        const chip = cell
          .querySelector(".work-source-chip")
          .getBoundingClientRect();
        const sprint = cell.nextElementSibling.getBoundingClientRect();
        return {
          chipRight: chip.right,
          sprintLeft: sprint.left,
          pageOverflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert.ok(
        geometry.chipRight <= geometry.sprintLeft,
        `Source/Sprint overlap at ${width}: ${JSON.stringify(geometry)}`,
      );
      assert.equal(geometry.pageOverflow, false);
      if (width === 1366) {
        mkdirSync("docs/screenshots/project-intelligence", { recursive: true });
        await page.screenshot({
          path: "docs/screenshots/project-intelligence/backlog-1366.png",
        });
      }
    }
    await page
      .getByRole("button", {
        name: "Resolve workout persistence blocker",
        exact: true,
      })
      .click();
    const drawer = page.getByRole("dialog", {
      name: "Resolve workout persistence blocker",
      exact: true,
    });
    await drawer.getByText(ids.fullSourceStatus, { exact: true }).waitFor();
  },
);
test(
  "Overview initially bounds 42 blockers and keeps all of them accessible",
  { timeout: 90000 },
  async (t) => {
    const { page } = await setup(t);
    assert.equal(await page.locator("[data-overview-blocker]").count(), 5);
    assert.equal(
      await page
        .getByText(
          "A deliberately long project description kept inside expandable context.",
        )
        .isVisible()
        .catch(() => false),
      false,
    );
    await page
      .getByRole("button", { name: "View all 42 blockers", exact: true })
      .click();
    assert.equal(await page.locator("[data-overview-blocker]").count(), 42);
    await page
      .getByRole("button", { name: "Show fewer blockers", exact: true })
      .click();
    assert.equal(await page.locator("[data-overview-blocker]").count(), 5);
    await page.setViewportSize({ width: 1366, height: 950 });
    mkdirSync("docs/screenshots/project-intelligence", { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "docs/screenshots/project-intelligence/overview-1366.png",
    });
    await page
      .getByRole("button", { name: /Resolve workout persistence blocker/ })
      .click();
    await page
      .getByRole("dialog", {
        name: "Resolve workout persistence blocker",
        exact: true,
      })
      .waitFor();
  },
);

test(
  "Question and decision registers retain complete details, claims, links and revisions",
  { timeout: 90000 },
  async (t) => {
    const { page, call, ids } = await setup(t);
    await page.setViewportSize({ width: 1366, height: 950 });
    await page
      .getByRole("button", { name: "Decisions & Questions", exact: true })
      .click();
    assert.equal(
      await page.getByRole("tab", { name: "Questions", exact: true }).count(),
      1,
    );
    await page.getByRole("tab", { name: "Questions", exact: true }).click();
    await page.getByText("Unresolved", { exact: true }).waitFor();
    await page
      .getByRole("button", {
        name: "Who reviews offline reliability?",
        exact: true,
      })
      .click();
    let drawer = page.getByRole("dialog", {
      name: "Who reviews offline reliability?",
      exact: true,
    });
    await drawer
      .getByText("Assign an independent reviewer", { exact: true })
      .waitFor();
    await drawer.getByText("fixture:discovery", { exact: true }).waitFor();
    await drawer
      .getByRole("button", { name: "Edit record", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "Edit question",
      exact: true,
    });
    assert.equal(
      await editor.evaluate((element) =>
        element.contains(document.activeElement),
      ),
      true,
    );
    await editor
      .getByLabel("Question state", { exact: true })
      .selectOption("answered");
    await editor
      .getByLabel("Answer", { exact: true })
      .fill("A named independent reviewer");
    await editor
      .getByLabel("Rationale", { exact: true })
      .fill("Separate implementation from verification");
    await editor.getByRole("button", { name: /Save/ }).click();
    await editor.waitFor({ state: "hidden" });
    await drawer
      .getByText("A named independent reviewer", { exact: true })
      .waitFor();
    const question = await call("get_record", {
      projectId: ids.projectId,
      id: ids.questionId,
    });
    assert.equal(question.revision, 2);
    assert.deepEqual(question.data.sources, ["fixture:discovery"]);
    await drawer.getByText("Revision history", { exact: true }).click();
    await drawer.locator(".timeline-entry").nth(1).waitFor();
    assert.equal(await drawer.locator(".timeline-entry").count(), 2);
    assert.ok(
      (
        await call("get_history", {
          projectId: ids.projectId,
          entityId: ids.questionId,
        })
      ).length === 2,
    );
    await page.keyboard.press("Escape");
    await page
      .getByRole("tab", { name: "Decision Register", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Choose local-first storage", exact: true })
      .click();
    drawer = page.getByRole("dialog", {
      name: "Choose local-first storage",
      exact: true,
    });
    for (const text of [
      "SQLite",
      "Flat JSON files\nRemote database",
      "Maintain compatible migrations",
      "fixture:synthetic-confirmation-claim",
    ]) {
      assert.ok((await drawer.innerText()).includes(text));
    }
    await drawer.getByText(/not authenticated human approval/).waitFor();
    await drawer
      .getByRole("button", {
        name: "Who reviews offline reliability?",
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog", {
        name: "Who reviews offline reliability?",
        exact: true,
      })
      .waitFor();
    await page.keyboard.press("Escape");
    const original = await call("get_record", {
      projectId: ids.projectId,
      id: ids.decisionId,
    });
    await call("record_decision", {
      projectId: ids.projectId,
      id: original.id,
      expectedRevision: original.revision,
      operationId: "agent-update-decision",
      origin: "synthetic-agent",
      data: {
        ...original.data,
        title: "Local storage choice refreshed by MCP",
      },
    });
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await page
      .getByRole("button", {
        name: "Local storage choice refreshed by MCP",
        exact: true,
      })
      .waitFor();
    mkdirSync("docs/screenshots/project-intelligence", { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "docs/screenshots/project-intelligence/decisions-1366.png",
    });
  },
);

test(
  "Security and Architecture subviews expose linked records without implying assurance",
  { timeout: 90000 },
  async (t) => {
    const { page } = await setup(t);
    await page.setViewportSize({ width: 1366, height: 950 });
    await page
      .getByRole("button", { name: "Security & Architecture", exact: true })
      .click();
    const views = [
      ["Components & Relationships", "Editor saves through repository"],
      ["Architecture Decisions", "Keep the renderer isolated"],
      ["Risks & Threats", "Untrusted imported notes"],
      ["Security Requirements", "Block external content"],
    ];
    assert.equal(
      await page.getByRole("tab", { name: views[0][0], exact: true }).count(),
      1,
    );
    for (const [tab, title] of views) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await page.getByRole("button", { name: title, exact: true }).click();
      const drawer = page.getByRole("dialog", { name: title, exact: true });
      await drawer.getByText("Revision history", { exact: true }).waitFor();
      if (tab === "Components & Relationships") {
        await drawer
          .getByRole("button", { name: "Workout repository", exact: true })
          .click();
        await page
          .getByRole("dialog", { name: "Workout repository", exact: true })
          .getByText("SQLite", { exact: true })
          .waitFor();
        await page
          .getByRole("dialog", { name: "Workout repository", exact: true })
          .getByRole("button", {
            name: "Editor saves through repository",
            exact: true,
          })
          .waitFor();
      }
      if (tab === "Risks & Threats") {
        await drawer
          .getByText("Exercise the renderer boundary independently", {
            exact: true,
          })
          .waitFor();
        await drawer.getByText(/do not establish security assurance/).waitFor();
      }
      if (tab === "Security Requirements") {
        await drawer.getByText(/do not establish security assurance/).waitFor();
        await drawer
          .getByText("HTML and images remain disabled", { exact: true })
          .waitFor();
        await drawer
          .getByText("fixture:security-source", { exact: true })
          .waitFor();
      }
      await page.keyboard.press("Escape");
    }
    for (const width of [1024, 1366, 1920]) {
      await page.setViewportSize({ width, height: 950 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
    await page.setViewportSize({ width: 1366, height: 950 });
    mkdirSync("docs/screenshots/project-intelligence", { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "docs/screenshots/project-intelligence/security-1366.png",
    });
  },
);

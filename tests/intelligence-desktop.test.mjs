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

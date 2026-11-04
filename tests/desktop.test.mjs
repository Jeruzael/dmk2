import { test } from "node:test";
import assert from "node:assert/strict";
import { _electron as electron } from "playwright";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createSample } from "../test-results/sample.mjs";

test(
  "Electron displays MCP records, supports local edits and persists after restart without loading untrusted content",
  { timeout: 90000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "dmk2-desktop-"));
    const client = new Client({ name: "desktop-fixture", version: "1" });
    let app;
    try {
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: [resolve("dist-node/mcp/server.js")],
          env: { ...process.env, DMK2_DATA_DIR: dir },
          stderr: "pipe",
        }),
      );
      await createSample(async (name, args) => {
        const result = await client.callTool({ name, arguments: args });
        if (result.isError) throw new Error(JSON.stringify(result));
        return JSON.parse(result.content[0].text);
      });
      await client.close();
      const env = { ...process.env, DMK2_DATA_DIR: dir };
      delete env.ELECTRON_RUN_AS_NODE;
      app = await electron.launch({ args: ["."], env });
      const page = await app.firstWindow();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      const remote = [];
      page.on("request", (r) => {
        if (/^https?:/.test(r.url())) remote.push(r.url());
      });
      await page
        .getByRole("heading", { name: "Sample Fitness Project", exact: true })
        .waitFor();
      assert.equal(
        await page.evaluate(() => typeof window.require),
        "undefined",
      );
      const prefs = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
      );
      const runtime = await app.evaluate(() => process.versions);
      assert.equal(prefs.sandbox, true);
      assert.equal(prefs.contextIsolation, true);
      assert.equal(prefs.nodeIntegration, false);
      await page
        .getByRole("button", { name: "Plan & WBS", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Create workout editor", exact: true })
        .waitFor();
      await page.getByText("Source: DONE", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Documents", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Project brief", exact: true })
        .first()
        .waitFor();
      await page.locator("article table").waitFor();
      await page.getByRole("link", { name: "Safety", exact: true }).click();
      assert.equal(new URL(page.url()).hash, "#safety");
      assert.equal(await page.evaluate(() => window.__untrusted), undefined);
      assert.equal(
        await page.locator("article img, article script").count(),
        0,
      );
      await page
        .getByRole("button", { name: "Edit Project brief", exact: true })
        .click();
      await page
        .getByLabel("Markdown")
        .fill("# Edited locally\n\nPersistent desktop revision.");
      await page
        .getByRole("button", { name: "Save revision", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Edited locally", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Decisions & Questions", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Choose local storage", exact: true })
        .waitFor();
      await page.getByText("Beginner athletes", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Security & Architecture", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Untrusted note content", exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Activity", exact: true }).click();
      await page.getByLabel("Search activity").fill("local-app");
      await page.getByText("local-app", { exact: true }).first().waitFor();
      await page.getByRole("button", { name: "Overview", exact: true }).click();
      await page.setViewportSize({ width: 760, height: 800 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
      );
      mkdirSync("test-results", { recursive: true });
      await page.screenshot({
        path: "test-results/desktop.png",
        fullPage: true,
      });
      assert.deepEqual(remote, []);
      assert.deepEqual(errors, []);
      await app.close();
      app = await electron.launch({ args: ["."], env });
      const restarted = await app.firstWindow();
      await restarted
        .getByRole("heading", { name: "Sample Fitness Project", exact: true })
        .waitFor();
      await restarted
        .getByRole("button", { name: "Documents", exact: true })
        .click();
      await restarted
        .getByRole("heading", { name: "Edited locally", exact: true })
        .waitFor();
      const packagePath = join(dir, "fitness.dmk2");
      await app.evaluate(({ dialog }, path) => {
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: path,
        });
      }, packagePath);
      await restarted
        .getByRole("button", { name: "Export project ↗", exact: true })
        .click();
      await restarted
        .getByRole("status")
        .filter({ hasText: "Exported to" })
        .waitFor();
      const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
      assert.equal(pkg.payload.events.length, 21);
      await app.close();
      app = await electron.launch({
        args: ["."],
        env: { ...env, DMK2_DATA_DIR: join(dir, "fresh-import") },
      });
      const fresh = await app.firstWindow();
      await fresh
        .getByRole("heading", { name: "A clear space for your next project" })
        .waitFor();
      await app.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [path],
        });
      }, packagePath);
      await fresh
        .getByRole("button", { name: "Import .dmk2", exact: true })
        .click();
      await fresh
        .getByRole("heading", { name: "Sample Fitness Project", exact: true })
        .waitFor();
      await fresh
        .getByRole("button", { name: "Documents", exact: true })
        .click();
      await fresh
        .getByRole("heading", { name: "Edited locally", exact: true })
        .waitFor();
      writeFileSync(
        "test-results/desktop-verification.json",
        JSON.stringify(
          {
            runtime,
            persistence: true,
            sandbox: true,
            nativeExportImport: true,
            remoteRequests: remote,
            rendererErrors: errors,
          },
          null,
          2,
        ),
      );
    } finally {
      await client.close();
      await app?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

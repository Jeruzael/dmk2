import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  unlinkSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { _electron as electron } from "playwright";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createRepositoryFixture } from "../test-results/repository-fixture.mjs";

test(
  "Repository Library discovers complete pinned sources, reads long Markdown, navigates and reindexes without importing bodies",
  { timeout: 180000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "dmk2-source-desktop-"));
    const fixture = createRepositoryFixture(join(dir, "source"));
    const client = new Client({
      name: "repository-desktop-acceptance",
      version: "1",
    });
    let app, page;
    const errors = [];
    try {
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
      const project = await call("create_project", {
        operationId: "source-project",
        origin: "synthetic-source-test",
        data: { name: "Trailhead source library" },
      });
      const note = await call("save_document", {
        projectId: project.id,
        operationId: "source-managed-note",
        origin: "synthetic-source-test",
        data: {
          title: "Managed source notes",
          markdown: "# Managed source notes\n\nKeep managed history intact.",
        },
      });
      const env = { ...process.env, DMK2_DATA_DIR: dir };
      delete env.ELECTRON_RUN_AS_NODE;
      app = await electron.launch({
        args: ["--disable-features=CalculateNativeWinOcclusion", "."],
        env,
      });
      page = await app.firstWindow();
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((window) => {
          window.webContents.setBackgroundThrottling(false);
          window.setPosition(-10000, -10000);
          window.showInactive();
        }),
      );
      await page.evaluate(() => {
        window.__sourceClicks = [];
        document.addEventListener(
          "click",
          (event) => {
            const label = event.target
              .closest?.("button")
              ?.getAttribute("aria-label");
            if (label?.startsWith("Open repository document"))
              window.__sourceClicks.push(label);
          },
          true,
        );
      });
      page.setDefaultTimeout(15000);
      const remote = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      page.on("request", (request) => {
        if (/^https?:/.test(request.url())) remote.push(request.url());
      });
      await page
        .getByRole("heading", { name: "Trailhead source library", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Documents", exact: true })
        .click();
      assert.equal(
        await page.getByRole("tab", { name: /Repository Library/ }).count(),
        1,
      );
      await page.getByRole("tab", { name: /Repository Library/ }).click();
      await page.getByText("No repository indexed", { exact: true }).waitFor();
      await app.evaluate(({ dialog }, root) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [root],
        });
      }, fixture.root);
      await page
        .getByRole("button", { name: "Choose repository", exact: true })
        .click();
      await page.getByText("13 indexed", { exact: true }).waitFor();
      await page.getByText("14 eligible", { exact: true }).waitFor();
      await page.getByText("1 skipped", { exact: true }).waitFor();
      await page.getByText(fixture.commit, { exact: true }).first().waitFor();
      assert.equal(
        (await call("list_records", { projectId: project.id })).length,
        1,
      );
      await page
        .getByRole("button", {
          name: "Open repository document README.md",
          exact: true,
        })
        .click();
      await page
        .locator(".repository-preview")
        .getByRole("heading", { name: "Trailhead source library", exact: true })
        .waitFor();
      assert.equal(
        await page
          .locator(".repository-preview img, .repository-preview script")
          .count(),
        0,
      );
      assert.equal(
        await page.evaluate(() => window.__repositoryUnsafe),
        undefined,
      );
      await page
        .locator(".repository-preview")
        .getByRole("button", { name: "Architecture", exact: true })
        .click();
      await page
        .locator(".repository-preview")
        .getByRole("heading", { name: "Component boundary", exact: true })
        .waitFor();
      assert.equal(new URL(page.url()).hash, "#component-boundary");
      assert.equal(
        await page.locator(".repository-preview #system-map").count(),
        1,
      );
      await page.getByLabel("Search repository documents").fill("with space");
      await page
        .getByRole("button", {
          name: "Open repository document Docs/Guides/with space.md",
          exact: true,
        })
        .click();
      await page
        .locator(".repository-preview")
        .getByRole("heading", { name: "Space guide", exact: true })
        .waitFor();
      await page.getByLabel("Search repository documents").fill("");
      await page
        .getByLabel("Search repository documents")
        .fill("Uppercase extension");
      assert.equal(
        await page
          .getByRole("button", {
            name: "Open repository document Docs/Guides/multi.part.MD",
            exact: true,
          })
          .count(),
        1,
      );
      await page.getByLabel("Search repository documents").fill("");
      await page
        .getByRole("button", { name: "Folder Docs/Guides", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Open repository document Docs/Guides/long-guide.md",
          exact: true,
        })
        .click();
      await page.waitForFunction(
        () =>
          document.querySelector(".repository-preview h1")?.textContent ===
          "Long field guide",
        undefined,
        { polling: 100 },
      );
      assert.notEqual(
        await page
          .locator(".repository-preview article > p")
          .last()
          .textContent(),
        "END-OF-SYNTHETIC-LONG-DOCUMENT",
      );
      await page
        .getByRole("button", { name: "Load more content", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          document
            .querySelector(".repository-preview article > p:last-child")
            ?.textContent?.trim() === "END-OF-SYNTHETIC-LONG-DOCUMENT",
        undefined,
        { polling: 100 },
      );
      const end = page.locator(".repository-preview article > p").last();
      await page.waitForFunction(
        () =>
          !!document.querySelector(
            'select[aria-label="Jump to repository heading"] option[value="final-evidence"]',
          ),
        undefined,
        { polling: 100 },
      );
      await page
        .getByLabel("Jump to repository heading")
        .selectOption("final-evidence");
      await page.waitForFunction(
        () => location.hash === "#final-evidence",
        undefined,
        { polling: 100 },
      );
      assert.equal(
        (await end.textContent()).trim(),
        "END-OF-SYNTHETIC-LONG-DOCUMENT",
      );
      assert.equal(await end.isVisible(), true);
      const endGeometry = await end.evaluate((element) => {
        const end = element.getBoundingClientRect();
        const viewport = element
          .closest(".repository-preview")
          .getBoundingClientRect();
        return {
          inside:
            end.bottom <= viewport.bottom + 1 && end.top >= viewport.top - 1,
        };
      });
      assert.equal(endGeometry.inside, true);
      await page
        .locator(".repository-reader-tools")
        .getByText(`Complete · ${Buffer.byteLength(fixture.largeText)} bytes`, {
          exact: true,
        })
        .waitFor();
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
      await page
        .getByRole("button", { name: "All folders", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Open repository document README.md",
          exact: true,
        })
        .click();
      await page
        .locator(".repository-preview")
        .getByRole("heading", { name: "Trailhead source library", exact: true })
        .waitFor();
      mkdirSync("docs/screenshots/project-intelligence", { recursive: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      const capture = await app.evaluate(async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        window.setContentSize(1366, 950);
        return (
          await window.webContents.capturePage(undefined, { stayHidden: true })
        )
          .toPNG()
          .toString("base64");
      });
      writeFileSync(
        "docs/screenshots/project-intelligence/repository-library-1366.png",
        Buffer.from(capture, "base64"),
      );
      await page
        .locator(".repository-layout")
        .evaluate((element) => element.scrollIntoView({ block: "start" }));
      const previewCapture = await app.evaluate(async ({ BrowserWindow }) =>
        (
          await BrowserWindow.getAllWindows()[0].webContents.capturePage(
            undefined,
            { stayHidden: true },
          )
        )
          .toPNG()
          .toString("base64"),
      );
      writeFileSync(
        "docs/screenshots/project-intelligence/repository-preview-1366.png",
        Buffer.from(previewCapture, "base64"),
      );
      fixture.write(
        "Docs/Planning/milestone.md",
        "# Changed milestone\n\nAn observed source revision.\n",
      );
      fixture.write("Docs/Guides/new.md", "# New source guide\n");
      unlinkSync(join(fixture.root, "Docs/Tracking/WBS.md"));
      fixture.git("add", "-A");
      fixture.git("commit", "-m", "Synthetic reindex change");
      await page
        .getByRole("button", { name: "Refresh index", exact: true })
        .click();
      await page
        .getByText("Added 1 · Changed 1 · Removed 1", { exact: true })
        .waitFor();
      const afterLibrary = await call("export_project", {
        projectId: project.id,
      });
      assert.equal(afterLibrary.schemaVersion, 2);
      assert.equal(afterLibrary.payload.records.length, 1);
      assert.equal(JSON.stringify(afterLibrary).includes(fixture.root), false);
      assert.equal(afterLibrary.payload.records[0].id, note.id);
      assert.equal(
        (
          await call("get_history", {
            projectId: project.id,
            entityId: note.id,
          })
        ).length,
        1,
      );
      await app.close();
      app = await electron.launch({
        args: ["--disable-features=CalculateNativeWinOcclusion", "."],
        env,
      });
      page = await app.firstWindow();
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((window) => {
          window.webContents.setBackgroundThrottling(false);
          window.setPosition(-10000, -10000);
          window.showInactive();
        }),
      );
      page.setDefaultTimeout(15000);
      await page
        .getByRole("heading", { name: "Trailhead source library", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Documents", exact: true })
        .click();
      await page
        .getByRole("tab", { name: "Repository Library (13)", exact: true })
        .waitFor();
      await page.getByRole("tab", { name: /Repository Library/ }).click();
      await page.getByText("13 indexed", { exact: true }).waitFor();
      await page
        .getByText("Added 1 · Changed 1 · Removed 1", { exact: true })
        .waitFor();
      renameSync(fixture.root, join(dir, "unavailable-source"));
      await page
        .getByRole("button", { name: "Check source", exact: true })
        .click();
      await page.getByText("13 unavailable", { exact: true }).waitFor();
      await page.getByText(/Last successful index retained/).waitFor();
      assert.deepEqual(
        await call("export_project", { projectId: project.id }),
        afterLibrary,
      );
      await page.getByRole("tab", { name: /Managed Documents/ }).click();
      await page
        .getByRole("heading", { name: "Managed source notes", exact: true })
        .waitFor();
      assert.deepEqual(errors, []);
      assert.deepEqual(remote, []);
    } catch (failure) {
      if (page) {
        const state = await page.evaluate(() => ({
          headings: [
            ...document.querySelectorAll(
              ".repository-preview h1,.repository-preview h2",
            ),
          ].map((node) => node.textContent),
          progress: document.querySelector(".repository-reader-tools")
            ?.textContent,
          alerts: [...document.querySelectorAll('[role="alert"]')].map(
            (node) => node.textContent,
          ),
          tail: document
            .querySelector(".repository-preview")
            ?.textContent?.slice(-350),
          length: document.querySelector(".repository-preview")?.textContent
            ?.length,
        }));
        const clicks = await page.evaluate(() => window.__sourceClicks);
        const marker = await page.evaluate(() => ({
          visibility: document.visibilityState,
          lastHTML: document
            .querySelector(".repository-preview")
            ?.innerHTML.slice(-700),
          lastParagraph: document
            .querySelector(".repository-preview article > p:last-child")
            ?.textContent?.slice(-100),
          predicate:
            document
              .querySelector(".repository-preview article > p:last-child")
              ?.textContent?.trim() === "END-OF-SYNTHETIC-LONG-DOCUMENT",
          h1: (() => {
            const el = document.querySelector(".repository-preview h1");
            return el
              ? {
                  rect: el.getBoundingClientRect().toJSON(),
                  display: getComputedStyle(el).display,
                  visibility: getComputedStyle(el).visibility,
                }
              : null;
          })(),
        }));
        writeFileSync(
          "test-results/phase13-library-failure.json",
          JSON.stringify({ ...state, marker, clicks, errors }, null, 2),
        );
      }
      throw failure;
    } finally {
      await app?.close();
      await client.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

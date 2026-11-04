import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  type IpcMainInvokeEvent,
} from "electron";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { WorkspaceService } from "../core/service.js";
import { dataDirectory, databasePath } from "../core/paths.js";
import { id, toolSchemas, type ToolName } from "../core/schema.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const indexPath = join(root, "dist", "index.html");
const trustedUrl = pathToFileURL(indexPath).href;
const userData = join(dataDirectory(), "electron");
mkdirSync(userData, { recursive: true });
app.setPath("userData", userData);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let service: WorkspaceService;
  let window: BrowserWindow | null = null;
  const checkSender = (event: IpcMainInvokeEvent): void => {
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      event.senderFrame.url.split("#")[0] !== trustedUrl
    )
      throw new Error("Untrusted IPC sender");
  };
  const handle = (
    channel: string,
    action: (event: IpcMainInvokeEvent, ...args: any[]) => unknown,
  ) =>
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      try {
        checkSender(event);
        return { ok: true, value: await action(event, ...args) };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error ? error.message : "Local operation failed",
        };
      }
    });
  app
    .whenReady()
    .then(() => {
      service = new WorkspaceService(databasePath());
      Menu.setApplicationMenu(null);
      session.defaultSession.setPermissionRequestHandler(
        (_wc, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
        callback({
          cancel:
            !details.url.startsWith("file:") &&
            !details.url.startsWith("devtools:"),
        }),
      );
      handle("dmk2:execute", (_event, name: unknown, args: unknown) => {
        if (
          typeof name !== "string" ||
          !Object.hasOwn(toolSchemas, name) ||
          name === "import_project" ||
          name === "export_project"
        )
          throw new Error("Unsupported desktop operation");
        return service.execute(name as ToolName, args);
      });
      handle("dmk2:export", async (_event, projectId: unknown) => {
        const validId = id.parse(projectId);
        const project = service.execute("get_project", {
          projectId: validId,
        }) as { data: { name: string } };
        const target = await dialog.showSaveDialog(window!, {
          title: "Export project",
          defaultPath:
            project.data.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") + ".dmk2",
          filters: [{ name: "DMK2 project", extensions: ["dmk2"] }],
        });
        if (target.canceled || !target.filePath) return null;
        const temporary = target.filePath + "." + randomUUID() + ".tmp";
        try {
          writeFileSync(
            temporary,
            JSON.stringify(
              service.execute("export_project", { projectId: validId }),
              null,
              2,
            ),
            { flag: "wx", mode: 0o600, flush: true },
          );
          renameSync(temporary, target.filePath);
        } finally {
          rmSync(temporary, { force: true });
        }
        return { path: target.filePath };
      });
      handle("dmk2:import", async () => {
        const target = await dialog.showOpenDialog(window!, {
          title: "Import project",
          properties: ["openFile"],
          filters: [{ name: "DMK2 project", extensions: ["dmk2"] }],
        });
        if (target.canceled || !target.filePaths[0]) return null;
        if (statSync(target.filePaths[0]).size > 64 * 1024 * 1024)
          throw new Error(
            "Project package exceeds the 64 MiB desktop import limit",
          );
        const pkg: unknown = JSON.parse(
          readFileSync(target.filePaths[0], "utf8"),
        );
        return service.execute("import_project", {
          operationId: randomUUID(),
          origin: "local-app",
          package: pkg,
        });
      });
      const openWindow = () => {
        window = new BrowserWindow({
          width: 1400,
          height: 950,
          minWidth: 680,
          minHeight: 600,
          title: "DMK2 — Your project canvas",
          backgroundColor: "#f5f6f8",
          webPreferences: {
            preload: join(root, "dist-node", "electron", "preload.cjs"),
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
            webSecurity: true,
            webviewTag: false,
          },
        });
        window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        window.webContents.on("will-navigate", (event) =>
          event.preventDefault(),
        );
        window.webContents.on("will-attach-webview", (event) =>
          event.preventDefault(),
        );
        void window.loadFile(indexPath);
        window.on("closed", () => {
          window = null;
        });
      };
      openWindow();
      app.on("activate", () => {
        if (!window) openWindow();
      });
      app.on("second-instance", () => {
        window?.restore();
        window?.focus();
      });
    })
    .catch((error) => {
      dialog.showErrorBox("DMK2 could not start", String(error));
      app.quit();
    });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("will-quit", () => service?.close());
}

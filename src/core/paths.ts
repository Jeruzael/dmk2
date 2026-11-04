import { homedir } from "node:os";
import { join, resolve } from "node:path";
export function dataDirectory(): string {
  return process.env.DMK2_DATA_DIR
    ? resolve(process.env.DMK2_DATA_DIR)
    : process.platform === "win32"
      ? join(
          process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"),
          "DMK2",
        )
      : process.platform === "darwin"
        ? join(homedir(), "Library", "Application Support", "DMK2")
        : join(
            process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
            "dmk2",
          );
}
export function databasePath(): string {
  return join(dataDirectory(), "workspace.sqlite");
}

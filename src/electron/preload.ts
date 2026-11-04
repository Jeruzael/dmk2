import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("dmk2", {
  execute: (tool: string, args: unknown) =>
    ipcRenderer.invoke("dmk2:execute", tool, args),
  exportProject: (projectId: string) =>
    ipcRenderer.invoke("dmk2:export", projectId),
  importProject: () => ipcRenderer.invoke("dmk2:import"),
});

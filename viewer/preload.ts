/**
 * Pixel Agents — Electron Preload Script
 *
 * Bridges Electron IPC to the window.postMessage API
 * that the webview-ui React app expects.
 */

import { contextBridge, ipcRenderer } from 'electron';

// Expose a VS Code-compatible API to the renderer
contextBridge.exposeInMainWorld('acquireVsCodeApi', () => ({
  postMessage: (msg: unknown) => {
    ipcRenderer.send('pixel-agents-command', msg);
  },
}));

// Forward messages from main process → window.postMessage (what the React app listens to)
ipcRenderer.on('pixel-agents-message', (_event, data) => {
  window.postMessage(data, '*');
});

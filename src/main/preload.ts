import { contextBridge, ipcRenderer } from 'electron';

import type { StickyVikBridge } from '../shared/types';

const bridge: StickyVikBridge = {
  getWindowContext: () => ipcRenderer.invoke('app:get-window-context'),
  getManagerBootstrap: () => ipcRenderer.invoke('manager:get-bootstrap'),
  getPanelBootstrap: (panelId) => ipcRenderer.invoke('panel:get-bootstrap', panelId),
  getDetailsBootstrap: (panelId, taskId) => ipcRenderer.invoke('details:get-bootstrap', panelId, taskId),
  saveSettings: (input) => ipcRenderer.invoke('settings:save', input),
  testConnection: (input) => ipcRenderer.invoke('settings:test-connection', input),
  syncNow: () => ipcRenderer.invoke('sync:now'),
  createPanel: () => ipcRenderer.invoke('panel:create'),
  updatePanel: (panel) => ipcRenderer.invoke('panel:update', panel),
  deletePanel: (panelId) => ipcRenderer.invoke('panel:delete', panelId),
  showManager: () => ipcRenderer.invoke('app:show-manager'),
  showAllPanels: () => ipcRenderer.invoke('app:show-all-panels'),
  hideAllPanels: () => ipcRenderer.invoke('app:hide-all-panels'),
  openTaskDetails: (panelId, taskId) => ipcRenderer.invoke('task:open-details', panelId, taskId),
  togglePauseAlwaysOnTop: () => ipcRenderer.invoke('app:toggle-pause-always-on-top'),
  setPanelHoverState: (panelId, hovered) => ipcRenderer.invoke('panel:set-hover-state', panelId, hovered),
  togglePanelMinimized: (panelId) => ipcRenderer.invoke('panel:toggle-minimized', panelId),
  createTask: (panelId, title) => ipcRenderer.invoke('task:create', panelId, title),
  toggleTaskDone: (panelId, taskId, done) => ipcRenderer.invoke('task:toggle-done', panelId, taskId, done),
  renameTask: (panelId, taskId, title) => ipcRenderer.invoke('task:rename', panelId, taskId, title),
  moveTask: (panelId, taskId, projectId) => ipcRenderer.invoke('task:move', panelId, taskId, projectId),
  moveTaskToBucket: (panelId, taskId, bucketId) => ipcRenderer.invoke('task:move-bucket', panelId, taskId, bucketId),
  reorderTaskInBucket: (panelId, taskId, bucketId, beforeTaskId, afterTaskId) =>
    ipcRenderer.invoke('task:reorder', panelId, taskId, bucketId, beforeTaskId, afterTaskId),
  getTaskDetails: (taskId) => ipcRenderer.invoke('task:get-details', taskId),
  onStateInvalidated: (listener) => {
    const subscription = () => listener();
    ipcRenderer.on('state:invalidated', subscription);
    return () => {
      ipcRenderer.removeListener('state:invalidated', subscription);
    };
  }
};

contextBridge.exposeInMainWorld('stickyVik', bridge);

import { app, BrowserWindow, ipcMain, Menu, Notification } from 'electron';

import type { AppSettings, ManagerBootstrap, PanelBootstrap, PanelConfig, SyncState, WindowContext } from '../shared/types';
import { clearStoredSecret, loadStoredSecret, saveStoredSecret } from './services/credentials';
import {
  applyPanelWindowState,
  capturePanelBounds,
  createManagerWindow,
  createPanelWindow,
  loadWindow,
  makeTray
} from './services/panel-window';
import {
  getPanels,
  getProjects,
  getSettings,
  getSyncState,
  getTaskCache,
  initStateStore,
  makeDefaultPanel,
  removeTaskCache,
  setPanels,
  setProjects,
  setSettings,
  setSyncState,
  setTaskCache
} from './services/state-store';
import {
  createTask,
  fetchProjects,
  fetchTasksForPanel,
  getTaskDetails,
  moveTask,
  renameTask,
  setTaskDone,
  testConnection
} from './services/vikunja-client';

let managerWindow: BrowserWindow | null = null;
const panelWindows = new Map<string, BrowserWindow>();
const windowContexts = new Map<number, WindowContext>();
const hoverTimers = new Map<string, NodeJS.Timeout>();
const notificationMemory = new Set<string>();
let tray = makeTray();
let isQuitting = false;
let syncTimer: NodeJS.Timeout | null = null;
let suppressPanelDeletion = false;

function getVisibleProjects() {
  const settings = getSettings();
  const projects = getProjects().filter((project) => !project.isArchived);
  if (settings.allowedProjectIds.length === 0) {
    if (settings.includeSubprojects) {
      return projects;
    }

    return projects.filter((project) => project.parentProjectId === null);
  }

  return projects.filter((project) => settings.allowedProjectIds.includes(project.id));
}

async function buildManagerBootstrap(): Promise<ManagerBootstrap> {
  const secret = await loadStoredSecret();
  return {
    window: { view: 'manager' },
    settings: getSettings(),
    panels: getPanels(),
    projects: getVisibleProjects(),
    sync: getSyncState(),
    credentials: {
      hasSecret: Boolean(secret?.secret)
    }
  };
}

async function buildPanelBootstrap(panelId: string): Promise<PanelBootstrap> {
  const panel = getPanels().find((entry) => entry.id === panelId);
  if (!panel) {
    throw new Error(`Panel ${panelId} was not found`);
  }

  return {
    window: { view: 'panel', panelId },
    panel,
    settings: getSettings(),
    projects: getVisibleProjects(),
    tasks: getTaskCache(panelId),
    sync: getSyncState()
  };
}

function invalidateState() {
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.webContents.send('state:invalidated');
  }

  for (const window of panelWindows.values()) {
    if (!window.isDestroyed()) {
      window.webContents.send('state:invalidated');
    }
  }

  updateTrayMenu();
}

function scheduleSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }

  const settings = getSettings();
  syncTimer = setInterval(() => {
    void syncAll();
  }, Math.max(settings.syncIntervalSeconds, 30) * 1000);
}

function applyLoginItemSettings(settings: AppSettings) {
  app.setLoginItemSettings({
    openAtLogin: settings.launchAtStartup
  });
}

function dispatchNotifications() {
  const settings = getSettings();
  if (!settings.notifications.enabled) {
    return;
  }

  for (const panel of getPanels()) {
    const tasks = getTaskCache(panel.id);
    for (const task of tasks) {
      if (!task.dueDate || task.done) {
        continue;
      }

      const due = new Date(task.dueDate);
      const isDueToday = due.toDateString() === new Date().toDateString();
      const isOverdue = due.getTime() < Date.now();
      const shouldNotify =
        (settings.notifications.dueToday && isDueToday) ||
        (settings.notifications.overdue && isOverdue);
      if (!shouldNotify) {
        continue;
      }

      const key = `${panel.id}:${task.id}:${isOverdue ? 'overdue' : 'today'}`;
      if (notificationMemory.has(key)) {
        continue;
      }

      notificationMemory.add(key);
      new Notification({
        title: `${panel.name}: ${task.title}`,
        body: isOverdue ? 'This task is overdue in Vikunja Sticky.' : 'This task is due today in Vikunja Sticky.'
      }).show();
    }
  }
}

async function syncAll() {
  const settings = getSettings();
  const secret = await loadStoredSecret();
  if (!settings.serverUrl || !secret?.secret) {
    setSyncState({
      status: 'idle',
      lastSyncAt: getSyncState().lastSyncAt,
      lastError: null
    });
    invalidateState();
    return;
  }

  setSyncState({
    status: 'syncing',
    lastSyncAt: getSyncState().lastSyncAt,
    lastError: null
  });
  invalidateState();

  try {
    const projects = await fetchProjects(settings);
    setProjects(projects);

    for (const panel of getPanels()) {
      if (!panel.projectId) {
        setTaskCache(panel.id, []);
        continue;
      }

      const tasks = await fetchTasksForPanel(settings, panel);
      setTaskCache(panel.id, tasks);
    }

    const now = new Date().toISOString();
    dispatchNotifications();
    setSyncState({
      status: 'ready',
      lastSyncAt: now,
      lastError: null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error';
    const status: SyncState['status'] = /401|403|login|token/i.test(message) ? 'error' : 'offline';
    setSyncState({
      status,
      lastSyncAt: getSyncState().lastSyncAt,
      lastError: message
    });
  }

  invalidateState();
}

async function ensureManagerWindow() {
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.show();
    managerWindow.focus();
    return managerWindow;
  }

  managerWindow = createManagerWindow();
  windowContexts.set(managerWindow.webContents.id, { view: 'manager' });
  managerWindow.on('ready-to-show', () => managerWindow?.show());
  managerWindow.on('closed', () => {
    managerWindow = null;
  });
  await loadWindow(managerWindow, { view: 'manager' });
  return managerWindow;
}

function persistPanel(panel: PanelConfig) {
  const panels = getPanels();
  const nextPanels = panels.some((entry) => entry.id === panel.id)
    ? panels.map((entry) => (entry.id === panel.id ? panel : entry))
    : [...panels, panel];
  setPanels(nextPanels);
}

async function createOrShowPanelWindow(panel: PanelConfig) {
  const existing = panelWindows.get(panel.id);
  if (existing && !existing.isDestroyed()) {
    applyPanelWindowState(existing, panel, getSettings().pauseAlwaysOnTop);
    existing.show();
    return existing;
  }

  const window = createPanelWindow(panel, getSettings().pauseAlwaysOnTop);
  panelWindows.set(panel.id, window);
  windowContexts.set(window.webContents.id, { view: 'panel', panelId: panel.id });

  window.on('ready-to-show', () => window.show());
  window.on('move', () => {
    const nextPanel = getPanels().find((entry) => entry.id === panel.id);
    if (!nextPanel) {
      return;
    }

    persistPanel({
      ...nextPanel,
      bounds: capturePanelBounds(window, nextPanel)
    });
  });
  window.on('resize', () => {
    const nextPanel = getPanels().find((entry) => entry.id === panel.id);
    if (!nextPanel) {
      return;
    }

    persistPanel({
      ...nextPanel,
      bounds: capturePanelBounds(window, nextPanel)
    });
  });
  window.on('closed', () => {
    panelWindows.delete(panel.id);
    windowContexts.delete(window.webContents.id);
    if (!isQuitting && !suppressPanelDeletion) {
      setPanels(getPanels().filter((entry) => entry.id !== panel.id));
      removeTaskCache(panel.id);
      invalidateState();
    }
  });

  await loadWindow(window, { view: 'panel', panelId: panel.id });
  return window;
}

function showAllPanels() {
  for (const panel of getPanels()) {
    void createOrShowPanelWindow(panel);
  }
}

function hideAllPanels() {
  for (const window of panelWindows.values()) {
    window.hide();
  }
}

function updateTrayMenu() {
  const settings = getSettings();
  const sync = getSyncState();
  tray.setToolTip(`Vikunja Sticky (${sync.status})`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Create New Sticky Panel', click: () => void handleCreatePanel() },
      { label: 'Show All Panels', click: () => showAllPanels() },
      { label: 'Hide All Panels', click: () => hideAllPanels() },
      { label: 'Refresh All / Sync Now', click: () => void syncAll() },
      { type: 'separator' },
      { label: 'Open Settings', click: () => void ensureManagerWindow() },
      {
        label: 'Pause Always-On-Top',
        type: 'checkbox',
        checked: settings.pauseAlwaysOnTop,
        click: () => void togglePauseAlwaysOnTop()
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  );
}

async function togglePauseAlwaysOnTop() {
  const settings = getSettings();
  const nextSettings = {
    ...settings,
    pauseAlwaysOnTop: !settings.pauseAlwaysOnTop
  };
  setSettings(nextSettings);
  for (const panel of getPanels()) {
    const window = panelWindows.get(panel.id);
    if (window) {
      applyPanelWindowState(window, panel, nextSettings.pauseAlwaysOnTop);
    }
  }
  invalidateState();
}

async function handleCreatePanel() {
  const panel = makeDefaultPanel(getPanels().length + 1);
  persistPanel(panel);
  await createOrShowPanelWindow(panel);
  if (panel.projectId) {
    await syncAll();
  }
  invalidateState();
  return panel;
}

async function saveSettingsAndSync(payload: { settings: AppSettings; secret?: string }) {
  setSettings(payload.settings);
  applyLoginItemSettings(payload.settings);
  scheduleSync();

  if (payload.secret) {
    await saveStoredSecret({
      authMethod: payload.settings.authMethod,
      username: payload.settings.username,
      secret: payload.secret
    });
  } else if (!payload.settings.serverUrl) {
    await clearStoredSecret();
  }

  if (payload.settings.serverUrl) {
    await syncAll();
  }

  invalidateState();
  return buildManagerBootstrap();
}

async function updatePanel(panel: PanelConfig) {
  persistPanel(panel);
  const window = await createOrShowPanelWindow(panel);
  applyPanelWindowState(window, panel, getSettings().pauseAlwaysOnTop);
  if (panel.projectId) {
    try {
      const tasks = await fetchTasksForPanel(getSettings(), panel);
      setTaskCache(panel.id, tasks);
    } catch {
      // Keep the existing cache when a panel-specific refresh fails.
    }
  }
  invalidateState();
  return panel;
}

async function deletePanel(panelId: string) {
  suppressPanelDeletion = true;
  const window = panelWindows.get(panelId);
  if (window && !window.isDestroyed()) {
    window.close();
  }
  suppressPanelDeletion = false;
  setPanels(getPanels().filter((panel) => panel.id !== panelId));
  removeTaskCache(panelId);
  invalidateState();
}

async function refreshSinglePanel(panelId: string) {
  const panel = getPanels().find((entry) => entry.id === panelId);
  if (!panel || !panel.projectId) {
    setTaskCache(panelId, []);
    return;
  }

  const tasks = await fetchTasksForPanel(getSettings(), panel);
  setTaskCache(panelId, tasks);
}

async function handlePanelHover(panelId: string, hovered: boolean) {
  const panel = getPanels().find((entry) => entry.id === panelId);
  if (!panel || panel.displayMode !== 'edge-docked') {
    return;
  }

  const existing = hoverTimers.get(panelId);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(async () => {
    const current = getPanels().find((entry) => entry.id === panelId);
    if (!current) {
      return;
    }

    const next = {
      ...current,
      hoverExpanded: hovered
    };
    persistPanel(next);
    const window = panelWindows.get(panelId);
    if (window) {
      applyPanelWindowState(window, next, getSettings().pauseAlwaysOnTop);
    }
    invalidateState();
  }, hovered ? 140 : 650);

  hoverTimers.set(panelId, timer);
}

async function bootstrap() {
  await initStateStore();
  applyLoginItemSettings(getSettings());
  scheduleSync();
  tray.on('double-click', () => void ensureManagerWindow());
  updateTrayMenu();

  const storedSecret = await loadStoredSecret();
  if (!storedSecret || getPanels().length === 0) {
    await ensureManagerWindow();
  }

  for (const panel of getPanels()) {
    await createOrShowPanelWindow(panel);
  }

  if (storedSecret) {
    void syncAll();
  }

  ipcMain.handle('app:get-window-context', async (event) => {
    return windowContexts.get(event.sender.id) ?? { view: 'manager' };
  });

  ipcMain.handle('manager:get-bootstrap', async () => buildManagerBootstrap());
  ipcMain.handle('panel:get-bootstrap', async (_event, panelId: string) => {
    if (getTaskCache(panelId).length === 0) {
      try {
        await refreshSinglePanel(panelId);
      } catch {
        // Preserve cached state on bootstrap refresh failure.
      }
    }
    return buildPanelBootstrap(panelId);
  });
  ipcMain.handle('settings:test-connection', async (_event, payload) => {
    try {
      const projects = await testConnection(payload);
      return {
        ok: true,
        message: `Connected to ${projects.length} projects`,
        projects
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Connection failed',
        projects: []
      };
    }
  });
  ipcMain.handle('settings:save', async (_event, payload) => saveSettingsAndSync(payload));
  ipcMain.handle('sync:now', async () => {
    await syncAll();
  });
  ipcMain.handle('panel:create', async () => handleCreatePanel());
  ipcMain.handle('panel:update', async (_event, panel: PanelConfig) => updatePanel(panel));
  ipcMain.handle('panel:delete', async (_event, panelId: string) => {
    await deletePanel(panelId);
  });
  ipcMain.handle('app:show-manager', async () => {
    await ensureManagerWindow();
  });
  ipcMain.handle('app:show-all-panels', async () => {
    showAllPanels();
  });
  ipcMain.handle('app:hide-all-panels', async () => {
    hideAllPanels();
  });
  ipcMain.handle('app:toggle-pause-always-on-top', async () => {
    await togglePauseAlwaysOnTop();
  });
  ipcMain.handle('panel:set-hover-state', async (_event, panelId: string, hovered: boolean) => {
    await handlePanelHover(panelId, hovered);
  });
  ipcMain.handle('panel:toggle-minimized', async (_event, panelId: string) => {
    const panel = getPanels().find((entry) => entry.id === panelId);
    if (!panel) {
      throw new Error(`Panel ${panelId} not found`);
    }

    const next: PanelConfig = {
      ...panel,
      displayMode: panel.displayMode === 'minimized' ? 'full' : 'minimized'
    };
    await updatePanel(next);
    return next;
  });
  ipcMain.handle('task:create', async (_event, panelId: string, title: string) => {
    const panel = getPanels().find((entry) => entry.id === panelId);
    if (!panel?.projectId) {
      throw new Error('Choose a project before creating tasks');
    }

    await createTask(getSettings(), panel.projectId, title);
    await refreshSinglePanel(panelId);
    invalidateState();
  });
  ipcMain.handle('task:toggle-done', async (_event, panelId: string, taskId: number, done: boolean) => {
    const cached = getTaskCache(panelId);
    setTaskCache(
      panelId,
      cached.map((task) => (task.id === taskId ? { ...task, done } : task))
    );
    invalidateState();

    try {
      await setTaskDone(getSettings(), taskId, done);
      await refreshSinglePanel(panelId);
    } catch (error) {
      await refreshSinglePanel(panelId);
      throw error;
    } finally {
      invalidateState();
    }
  });
  ipcMain.handle('task:rename', async (_event, panelId: string, taskId: number, title: string) => {
    await renameTask(getSettings(), taskId, title);
    await refreshSinglePanel(panelId);
    invalidateState();
  });
  ipcMain.handle('task:move', async (_event, panelId: string, taskId: number, projectId: number) => {
    await moveTask(getSettings(), taskId, projectId);
    await refreshSinglePanel(panelId);
    invalidateState();
  });
  ipcMain.handle('task:get-details', async (_event, taskId: number) => getTaskDetails(getSettings(), taskId));
}

app.whenReady().then(async () => {
  await bootstrap();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void ensureManagerWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // The tray app stays resident even when all windows are closed.
});


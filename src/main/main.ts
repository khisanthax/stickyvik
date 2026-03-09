import { app, BrowserWindow, ipcMain, Menu, Notification, screen } from 'electron';

import type { VikunjaProject } from '../shared/types';

import type {
  AppSettings,
  DetailsBootstrap,
  ManagerBootstrap,
  PanelBootstrap,
  PanelConfig,
  SyncState,
  VikunjaTask,
  WindowContext
} from '../shared/types';
import { clearStoredSecret, loadStoredSecret, saveStoredSecret } from './services/credentials';
import {
  applyPanelWindowState,
  capturePanelBounds,
  createDetailsWindow,
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

interface PanelRuntimeState {
  hovered: boolean;
  focused: boolean;
  expanded: boolean;
  timer?: NodeJS.Timeout;
}

let managerWindow: BrowserWindow | null = null;
const panelWindows = new Map<string, BrowserWindow>();
const detailsWindows = new Map<string, BrowserWindow>();
const panelRuntime = new Map<string, PanelRuntimeState>();
const windowContexts = new Map<number, WindowContext>();
const notificationMemory = new Set<string>();
let tray: ReturnType<typeof makeTray> | null = null;
let isQuitting = false;
let syncTimer: NodeJS.Timeout | null = null;
let suppressPanelDeletion = false;

function getVisibleProjects() {
  const settings = getSettings();
  const projects = getProjects().filter((project) => !project.isArchived);
  if (settings.allowedProjectIds.length === 0) {
    return settings.includeSubprojects ? projects : projects.filter((project) => project.parentProjectId === null);
  }

  return projects.filter((project) => settings.allowedProjectIds.includes(project.id));
}

function getDetailWindowKey(panelId: string, taskId: number) {
  return `${panelId}:${taskId}`;
}

function buildProjectLabel(projectId: number, projects: VikunjaProject[]) {
  const lookup = new Map(projects.map((project) => [project.id, project]));
  const segments: string[] = [];
  let current = lookup.get(projectId) ?? null;

  while (current) {
    segments.unshift(current.title);
    current = current.parentProjectId ? lookup.get(current.parentProjectId) ?? null : null;
  }

  return segments.join(' / ');
}

function syncPanelNameWithProject(panel: PanelConfig, projects = getProjects()) {
  if (!panel.projectId) {
    return panel;
  }

  const projectLabel = buildProjectLabel(panel.projectId, projects);
  if (!projectLabel) {
    return panel;
  }

  if (panel.name === projectLabel) {
    return panel;
  }

  return {
    ...panel,
    name: projectLabel
  };
}

function getPanelRuntime(panelId: string): PanelRuntimeState {
  const existing = panelRuntime.get(panelId);
  if (existing) {
    return existing;
  }

  const created: PanelRuntimeState = {
    hovered: false,
    focused: false,
    expanded: false
  };
  panelRuntime.set(panelId, created);
  return created;
}

function getEffectivePanel(panel: PanelConfig): PanelConfig {
  const runtime = getPanelRuntime(panel.id);
  return {
    ...panel,
    hoverExpanded: panel.displayMode === 'edge-docked' ? runtime.expanded : false
  };
}

function clearPanelRuntimeTimer(panelId: string) {
  const runtime = getPanelRuntime(panelId);
  if (runtime.timer) {
    clearTimeout(runtime.timer);
    runtime.timer = undefined;
  }
}

function syncSinglePanelWindow(panelId: string) {
  const panel = getPanels().find((entry) => entry.id === panelId);
  const window = panelWindows.get(panelId);
  if (!panel || !window || window.isDestroyed()) {
    return;
  }

  applyPanelWindowState(window, getEffectivePanel(panel), getSettings().pauseAlwaysOnTop);
}

function schedulePanelExpandedState(panelId: string, expanded: boolean, delayMs: number) {
  const runtime = getPanelRuntime(panelId);
  clearPanelRuntimeTimer(panelId);

  if (runtime.expanded === expanded) {
    return;
  }

  runtime.timer = setTimeout(() => {
    if (runtime.expanded === expanded) {
      runtime.timer = undefined;
      return;
    }

    runtime.expanded = expanded;
    runtime.timer = undefined;
    syncSinglePanelWindow(panelId);
  }, delayMs);
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
    panel: getEffectivePanel(panel),
    settings: getSettings(),
    projects: getVisibleProjects(),
    tasks: getTaskCache(panelId),
    sync: getSyncState()
  };
}

async function buildDetailsBootstrap(panelId: string, taskId: number): Promise<DetailsBootstrap> {
  const panel = getPanels().find((entry) => entry.id === panelId);
  if (!panel) {
    throw new Error(`Panel ${panelId} was not found`);
  }

  let task: VikunjaTask | null = null;
  try {
    task = await getTaskDetails(getSettings(), taskId);
  } catch {
    task = getTaskCache(panelId).find((entry) => entry.id === taskId) ?? null;
  }

  if (!task) {
    throw new Error(`Task ${taskId} was not found`);
  }

  return {
    window: { view: 'details', panelId, taskId },
    panel: getEffectivePanel(panel),
    task,
    projects: getVisibleProjects(),
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

  for (const window of detailsWindows.values()) {
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

function getPanelNotificationRules(panel: PanelConfig) {
  const settings = getSettings();
  if (!settings.notifications.enabled) {
    return { dueToday: false, overdue: false };
  }

  if (panel.notificationMode === 'off') {
    return { dueToday: false, overdue: false };
  }

  if (panel.notificationMode === 'dueToday') {
    return { dueToday: true, overdue: false };
  }

  if (panel.notificationMode === 'overdue') {
    return { dueToday: false, overdue: true };
  }

  if (panel.notificationMode === 'dueTodayAndOverdue') {
    return { dueToday: true, overdue: true };
  }

  return {
    dueToday: settings.notifications.dueToday,
    overdue: settings.notifications.overdue
  };
}

function dispatchNotifications() {
  for (const panel of getPanels()) {
    const rules = getPanelNotificationRules(panel);
    if (!rules.dueToday && !rules.overdue) {
      continue;
    }

    const tasks = getTaskCache(panel.id);
    for (const task of tasks) {
      if (!task.dueDate || task.done) {
        continue;
      }

      const due = new Date(task.dueDate);
      const isDueToday = due.toDateString() === new Date().toDateString();
      const isOverdue = due.getTime() < Date.now();
      const shouldNotify = (rules.dueToday && isDueToday) || (rules.overdue && isOverdue);
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

    const syncedPanels = getPanels().map((panel) => syncPanelNameWithProject(panel, projects));
    setPanels(syncedPanels);

    for (const panel of syncedPanels) {
      if (!panel.projectId) {
        setTaskCache(panel.id, []);
        continue;
      }

      const tasks = await fetchTasksForPanel(settings, panel, projects);
      setTaskCache(panel.id, tasks);
    }

    dispatchNotifications();
    setSyncState({
      status: 'ready',
      lastSyncAt: new Date().toISOString(),
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
  const managerWindowId = managerWindow.webContents.id;
  windowContexts.set(managerWindowId, { view: 'manager' });
  managerWindow.on('ready-to-show', () => managerWindow?.show());
  managerWindow.on('closed', () => {
    windowContexts.delete(managerWindowId);
    managerWindow = null;
  });
  await loadWindow(managerWindow, { view: 'manager' });
  return managerWindow;
}

function persistPanel(panel: PanelConfig) {
  const syncedPanel = syncPanelNameWithProject(panel);
  const panels = getPanels();
  const nextPanels = panels.some((entry) => entry.id === syncedPanel.id)
    ? panels.map((entry) => (entry.id === syncedPanel.id ? syncedPanel : entry))
    : [...panels, syncedPanel];
  setPanels(nextPanels);
  return syncedPanel;
}

function handlePanelFocusChange(panelId: string, focused: boolean) {
  const panel = getPanels().find((entry) => entry.id === panelId);
  if (!panel || panel.displayMode !== 'edge-docked') {
    return;
  }

  const runtime = getPanelRuntime(panelId);
  runtime.focused = focused;
  if (focused) {
    schedulePanelExpandedState(panelId, true, 0);
    return;
  }

  if (!runtime.hovered) {
    schedulePanelExpandedState(panelId, false, 420);
  }
}

async function createOrShowPanelWindow(panel: PanelConfig) {
  const existing = panelWindows.get(panel.id);
  if (existing && !existing.isDestroyed()) {
    applyPanelWindowState(existing, getEffectivePanel(panel), getSettings().pauseAlwaysOnTop);
    existing.show();
    return existing;
  }

  const window = createPanelWindow(getEffectivePanel(panel), getSettings().pauseAlwaysOnTop);
  const panelWindowId = window.webContents.id;
  panelWindows.set(panel.id, window);
  panelRuntime.set(panel.id, {
    hovered: false,
    focused: false,
    expanded: false
  });
  windowContexts.set(panelWindowId, { view: 'panel', panelId: panel.id });

  window.on('ready-to-show', () => window.show());
  window.on('show', () => {
    const runtime = getPanelRuntime(panel.id);
    runtime.focused = false;
    runtime.hovered = false;
    runtime.expanded = false;
    clearPanelRuntimeTimer(panel.id);
    syncSinglePanelWindow(panel.id);
  });
  window.on('hide', () => {
    const runtime = getPanelRuntime(panel.id);
    runtime.focused = false;
    runtime.hovered = false;
    runtime.expanded = false;
    clearPanelRuntimeTimer(panel.id);
  });
  window.on('focus', () => handlePanelFocusChange(panel.id, true));
  window.on('blur', () => handlePanelFocusChange(panel.id, false));
  window.on('move', () => {
    const nextPanel = getPanels().find((entry) => entry.id === panel.id);
    if (!nextPanel) {
      return;
    }

    const nextBounds = capturePanelBounds(window, getEffectivePanel(nextPanel));
    persistPanel({
      ...nextPanel,
      displayId: nextBounds.displayId,
      bounds: nextBounds
    });
  });
  window.on('resize', () => {
    const nextPanel = getPanels().find((entry) => entry.id === panel.id);
    if (!nextPanel) {
      return;
    }

    const nextBounds = capturePanelBounds(window, getEffectivePanel(nextPanel));
    persistPanel({
      ...nextPanel,
      displayId: nextBounds.displayId,
      bounds: nextBounds
    });
  });
  window.on('closed', () => {
    panelWindows.delete(panel.id);
    clearPanelRuntimeTimer(panel.id);
    panelRuntime.delete(panel.id);
    windowContexts.delete(panelWindowId);
    if (!isQuitting && !suppressPanelDeletion) {
      setPanels(getPanels().filter((entry) => entry.id !== panel.id));
      removeTaskCache(panel.id);
      for (const [key, detailsWindow] of detailsWindows.entries()) {
        if (key.startsWith(`${panel.id}:`) && !detailsWindow.isDestroyed()) {
          detailsWindow.close();
        }
      }
      invalidateState();
    }
  });

  await loadWindow(window, { view: 'panel', panelId: panel.id });
  return window;
}

async function createOrShowDetailsWindow(panelId: string, taskId: number) {
  const key = getDetailWindowKey(panelId, taskId);
  const existing = detailsWindows.get(key);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return existing;
  }

  const parent = panelWindows.get(panelId);
  const window = createDetailsWindow(parent);
  const detailsWindowId = window.webContents.id;
  detailsWindows.set(key, window);
  windowContexts.set(detailsWindowId, { view: 'details', panelId, taskId });
  window.on('ready-to-show', () => window.show());
  window.on('closed', () => {
    detailsWindows.delete(key);
    windowContexts.delete(detailsWindowId);
  });
  await loadWindow(window, { view: 'details', panelId, taskId });
  return window;
}

function showAllPanels() {
  for (const panel of getPanels()) {
    void createOrShowPanelWindow(panel);
  }
}

function hideAllPanels() {
  for (const [panelId, window] of panelWindows.entries()) {
    const runtime = getPanelRuntime(panelId);
    runtime.focused = false;
    runtime.hovered = false;
    runtime.expanded = false;
    clearPanelRuntimeTimer(panelId);
    window.hide();
  }
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

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
      applyPanelWindowState(window, getEffectivePanel(panel), nextSettings.pauseAlwaysOnTop);
    }
  }
  invalidateState();
}

async function handleCreatePanel() {
  const panel = persistPanel(makeDefaultPanel(getPanels().length + 1));
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
  const nextPanel = persistPanel({
    ...panel,
    hoverExpanded: false
  });
  const runtime = getPanelRuntime(nextPanel.id);
  runtime.expanded = false;
  const window = await createOrShowPanelWindow(nextPanel);
  applyPanelWindowState(window, getEffectivePanel(nextPanel), getSettings().pauseAlwaysOnTop);
  if (nextPanel.projectId) {
    try {
      const tasks = await fetchTasksForPanel(getSettings(), nextPanel, getProjects());
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
  for (const [key, detailsWindow] of detailsWindows.entries()) {
    if (key.startsWith(`${panelId}:`) && !detailsWindow.isDestroyed()) {
      detailsWindow.close();
    }
  }
  invalidateState();
}

async function refreshSinglePanel(panelId: string) {
  const panel = getPanels().find((entry) => entry.id === panelId);
  if (!panel || !panel.projectId) {
    setTaskCache(panelId, []);
    return;
  }

  const tasks = await fetchTasksForPanel(getSettings(), panel, getProjects());
  setTaskCache(panelId, tasks);
}

async function handlePanelHover(panelId: string, hovered: boolean) {
  const panel = getPanels().find((entry) => entry.id === panelId);
  if (!panel || panel.displayMode !== 'edge-docked') {
    return;
  }

  const runtime = getPanelRuntime(panelId);
  if (runtime.hovered === hovered) {
    return;
  }

  runtime.hovered = hovered;
  if (hovered) {
    schedulePanelExpandedState(panelId, true, 100);
    return;
  }

  if (!runtime.focused) {
    schedulePanelExpandedState(panelId, false, 560);
  }
}

function reconcilePanelWindows() {
  for (const panel of getPanels()) {
    const window = panelWindows.get(panel.id);
    if (!window || window.isDestroyed()) {
      continue;
    }

    const runtime = getPanelRuntime(panel.id);
    runtime.expanded = false;
    clearPanelRuntimeTimer(panel.id);
    const effective = getEffectivePanel(panel);
    applyPanelWindowState(window, effective, getSettings().pauseAlwaysOnTop);
    const nextBounds = capturePanelBounds(window, effective);
    persistPanel({
      ...panel,
      displayId: nextBounds.displayId,
      bounds: nextBounds,
      hoverExpanded: false
    });
  }

  invalidateState();
}

async function bootstrap() {
  await initStateStore();
  applyLoginItemSettings(getSettings());
  scheduleSync();
  tray = makeTray();
  tray.on('double-click', () => void ensureManagerWindow());
  updateTrayMenu();

  screen.on('display-added', () => reconcilePanelWindows());
  screen.on('display-removed', () => reconcilePanelWindows());
  screen.on('display-metrics-changed', () => reconcilePanelWindows());

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
  ipcMain.handle('details:get-bootstrap', async (_event, panelId: string, taskId: number) => {
    return buildDetailsBootstrap(panelId, taskId);
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
  ipcMain.handle('task:open-details', async (_event, panelId: string, taskId: number) => {
    await createOrShowDetailsWindow(panelId, taskId);
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
      displayMode: panel.displayMode === 'minimized' ? 'full' : 'minimized',
      hoverExpanded: false
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





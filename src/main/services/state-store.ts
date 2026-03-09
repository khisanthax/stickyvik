import type { AppSettings, PanelConfig, SyncState, VikunjaProject, VikunjaTask } from '../../shared/types';

const DEFAULT_SETTINGS: AppSettings = {
  serverUrl: '',
  authMethod: 'token',
  username: '',
  includeSubprojects: true,
  allowedProjectIds: [],
  syncIntervalSeconds: 60,
  launchAtStartup: true,
  pauseAlwaysOnTop: false,
  notifications: {
    enabled: false,
    overdue: true,
    dueToday: true
  },
  defaults: {
    backgroundColor: '#fff2af',
    textColor: '#2d2513',
    fontSize: 14,
    opacity: 0.97,
    itemCount: 10,
    sortMode: 'vikunja',
    filterMode: 'open',
    notificationMode: 'default',
    notificationsEnabled: false,
    showDueDates: false,
    dockAutoHideDelayMs: 900,
    alwaysOnTop: true,
    displayMode: 'full',
    dockEdge: 'right'
  }
};

const DEFAULT_SYNC: SyncState = {
  status: 'idle',
  lastSyncAt: null,
  lastError: null
};

let store: any = null;

function normalizeSettings(settings: Partial<AppSettings> | undefined): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      ...settings?.notifications
    },
    defaults: {
      ...DEFAULT_SETTINGS.defaults,
      ...settings?.defaults
    }
  };
}

function normalizePanel(panel: Partial<PanelConfig>, index: number, settings: AppSettings): PanelConfig {
  return {
    id: panel.id ?? crypto.randomUUID(),
    name: panel.name ?? `Panel ${index + 1}`,
    projectId: panel.projectId ?? settings.allowedProjectIds[0] ?? null,
    backgroundColor: panel.backgroundColor ?? settings.defaults.backgroundColor,
    textColor: panel.textColor ?? settings.defaults.textColor,
    fontSize: panel.fontSize ?? settings.defaults.fontSize,
    opacity: panel.opacity ?? settings.defaults.opacity,
    itemCount: panel.itemCount ?? settings.defaults.itemCount,
    sortMode: panel.sortMode ?? settings.defaults.sortMode,
    filterMode: panel.filterMode ?? settings.defaults.filterMode,
    notificationMode: panel.notificationMode ?? settings.defaults.notificationMode,
    showDueDates: panel.showDueDates ?? settings.defaults.showDueDates,
    dockAutoHideDelayMs: panel.dockAutoHideDelayMs ?? settings.defaults.dockAutoHideDelayMs,
    alwaysOnTop: panel.alwaysOnTop ?? settings.defaults.alwaysOnTop,
    displayMode: panel.displayMode ?? settings.defaults.displayMode,
    dockEdge: panel.dockEdge ?? settings.defaults.dockEdge,
    monitorMode: panel.monitorMode ?? 'primary',
    displayId: panel.displayId,
    snapToGrid: panel.snapToGrid ?? false,
    gridSize: panel.gridSize ?? 24,
    bounds: {
      x: panel.bounds?.x ?? 40 + index * 24,
      y: panel.bounds?.y ?? 40 + index * 24,
      width: panel.bounds?.width ?? 320,
      height: panel.bounds?.height ?? 440,
      displayId: panel.bounds?.displayId ?? panel.displayId
    },
    hoverExpanded: false
  };
}

export async function initStateStore(): Promise<void> {
  if (store) {
    return;
  }

  const { default: Store } = await import('electron-store');
  store = new Store({
    name: 'vikunja-sticky',
    defaults: {
      settings: DEFAULT_SETTINGS,
      panels: [],
      projects: [],
      taskCache: {},
      sync: DEFAULT_SYNC
    }
  });
}

function requireStore(): any {
  if (!store) {
    throw new Error('State store not initialized');
  }

  return store;
}

export function getSettings(): AppSettings {
  return normalizeSettings(requireStore().get('settings') as Partial<AppSettings>);
}

export function setSettings(settings: AppSettings): void {
  requireStore().set('settings', normalizeSettings(settings));
}

export function getPanels(): PanelConfig[] {
  const settings = getSettings();
  const panels = (requireStore().get('panels') as Partial<PanelConfig>[]) ?? [];
  return panels.map((panel, index) => normalizePanel(panel, index, settings));
}

export function setPanels(panels: PanelConfig[]): void {
  const settings = getSettings();
  requireStore().set('panels', panels.map((panel, index) => normalizePanel(panel, index, settings)));
}

export function getProjects(): VikunjaProject[] {
  return requireStore().get('projects') as VikunjaProject[];
}

export function setProjects(projects: VikunjaProject[]): void {
  requireStore().set('projects', projects);
}

export function getTaskCache(panelId: string): VikunjaTask[] {
  const cache = requireStore().get('taskCache') as Record<string, VikunjaTask[]>;
  return cache[panelId] ?? [];
}

export function setTaskCache(panelId: string, tasks: VikunjaTask[]): void {
  const cache = requireStore().get('taskCache') as Record<string, VikunjaTask[]>;
  requireStore().set('taskCache', {
    ...cache,
    [panelId]: tasks
  });
}

export function removeTaskCache(panelId: string): void {
  const cache = { ...(requireStore().get('taskCache') as Record<string, VikunjaTask[]>) };
  delete cache[panelId];
  requireStore().set('taskCache', cache);
}

export function getSyncState(): SyncState {
  return requireStore().get('sync') as SyncState;
}

export function setSyncState(sync: SyncState): void {
  requireStore().set('sync', sync);
}

export function makeDefaultPanel(index: number): PanelConfig {
  return normalizePanel({}, index, getSettings());
}

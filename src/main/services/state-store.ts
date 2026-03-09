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
    notificationsEnabled: false,
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

interface PersistedState {
  settings: AppSettings;
  panels: PanelConfig[];
  projects: VikunjaProject[];
  taskCache: Record<string, VikunjaTask[]>;
  sync: SyncState;
}

let store: any = null;

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
  return requireStore().get('settings') as AppSettings;
}

export function setSettings(settings: AppSettings): void {
  requireStore().set('settings', settings);
}

export function getPanels(): PanelConfig[] {
  return requireStore().get('panels') as PanelConfig[];
}

export function setPanels(panels: PanelConfig[]): void {
  requireStore().set('panels', panels);
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
  const settings = getSettings();
  return {
    id: crypto.randomUUID(),
    name: `Panel ${index}`,
    projectId: settings.allowedProjectIds[0] ?? null,
    backgroundColor: settings.defaults.backgroundColor,
    textColor: settings.defaults.textColor,
    fontSize: settings.defaults.fontSize,
    opacity: settings.defaults.opacity,
    itemCount: settings.defaults.itemCount,
    sortMode: settings.defaults.sortMode,
    filterMode: settings.defaults.filterMode,
    alwaysOnTop: settings.defaults.alwaysOnTop,
    displayMode: settings.defaults.displayMode,
    dockEdge: settings.defaults.dockEdge,
    monitorMode: 'primary',
    snapToGrid: false,
    gridSize: 24,
    bounds: {
      x: 40 + index * 24,
      y: 40 + index * 24,
      width: 320,
      height: 440
    },
    hoverExpanded: false
  };
}
export type AuthMethod = 'token' | 'password';
export type PanelSortMode = 'vikunja' | 'dueDate' | 'priority' | 'newest' | 'oldest' | 'alphabetical' | 'overdueFirst';
export type PanelFilterMode = 'open' | 'dueToday' | 'overdue' | 'dueEmphasis';
export type PanelDisplayMode = 'full' | 'minimized' | 'edge-docked';
export type DockEdge = 'left' | 'right' | 'top' | 'bottom';
export type NotificationMode = 'default' | 'off' | 'dueToday' | 'overdue' | 'dueTodayAndOverdue';
export type WindowView = 'manager' | 'panel' | 'details';

export interface WindowContext {
  view: WindowView;
  panelId?: string;
  taskId?: number;
}

export interface VikunjaProject {
  id: number;
  title: string;
  parentProjectId: number | null;
  isArchived: boolean;
}

export interface VikunjaTask {
  id: number;
  title: string;
  description: string;
  done: boolean;
  dueDate: string | null;
  priority: number;
  projectId: number;
  createdAt: string | null;
  updatedAt: string | null;
  position: number | null;
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'ready' | 'offline' | 'error';
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface BoundsState {
  x: number;
  y: number;
  width: number;
  height: number;
  displayId?: number;
}

export interface GlobalDefaults {
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  opacity: number;
  itemCount: number;
  sortMode: PanelSortMode;
  filterMode: PanelFilterMode;
  notificationMode: NotificationMode;
  notificationsEnabled: boolean;
  alwaysOnTop: boolean;
  displayMode: PanelDisplayMode;
  dockEdge: DockEdge;
}

export interface AppSettings {
  serverUrl: string;
  authMethod: AuthMethod;
  username: string;
  includeSubprojects: boolean;
  allowedProjectIds: number[];
  syncIntervalSeconds: number;
  launchAtStartup: boolean;
  pauseAlwaysOnTop: boolean;
  notifications: {
    enabled: boolean;
    overdue: boolean;
    dueToday: boolean;
  };
  defaults: GlobalDefaults;
}

export interface PanelConfig {
  id: string;
  name: string;
  projectId: number | null;
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  opacity: number;
  itemCount: number;
  sortMode: PanelSortMode;
  filterMode: PanelFilterMode;
  notificationMode: NotificationMode;
  alwaysOnTop: boolean;
  displayMode: PanelDisplayMode;
  dockEdge: DockEdge;
  monitorMode: 'primary' | 'selected';
  displayId?: number;
  snapToGrid: boolean;
  gridSize: number;
  bounds: BoundsState;
  hoverExpanded: boolean;
}

export interface ConnectionTestInput {
  serverUrl: string;
  authMethod: AuthMethod;
  username: string;
  secret?: string;
}

export interface SaveSettingsInput {
  settings: AppSettings;
  secret?: string;
}

export interface CredentialsStatus {
  hasSecret: boolean;
}

export interface ManagerBootstrap {
  window: WindowContext;
  settings: AppSettings;
  panels: PanelConfig[];
  projects: VikunjaProject[];
  sync: SyncState;
  credentials: CredentialsStatus;
}

export interface PanelBootstrap {
  window: WindowContext;
  panel: PanelConfig;
  settings: AppSettings;
  projects: VikunjaProject[];
  tasks: VikunjaTask[];
  sync: SyncState;
}

export interface DetailsBootstrap {
  window: WindowContext;
  panel: PanelConfig;
  task: VikunjaTask;
  projects: VikunjaProject[];
  sync: SyncState;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
  projects: VikunjaProject[];
}

export interface StickyVikBridge {
  getWindowContext: () => Promise<WindowContext>;
  getManagerBootstrap: () => Promise<ManagerBootstrap>;
  getPanelBootstrap: (panelId: string) => Promise<PanelBootstrap>;
  getDetailsBootstrap: (panelId: string, taskId: number) => Promise<DetailsBootstrap>;
  saveSettings: (input: SaveSettingsInput) => Promise<ManagerBootstrap>;
  testConnection: (input: ConnectionTestInput) => Promise<TestConnectionResult>;
  syncNow: () => Promise<void>;
  createPanel: () => Promise<PanelConfig>;
  updatePanel: (panel: PanelConfig) => Promise<PanelConfig>;
  deletePanel: (panelId: string) => Promise<void>;
  showManager: () => Promise<void>;
  showAllPanels: () => Promise<void>;
  hideAllPanels: () => Promise<void>;
  openTaskDetails: (panelId: string, taskId: number) => Promise<void>;
  togglePauseAlwaysOnTop: () => Promise<void>;
  setPanelHoverState: (panelId: string, hovered: boolean) => Promise<void>;
  togglePanelMinimized: (panelId: string) => Promise<PanelConfig>;
  createTask: (panelId: string, title: string) => Promise<void>;
  toggleTaskDone: (panelId: string, taskId: number, done: boolean) => Promise<void>;
  renameTask: (panelId: string, taskId: number, title: string) => Promise<void>;
  moveTask: (panelId: string, taskId: number, projectId: number) => Promise<void>;
  getTaskDetails: (taskId: number) => Promise<VikunjaTask>;
  onStateInvalidated: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    stickyVik: StickyVikBridge;
  }
}

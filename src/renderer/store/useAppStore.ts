import { create } from 'zustand';

import type {
  AppSettings,
  ConnectionTestInput,
  DetailsBootstrap,
  ManagerBootstrap,
  PanelBootstrap,
  PanelConfig,
  VikunjaTask,
  WindowContext
} from '../../shared/types';

interface AppStore {
  context: WindowContext | null;
  manager: ManagerBootstrap | null;
  panel: PanelBootstrap | null;
  details: DetailsBootstrap | null;
  loading: boolean;
  error: string | null;
  testResult: { ok: boolean; message: string } | null;
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  saveSettings: (settings: AppSettings, secret?: string) => Promise<void>;
  testConnection: (input: ConnectionTestInput) => Promise<void>;
  createPanel: () => Promise<void>;
  updatePanel: (panel: PanelConfig) => Promise<void>;
  deletePanel: (panelId: string) => Promise<void>;
  syncNow: () => Promise<void>;
  togglePauseAlwaysOnTop: () => Promise<void>;
  showManager: () => Promise<void>;
  showAllPanels: () => Promise<void>;
  hideAllPanels: () => Promise<void>;
  openTaskDetails: (panelId: string, taskId: number) => Promise<void>;
  togglePanelMinimized: (panelId: string) => Promise<void>;
  setPanelHoverState: (panelId: string, hovered: boolean) => Promise<void>;
  createTask: (panelId: string, title: string) => Promise<void>;
  toggleTaskDone: (panelId: string, taskId: number, done: boolean) => Promise<void>;
  renameTask: (panelId: string, taskId: number, title: string) => Promise<void>;
  moveTask: (panelId: string, taskId: number, projectId: number) => Promise<void>;
  getTaskDetails: (taskId: number) => Promise<VikunjaTask>;
}

export const useAppStore = create<AppStore>((set, get) => ({
  context: null,
  manager: null,
  panel: null,
  details: null,
  loading: true,
  error: null,
  testResult: null,
  initialize: async () => {
    set({ loading: true, error: null });
    try {
      const context = await window.stickyVik.getWindowContext();
      set({ context });
      await get().refresh();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to initialize Vikunja Sticky' });
    } finally {
      set({ loading: false });
    }
  },
  refresh: async () => {
    const context = get().context ?? (await window.stickyVik.getWindowContext());
    if (context.view === 'manager') {
      const manager = await window.stickyVik.getManagerBootstrap();
      set({ context, manager, panel: null, details: null });
      return;
    }

    if (context.view === 'panel') {
      if (!context.panelId) {
        throw new Error('Panel context is missing its panel id');
      }

      const panel = await window.stickyVik.getPanelBootstrap(context.panelId);
      set({ context, panel, manager: null, details: null });
      return;
    }

    if (!context.panelId || !context.taskId) {
      throw new Error('Details context is missing its task or panel id');
    }

    const details = await window.stickyVik.getDetailsBootstrap(context.panelId, context.taskId);
    set({ context, details, manager: null, panel: null });
  },
  saveSettings: async (settings, secret) => {
    set({ error: null });
    try {
      const manager = await window.stickyVik.saveSettings({ settings, secret });
      set({ manager });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to save settings' });
    }
  },
  testConnection: async (input) => {
    try {
      const result = await window.stickyVik.testConnection(input);
      set({ testResult: { ok: result.ok, message: result.message } });
    } catch (error) {
      set({ testResult: { ok: false, message: error instanceof Error ? error.message : 'Connection test failed' } });
    }
  },
  createPanel: async () => {
    await window.stickyVik.createPanel();
    await get().refresh();
  },
  updatePanel: async (panel) => {
    await window.stickyVik.updatePanel(panel);
    await get().refresh();
  },
  deletePanel: async (panelId) => {
    await window.stickyVik.deletePanel(panelId);
    await get().refresh();
  },
  syncNow: async () => {
    await window.stickyVik.syncNow();
    await get().refresh();
  },
  togglePauseAlwaysOnTop: async () => {
    await window.stickyVik.togglePauseAlwaysOnTop();
    await get().refresh();
  },
  showManager: async () => {
    await window.stickyVik.showManager();
  },
  showAllPanels: async () => {
    await window.stickyVik.showAllPanels();
  },
  hideAllPanels: async () => {
    await window.stickyVik.hideAllPanels();
  },
  openTaskDetails: async (panelId, taskId) => {
    await window.stickyVik.openTaskDetails(panelId, taskId);
  },
  togglePanelMinimized: async (panelId) => {
    await window.stickyVik.togglePanelMinimized(panelId);
    await get().refresh();
  },
  setPanelHoverState: async (panelId, hovered) => {
    await window.stickyVik.setPanelHoverState(panelId, hovered);
  },
  createTask: async (panelId, title) => {
    await window.stickyVik.createTask(panelId, title);
    await get().refresh();
  },
  toggleTaskDone: async (panelId, taskId, done) => {
    await window.stickyVik.toggleTaskDone(panelId, taskId, done);
    await get().refresh();
  },
  renameTask: async (panelId, taskId, title) => {
    await window.stickyVik.renameTask(panelId, taskId, title);
    await get().refresh();
  },
  moveTask: async (panelId, taskId, projectId) => {
    await window.stickyVik.moveTask(panelId, taskId, projectId);
    await get().refresh();
  },
  getTaskDetails: (taskId) => window.stickyVik.getTaskDetails(taskId)
}));

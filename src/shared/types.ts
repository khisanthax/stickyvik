export type DockSide = 'left' | 'right';

export interface VikunjaConfig {
  apiBaseUrl: string;
  apiToken: string;
  refreshIntervalMinutes: number;
  showOnlyDue: boolean;
}

export interface PanelGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  displayId?: number;
}

export interface StickyVikConfig {
  vikunja: VikunjaConfig;
  panel: {
    side: DockSide;
    collapsed: boolean;
    collapsedWidth: number;
    expandedWidth: number;
    lastBounds?: PanelGeometry;
  };
}

export interface RendererBootstrap {
  config: StickyVikConfig;
  panelState: {
    collapsed: boolean;
    side: DockSide;
  };
}

export interface SaveConfigResult {
  config: StickyVikConfig;
}

export interface StickyVikBridge {
  getBootstrap: () => Promise<RendererBootstrap>;
  saveConfig: (config: StickyVikConfig) => Promise<SaveConfigResult>;
  toggleCollapse: () => Promise<{ collapsed: boolean }>;
  setHoverState: (hovered: boolean) => Promise<void>;
  openDevTools: () => Promise<void>;
  onPanelStateChanged: (
    listener: (state: RendererBootstrap['panelState']) => void
  ) => () => void;
}

declare global {
  interface Window {
    stickyVik: StickyVikBridge;
  }
}
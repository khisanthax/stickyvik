import { BrowserWindow, Rectangle, Tray, nativeImage, screen } from 'electron';
import path from 'node:path';

import type { DockSide, PanelGeometry, StickyVikConfig } from '../../shared/types';

const WINDOW_MARGIN = 12;
const MIN_PANEL_HEIGHT = 320;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getDisplayForBounds(bounds?: PanelGeometry) {
  if (!bounds) {
    return screen.getPrimaryDisplay();
  }

  return screen.getDisplayMatching({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  });
}

function getTargetBounds(config: StickyVikConfig, existing?: Rectangle) {
  const display = getDisplayForBounds(config.panel.lastBounds);
  const workArea = display.workArea;
  const width = config.panel.collapsed
    ? config.panel.collapsedWidth
    : config.panel.expandedWidth;
  const height = clamp(
    config.panel.lastBounds?.height ?? existing?.height ?? workArea.height - WINDOW_MARGIN * 2,
    MIN_PANEL_HEIGHT,
    workArea.height
  );

  const y = clamp(
    config.panel.lastBounds?.y ?? workArea.y + WINDOW_MARGIN,
    workArea.y,
    workArea.y + workArea.height - height
  );

  const x =
    config.panel.side === 'left'
      ? workArea.x + WINDOW_MARGIN
      : workArea.x + workArea.width - width - WINDOW_MARGIN;

  return {
    x,
    y,
    width,
    height
  };
}

function createTrayIcon() {
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAj0lEQVR4AWNABP7///8mMDFhYWFxQ5EiiYuLi8MGRsY/cTAwMNiGoigKwv///zM0NDT+////BgaG/////2BjY8P4////TMQvxGGMHj16xMTAwPj//z8DA8P/PxgYGP7//59kZGRmBgaG/y9evMDAwPD///8ZRgaG/1euXGH4//8/AwNDH5qamtCMRsJqBiMmBv///8PAAAD6iR38koRa5QAAAABJRU5ErkJggg=='
  );
}

export class PanelWindowController {
  private readonly configRef: () => StickyVikConfig;
  private readonly onBoundsChanged: (bounds: PanelGeometry) => void;
  private readonly onPanelStateChanged: (collapsed: boolean, side: DockSide) => void;
  private hoverTimer?: NodeJS.Timeout;

  tray?: Tray;
  window?: BrowserWindow;

  constructor(options: {
    configRef: () => StickyVikConfig;
    onBoundsChanged: (bounds: PanelGeometry) => void;
    onPanelStateChanged: (collapsed: boolean, side: DockSide) => void;
  }) {
    this.configRef = options.configRef;
    this.onBoundsChanged = options.onBoundsChanged;
    this.onPanelStateChanged = options.onPanelStateChanged;
  }

  createWindow() {
    const config = this.configRef();
    const targetBounds = getTargetBounds(config);

    this.window = new BrowserWindow({
      ...targetBounds,
      minWidth: config.panel.collapsedWidth,
      minHeight: MIN_PANEL_HEIGHT,
      frame: false,
      show: false,
      resizable: true,
      movable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      transparent: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    this.window.setAlwaysOnTop(true, 'screen-saver');
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.window.on('ready-to-show', () => this.window?.showInactive());
    this.window.on('moved', () => this.persistWindowBounds());
    this.window.on('resized', () => this.persistWindowBounds());
    this.window.on('closed', () => {
      this.window = undefined;
    });

    return this.window;
  }

  createTray(onToggleVisibility: () => void, onOpenDevTools: () => void, onQuit: () => void) {
    this.tray = new Tray(createTrayIcon());
    this.tray.setToolTip('StickyVik');
    this.tray.on('click', onToggleVisibility);
    this.tray.on('right-click', () => {
      if (!this.tray) {
        return;
      }

      const { Menu } = require('electron') as typeof import('electron');
      this.tray.popUpContextMenu(
        Menu.buildFromTemplate([
          { label: 'Show / Hide', click: onToggleVisibility },
          { label: 'Toggle Collapse', click: () => this.toggleCollapse() },
          { label: 'Open DevTools', click: onOpenDevTools },
          { type: 'separator' },
          { label: 'Quit', click: onQuit }
        ])
      );
    });

    return this.tray;
  }

  load(window: BrowserWindow) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    if (devServerUrl) {
      return window.loadURL(devServerUrl);
    }

    return window.loadFile(path.resolve(process.cwd(), 'dist/index.html'));
  }

  toggleVisibility() {
    if (!this.window) {
      return;
    }

    if (this.window.isVisible()) {
      this.window.hide();
      return;
    }

    this.window.showInactive();
  }

  async toggleCollapse() {
    const config = this.configRef();
    config.panel.collapsed = !config.panel.collapsed;
    await this.applyDockedBounds();
    this.onPanelStateChanged(config.panel.collapsed, config.panel.side);
    return { collapsed: config.panel.collapsed };
  }

  async setHoverState(hovered: boolean) {
    if (this.hoverTimer) {
      clearTimeout(this.hoverTimer);
    }

    this.hoverTimer = setTimeout(() => {
      const config = this.configRef();
      const shouldCollapse = !hovered;
      if (!config.panel.collapsed && hovered) {
        return;
      }

      if (config.panel.collapsed === shouldCollapse) {
        return;
      }

      // Renderer-driven hover updates let us keep the dock animation reliable
      // even though frameless BrowserWindows do not expose DOM hover events.
      config.panel.collapsed = shouldCollapse;
      void this.applyDockedBounds().then(() => {
        this.onPanelStateChanged(config.panel.collapsed, config.panel.side);
      });
    }, hovered ? 120 : 700);
  }

  async applyDockedBounds() {
    if (!this.window) {
      return;
    }

    const config = this.configRef();
    const bounds = this.window.getBounds();
    const targetBounds = getTargetBounds(config, bounds);
    this.window.setBounds(targetBounds, true);
    this.persistWindowBounds();
  }

  openDevTools() {
    this.window?.webContents.openDevTools({ mode: 'detach' });
  }

  private persistWindowBounds() {
    if (!this.window) {
      return;
    }

    const bounds = this.window.getBounds();
    const display = screen.getDisplayMatching(bounds);
    this.onBoundsChanged({
      ...bounds,
      displayId: display.id
    });
  }
}
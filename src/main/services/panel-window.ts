import { BrowserWindow, Rectangle, Tray, nativeImage, screen } from 'electron';
import path from 'node:path';

import type { BoundsState, DockEdge, PanelConfig, WindowContext } from '../../shared/types';

const PANEL_MARGIN = 12;
const TITLE_ONLY_HEIGHT = 52;
const EDGE_THICKNESS = 46;
const MIN_WIDTH = 240;
const MIN_HEIGHT = 180;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getTargetDisplay(panel: PanelConfig) {
  if (panel.monitorMode === 'selected' && panel.displayId) {
    const match = screen.getAllDisplays().find((display) => display.id === panel.displayId);
    if (match) {
      return match;
    }
  }

  return screen.getPrimaryDisplay();
}

function getExpandedBounds(panel: PanelConfig) {
  const display = getTargetDisplay(panel);
  const workArea = display.workArea;
  const raw = panel.bounds;
  const width = clamp(raw.width, MIN_WIDTH, Math.max(MIN_WIDTH, workArea.width - PANEL_MARGIN * 2));
  const height = clamp(raw.height, MIN_HEIGHT, Math.max(MIN_HEIGHT, workArea.height - PANEL_MARGIN * 2));

  return {
    x: clamp(raw.x, workArea.x, workArea.x + workArea.width - width),
    y: clamp(raw.y, workArea.y, workArea.y + workArea.height - height),
    width,
    height,
    displayId: display.id
  };
}

function getDockedBounds(panel: PanelConfig) {
  const expanded = getExpandedBounds(panel);
  const display = getTargetDisplay(panel);
  const area = display.workArea;
  const expandedMode = panel.hoverExpanded;

  // Edge-docked windows need to preserve their "true" size off to the side and
  // then collapse only the axis that faces the desktop edge. That lets hover
  // expansion feel anchored instead of jumping away from the chosen monitor edge.
  if (panel.dockEdge === 'left') {
    return {
      x: area.x,
      y: expanded.y,
      width: expandedMode ? expanded.width : EDGE_THICKNESS,
      height: expanded.height,
      displayId: display.id
    };
  }

  if (panel.dockEdge === 'right') {
    return {
      x: expandedMode ? area.x + area.width - expanded.width : area.x + area.width - EDGE_THICKNESS,
      y: expanded.y,
      width: expandedMode ? expanded.width : EDGE_THICKNESS,
      height: expanded.height,
      displayId: display.id
    };
  }

  if (panel.dockEdge === 'top') {
    return {
      x: expanded.x,
      y: area.y,
      width: expanded.width,
      height: expandedMode ? expanded.height : EDGE_THICKNESS,
      displayId: display.id
    };
  }

  return {
    x: expanded.x,
    y: expandedMode ? area.y + area.height - expanded.height : area.y + area.height - EDGE_THICKNESS,
    width: expanded.width,
    height: expandedMode ? expanded.height : EDGE_THICKNESS,
    displayId: display.id
  };
}

export function resolvePanelBounds(panel: PanelConfig) {
  if (panel.displayMode === 'edge-docked') {
    return getDockedBounds(panel);
  }

  if (panel.displayMode === 'minimized') {
    const expanded = getExpandedBounds(panel);
    return {
      ...expanded,
      height: TITLE_ONLY_HEIGHT
    };
  }

  return getExpandedBounds(panel);
}

export function createManagerWindow() {
  return new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 860,
    minHeight: 640,
    show: false,
    backgroundColor: '#13161b',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
}

export function createPanelWindow(panel: PanelConfig, pauseAlwaysOnTop: boolean) {
  const bounds = resolvePanelBounds(panel);
  const window = new BrowserWindow({
    ...bounds,
    minWidth: MIN_WIDTH,
    minHeight: TITLE_ONLY_HEIGHT,
    frame: false,
    show: false,
    resizable: true,
    movable: true,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: '#101217',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  applyPanelWindowState(window, panel, pauseAlwaysOnTop);
  return window;
}

export function applyPanelWindowState(window: BrowserWindow, panel: PanelConfig, pauseAlwaysOnTop: boolean) {
  const bounds = resolvePanelBounds(panel);
  window.setBounds(bounds, true);
  window.setOpacity(clamp(panel.opacity, 0.45, 1));
  window.setAlwaysOnTop(panel.alwaysOnTop && !pauseAlwaysOnTop, 'screen-saver');
  window.setVisibleOnAllWorkspaces(panel.alwaysOnTop && !pauseAlwaysOnTop, { visibleOnFullScreen: true });
}

export function capturePanelBounds(window: BrowserWindow, panel: PanelConfig): BoundsState {
  const current = window.getBounds();
  const display = screen.getDisplayMatching(current);

  if (panel.displayMode === 'minimized') {
    return {
      ...panel.bounds,
      x: current.x,
      y: current.y,
      displayId: display.id
    };
  }

  if (panel.displayMode === 'edge-docked' && !panel.hoverExpanded) {
    return {
      ...panel.bounds,
      displayId: display.id
    };
  }

  return {
    x: current.x,
    y: current.y,
    width: current.width,
    height: current.height,
    displayId: display.id
  };
}

export function createTrayIcon() {
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAj0lEQVR4AWNABP7///8mMDFhYWFxQ5EiiYuLi8MGRsY/cTAwMNiGoigKwv///zM0NDT+////BgaG/////2BjY8P4////TMQvxGGMHj16xMTAwPj//z8DA8P/PxgYGP7//59kZGRmBgaG/y9evMDAwPD///8ZRgaG/1euXGH4//8/AwNDH5qamtCMRsJqBiMmBv///8PAAAD6iR38koRa5QAAAABJRU5ErkJggg=='
  );
}

export async function loadWindow(window: BrowserWindow, context: WindowContext) {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    const url = new URL(devServerUrl);
    url.searchParams.set('view', context.view);
    if (context.panelId) {
      url.searchParams.set('panelId', context.panelId);
    }

    await window.loadURL(url.toString());
    return;
  }

  await window.loadFile(path.resolve(process.cwd(), 'dist/index.html'), {
    query: context.panelId
      ? { view: context.view, panelId: context.panelId }
      : { view: context.view }
  });
}

export function makeTray() {
  const tray = new Tray(createTrayIcon());
  tray.setToolTip('Vikunja Sticky');
  return tray;
}
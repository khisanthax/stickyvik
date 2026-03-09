import { app, BrowserWindow, ipcMain } from 'electron';

import type { StickyVikConfig } from '../shared/types';
import { PanelWindowController } from './services/panel-window';
import { loadConfig, saveConfig } from './services/store';

let currentConfig: StickyVikConfig;
let panelController: PanelWindowController;
let initialized = false;

function getConfig() {
  return currentConfig;
}

async function persistConfig() {
  await saveConfig(currentConfig);
}

async function bootstrap() {
  currentConfig = await loadConfig();

  panelController = new PanelWindowController({
    configRef: getConfig,
    onBoundsChanged: (bounds) => {
      currentConfig.panel.lastBounds = bounds;
      void persistConfig();
    },
    onPanelStateChanged: (collapsed, side) => {
      for (const browserWindow of BrowserWindow.getAllWindows()) {
        browserWindow.webContents.send('panel-state-changed', { collapsed, side });
      }
      void persistConfig();
    }
  });

  const window = panelController.createWindow();
  panelController.createTray(
    () => panelController.toggleVisibility(),
    () => panelController.openDevTools(),
    () => app.quit()
  );
  await panelController.load(window);

  if (!initialized) {
    ipcMain.handle('config:get-bootstrap', async () => ({
      config: currentConfig,
      panelState: {
        collapsed: currentConfig.panel.collapsed,
        side: currentConfig.panel.side
      }
    }));

    ipcMain.handle('config:save', async (_event, nextConfig: StickyVikConfig) => {
      currentConfig = nextConfig;
      await persistConfig();
      await panelController.applyDockedBounds();
      return { config: currentConfig };
    });

    ipcMain.handle('panel:toggle-collapse', async () => {
      const result = await panelController.toggleCollapse();
      await persistConfig();
      return result;
    });

    ipcMain.handle('panel:set-hover-state', async (_event, hovered: boolean) => {
      await panelController.setHoverState(hovered);
    });

    ipcMain.handle('app:open-devtools', async () => {
      panelController.openDevTools();
    });

    initialized = true;
  }
}

app.whenReady().then(async () => {
  await bootstrap();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void bootstrap();
    }
  });
});

app.on('window-all-closed', () => {
  // The app lives in the tray; closing the panel should not terminate the process.
});
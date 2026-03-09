import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { StickyVikConfig } from '../../shared/types';

const DEFAULT_CONFIG: StickyVikConfig = {
  vikunja: {
    apiBaseUrl: '',
    apiToken: '',
    refreshIntervalMinutes: 5,
    showOnlyDue: false
  },
  panel: {
    side: 'right',
    collapsed: false,
    collapsedWidth: 76,
    expandedWidth: 380
  }
};

const STORE_FILE = 'stickyvik.settings.json';

function getStorePath() {
  return path.join(app.getPath('userData'), STORE_FILE);
}

export async function loadConfig(): Promise<StickyVikConfig> {
  try {
    const raw = await fs.readFile(getStorePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<StickyVikConfig>;
    return {
      vikunja: {
        ...DEFAULT_CONFIG.vikunja,
        ...parsed.vikunja
      },
      panel: {
        ...DEFAULT_CONFIG.panel,
        ...parsed.panel
      }
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('Failed to read StickyVik config', error);
    }

    return structuredClone(DEFAULT_CONFIG);
  }
}

export async function saveConfig(config: StickyVikConfig) {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(getStorePath(), JSON.stringify(config, null, 2), 'utf8');
}
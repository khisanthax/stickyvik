import { contextBridge, ipcRenderer } from 'electron';

import type { StickyVikBridge } from '../shared/types';

const bridge: StickyVikBridge = {
  getBootstrap: () => ipcRenderer.invoke('config:get-bootstrap'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  toggleCollapse: () => ipcRenderer.invoke('panel:toggle-collapse'),
  setHoverState: (hovered) => ipcRenderer.invoke('panel:set-hover-state', hovered),
  openDevTools: () => ipcRenderer.invoke('app:open-devtools'),
  onPanelStateChanged: (listener) => {
    const subscription = (_event: unknown, state: { collapsed: boolean; side: 'left' | 'right' }) =>
      listener(state);

    ipcRenderer.on('panel-state-changed', subscription);
    return () => {
      ipcRenderer.removeListener('panel-state-changed', subscription);
    };
  }
};

contextBridge.exposeInMainWorld('stickyVik', bridge);
import { useEffect } from 'react';

import { ManagerView } from './components/ManagerView';
import { PanelView } from './components/PanelView';
import { useAppStore } from './store/useAppStore';

export function App() {
  const context = useAppStore((state) => state.context);
  const loading = useAppStore((state) => state.loading);
  const error = useAppStore((state) => state.error);
  const initialize = useAppStore((state) => state.initialize);
  const refresh = useAppStore((state) => state.refresh);

  useEffect(() => {
    void initialize();
    return window.stickyVik.onStateInvalidated(() => {
      void refresh();
    });
  }, [initialize, refresh]);

  if (loading) {
    return <div className="loading-state">Loading Vikunja Sticky...</div>;
  }

  if (error) {
    return <div className="error-state">{error}</div>;
  }

  if (context?.view === 'panel') {
    return <PanelView />;
  }

  return <ManagerView />;
}
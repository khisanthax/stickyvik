import { FormEvent, useEffect, useState } from 'react';

import type { DockSide, StickyVikConfig } from '../shared/types';

const emptyConfig: StickyVikConfig = {
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

export function App() {
  const [config, setConfig] = useState<StickyVikConfig>(emptyConfig);
  const [collapsed, setCollapsed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string>('');

  useEffect(() => {
    void window.stickyVik.getBootstrap().then((bootstrap) => {
      setConfig(bootstrap.config);
      setCollapsed(bootstrap.panelState.collapsed);
    });

    return window.stickyVik.onPanelStateChanged((state) => {
      setCollapsed(state.collapsed);
      setConfig((current) => ({
        ...current,
        panel: {
          ...current.panel,
          side: state.side
        }
      }));
    });
  }, []);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSavedMessage('');

    try {
      const result = await window.stickyVik.saveConfig(config);
      setConfig(result.config);
      setSavedMessage('Saved');
    } finally {
      setSaving(false);
    }
  }

  function updateSide(side: DockSide) {
    setConfig((current) => ({
      ...current,
      panel: {
        ...current.panel,
        side
      }
    }));
  }

  return (
    <div
      className={`shell ${collapsed ? 'shell--collapsed' : ''}`}
      onMouseEnter={() => void window.stickyVik.setHoverState(true)}
      onMouseLeave={() => void window.stickyVik.setHoverState(false)}
    >
      <header className="hero">
        <div>
          <p className="eyebrow">Sticky Vikunja Panel</p>
          <h1>StickyVik</h1>
        </div>
        <button className="secondary" onClick={() => void window.stickyVik.toggleCollapse()}>
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </header>

      {collapsed ? (
        <section className="collapsed-rail">
          <span>SV</span>
        </section>
      ) : (
        <>
          <section className="panel card">
            <h2>Connection</h2>
            <form className="stack" onSubmit={(event) => void handleSave(event)}>
              <label>
                <span>Vikunja URL</span>
                <input
                  type="url"
                  placeholder="https://vikunja.example.com"
                  value={config.vikunja.apiBaseUrl}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      vikunja: {
                        ...current.vikunja,
                        apiBaseUrl: event.target.value
                      }
                    }))
                  }
                />
              </label>

              <label>
                <span>API token</span>
                <input
                  type="password"
                  placeholder="Paste a Vikunja API token"
                  value={config.vikunja.apiToken}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      vikunja: {
                        ...current.vikunja,
                        apiToken: event.target.value
                      }
                    }))
                  }
                />
              </label>

              <label>
                <span>Refresh interval (minutes)</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={config.vikunja.refreshIntervalMinutes}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      vikunja: {
                        ...current.vikunja,
                        refreshIntervalMinutes: Number(event.target.value) || 5
                      }
                    }))
                  }
                />
              </label>

              <label className="toggle">
                <input
                  type="checkbox"
                  checked={config.vikunja.showOnlyDue}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      vikunja: {
                        ...current.vikunja,
                        showOnlyDue: event.target.checked
                      }
                    }))
                  }
                />
                <span>Show only tasks with due dates</span>
              </label>

              <div className="inline-actions">
                <button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save settings'}
                </button>
                <button className="secondary" type="button" onClick={() => void window.stickyVik.openDevTools()}>
                  DevTools
                </button>
                {savedMessage ? <small>{savedMessage}</small> : null}
              </div>
            </form>
          </section>

          <section className="panel card">
            <h2>Panel</h2>
            <div className="stack">
              <label>
                <span>Dock side</span>
                <div className="segmented">
                  <button
                    className={config.panel.side === 'left' ? 'active' : ''}
                    type="button"
                    onClick={() => updateSide('left')}
                  >
                    Left
                  </button>
                  <button
                    className={config.panel.side === 'right' ? 'active' : ''}
                    type="button"
                    onClick={() => updateSide('right')}
                  >
                    Right
                  </button>
                </div>
              </label>

              <label>
                <span>Collapsed width</span>
                <input
                  type="number"
                  min={56}
                  max={140}
                  value={config.panel.collapsedWidth}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      panel: {
                        ...current.panel,
                        collapsedWidth: Number(event.target.value) || 76
                      }
                    }))
                  }
                />
              </label>

              <label>
                <span>Expanded width</span>
                <input
                  type="number"
                  min={280}
                  max={640}
                  value={config.panel.expandedWidth}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      panel: {
                        ...current.panel,
                        expandedWidth: Number(event.target.value) || 380
                      }
                    }))
                  }
                />
              </label>
            </div>
          </section>

          <section className="panel card">
            <h2>Next milestone</h2>
            <p>
              The scaffold is live. The next commit will connect this panel to Vikunja, fetch tasks, and render a
              sticky task rail inside the same window shell.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
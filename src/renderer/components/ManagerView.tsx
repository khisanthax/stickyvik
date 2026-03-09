import { useEffect, useMemo, useRef, useState } from 'react';

import type { AppSettings, PanelConfig, VikunjaProject } from '../../shared/types';
import { useAppStore } from '../store/useAppStore';

type PanelSection = 'general' | 'appearance' | 'behavior';

function buildProjectLabel(projectId: number, projects: VikunjaProject[]) {
  const lookup = new Map(projects.map((project) => [project.id, project]));
  const segments: string[] = [];
  let current = lookup.get(projectId) ?? null;

  while (current) {
    segments.unshift(current.title);
    current = current.parentProjectId ? lookup.get(current.parentProjectId) ?? null : null;
  }

  return segments.join(' / ');
}

export function ManagerView() {
  const manager = useAppStore((state) => state.manager);
  const testResult = useAppStore((state) => state.testResult);
  const saveSettings = useAppStore((state) => state.saveSettings);
  const testConnection = useAppStore((state) => state.testConnection);
  const createPanel = useAppStore((state) => state.createPanel);
  const updatePanel = useAppStore((state) => state.updatePanel);
  const deletePanel = useAppStore((state) => state.deletePanel);
  const syncNow = useAppStore((state) => state.syncNow);
  const showAllPanels = useAppStore((state) => state.showAllPanels);
  const hideAllPanels = useAppStore((state) => state.hideAllPanels);
  const togglePauseAlwaysOnTop = useAppStore((state) => state.togglePauseAlwaysOnTop);

  const [settingsDraft, setSettingsDraft] = useState<AppSettings | null>(null);
  const [panelDrafts, setPanelDrafts] = useState<Record<string, PanelConfig>>({});
  const [secret, setSecret] = useState('');
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  const [activePanelSection, setActivePanelSection] = useState<PanelSection>('general');
  const previousPanelCount = useRef(0);

  useEffect(() => {
    if (!manager) {
      return;
    }

    setSettingsDraft(manager.settings);
    setPanelDrafts(Object.fromEntries(manager.panels.map((panel) => [panel.id, panel])));
    const createdNewPanel = manager.panels.length > previousPanelCount.current;
    previousPanelCount.current = manager.panels.length;
    setActivePanelId((current) => {
      if (createdNewPanel) {
        return manager.panels.at(-1)?.id ?? null;
      }

      if (current && manager.panels.some((panel) => panel.id === current)) {
        return current;
      }

      return manager.panels[0]?.id ?? null;
    });
  }, [manager]);

  const projectLabels = useMemo(() => {
    if (!manager) {
      return new Map<number, string>();
    }

    return new Map(manager.projects.map((project) => [project.id, buildProjectLabel(project.id, manager.projects)]));
  }, [manager]);

  const activePanel = activePanelId ? panelDrafts[activePanelId] ?? manager?.panels.find((panel) => panel.id === activePanelId) ?? null : null;

  function setPanelDraft(panelId: string, next: PanelConfig) {
    setPanelDrafts((current) => ({
      ...current,
      [panelId]: next
    }));
  }

  if (!manager || !settingsDraft) {
    return null;
  }

  return (
    <div className="manager-shell">
      <header className="manager-hero">
        <div>
          <p className="eyebrow">Tray controller</p>
          <h1>Vikunja Sticky</h1>
          <p className="muted">A desktop companion for at-a-glance Vikunja projects and quick task actions.</p>
        </div>
        <div className="hero-actions">
          <button type="button" onClick={() => void createPanel()}>
            New panel
          </button>
          <button className="secondary" type="button" onClick={() => void syncNow()}>
            Sync now
          </button>
        </div>
      </header>

      <section className="manager-grid">
        <article className="card manager-card">
          <h2>Connection</h2>
          <div className="field-grid">
            <label>
              <span>Server URL</span>
              <input
                type="url"
                value={settingsDraft.serverUrl}
                onChange={(event) => setSettingsDraft({ ...settingsDraft, serverUrl: event.target.value })}
              />
            </label>
            <label>
              <span>Auth method</span>
              <select
                value={settingsDraft.authMethod}
                onChange={(event) =>
                  setSettingsDraft({
                    ...settingsDraft,
                    authMethod: event.target.value as AppSettings['authMethod']
                  })
                }
              >
                <option value="token">API token</option>
                <option value="password">Username + password</option>
              </select>
            </label>
            <label>
              <span>Username</span>
              <input
                type="text"
                value={settingsDraft.username}
                onChange={(event) => setSettingsDraft({ ...settingsDraft, username: event.target.value })}
                placeholder={settingsDraft.authMethod === 'token' ? 'Optional label' : 'Vikunja username'}
              />
            </label>
            <label>
              <span>{settingsDraft.authMethod === 'token' ? 'Token' : 'Password'}</span>
              <input
                type="password"
                value={secret}
                placeholder={manager.credentials.hasSecret ? 'Stored credential will be reused unless replaced' : ''}
                onChange={(event) => setSecret(event.target.value)}
              />
            </label>
          </div>

          <div className="inline-actions">
            <button
              type="button"
              onClick={() =>
                void testConnection({
                  serverUrl: settingsDraft.serverUrl,
                  authMethod: settingsDraft.authMethod,
                  username: settingsDraft.username,
                  secret: secret || undefined
                })
              }
            >
              Test connection
            </button>
            <button type="button" className="secondary" onClick={() => void saveSettings(settingsDraft, secret || undefined)}>
              Save settings
            </button>
            <span className={`status-pill status-pill--${manager.sync.status}`}>{manager.sync.status}</span>
          </div>

          {manager.credentials.hasSecret && !secret ? (
            <p className="muted">Stored credential is available and will be reused unless you enter a new one.</p>
          ) : null}
          {testResult ? <p className={testResult.ok ? 'status-text status-text--ok' : 'status-text status-text--error'}>{testResult.message}</p> : null}
          {manager.sync.lastError ? <p className="status-text status-text--error">{manager.sync.lastError}</p> : null}
        </article>

        <article className="card manager-card">
          <h2>Allowed projects</h2>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settingsDraft.includeSubprojects}
              onChange={(event) => setSettingsDraft({ ...settingsDraft, includeSubprojects: event.target.checked })}
            />
            <span>Include subprojects in selectors and parent panel task rollups</span>
          </label>
          <div className="project-checklist">
            {manager.projects.map((project) => {
              const checked = settingsDraft.allowedProjectIds.includes(project.id);
              return (
                <label key={project.id} className="project-checklist__item">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const nextIds = event.target.checked
                        ? [...settingsDraft.allowedProjectIds, project.id]
                        : settingsDraft.allowedProjectIds.filter((id) => id !== project.id);

                      setSettingsDraft({ ...settingsDraft, allowedProjectIds: nextIds });
                    }}
                  />
                  <span>{projectLabels.get(project.id) ?? project.title}</span>
                </label>
              );
            })}
          </div>
        </article>

        <article className="card manager-card">
          <h2>Defaults & behavior</h2>
          <div className="field-grid">
            <label>
              <span>Default panel color</span>
              <input
                type="color"
                value={settingsDraft.defaults.backgroundColor}
                onChange={(event) =>
                  setSettingsDraft({
                    ...settingsDraft,
                    defaults: { ...settingsDraft.defaults, backgroundColor: event.target.value }
                  })
                }
              />
            </label>
            <label>
              <span>Default text color</span>
              <input
                type="color"
                value={settingsDraft.defaults.textColor}
                onChange={(event) =>
                  setSettingsDraft({
                    ...settingsDraft,
                    defaults: { ...settingsDraft.defaults, textColor: event.target.value }
                  })
                }
              />
            </label>
            <label>
              <span>Font size</span>
              <input
                type="number"
                min={12}
                max={24}
                value={settingsDraft.defaults.fontSize}
                onChange={(event) =>
                  setSettingsDraft({
                    ...settingsDraft,
                    defaults: { ...settingsDraft.defaults, fontSize: Number(event.target.value) || 14 }
                  })
                }
              />
            </label>
            <label>
              <span>Default panel notifications</span>
              <select
                value={settingsDraft.defaults.notificationMode}
                onChange={(event) =>
                  setSettingsDraft({
                    ...settingsDraft,
                    defaults: { ...settingsDraft.defaults, notificationMode: event.target.value as PanelConfig['notificationMode'] }
                  })
                }
              >
                <option value="default">Use global defaults</option>
                <option value="off">Off</option>
                <option value="dueToday">Due today</option>
                <option value="overdue">Overdue</option>
                <option value="dueTodayAndOverdue">Due today + overdue</option>
              </select>
            </label>
            <label>
              <span>Sync interval (seconds)</span>
              <input
                type="number"
                min={30}
                max={900}
                value={settingsDraft.syncIntervalSeconds}
                onChange={(event) => setSettingsDraft({ ...settingsDraft, syncIntervalSeconds: Number(event.target.value) || 60 })}
              />
            </label>
          </div>

          <div className="inline-actions">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settingsDraft.launchAtStartup}
                onChange={(event) => setSettingsDraft({ ...settingsDraft, launchAtStartup: event.target.checked })}
              />
              <span>Launch on Windows startup</span>
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settingsDraft.notifications.enabled}
                onChange={(event) =>
                  setSettingsDraft({
                    ...settingsDraft,
                    notifications: { ...settingsDraft.notifications, enabled: event.target.checked }
                  })
                }
              />
              <span>Enable notifications</span>
            </label>
          </div>

          <div className="inline-actions">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settingsDraft.notifications.dueToday}
                onChange={(event) =>
                  setSettingsDraft({
                    ...settingsDraft,
                    notifications: { ...settingsDraft.notifications, dueToday: event.target.checked }
                  })
                }
              />
              <span>Notify due today</span>
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settingsDraft.notifications.overdue}
                onChange={(event) =>
                  setSettingsDraft({
                    ...settingsDraft,
                    notifications: { ...settingsDraft.notifications, overdue: event.target.checked }
                  })
                }
              />
              <span>Notify overdue</span>
            </label>
          </div>

          <div className="inline-actions">
            <button className="secondary" type="button" onClick={() => void showAllPanels()}>
              Show panels
            </button>
            <button className="secondary" type="button" onClick={() => void hideAllPanels()}>
              Hide panels
            </button>
            <button className="secondary" type="button" onClick={() => void togglePauseAlwaysOnTop()}>
              {settingsDraft.pauseAlwaysOnTop ? 'Resume always-on-top' : 'Pause always-on-top'}
            </button>
          </div>
        </article>
      </section>

      <section className="card manager-card">
        <div className="section-header">
          <div>
            <h2>Panels</h2>
            <p className="muted">Each panel has its own tab, with grouped settings underneath.</p>
          </div>
          <button type="button" onClick={() => void createPanel()}>
            Create panel
          </button>
        </div>

        {manager.panels.length === 0 ? (
          <p className="empty-state">No panels yet. Create one to start configuring a sticky project panel.</p>
        ) : (
          <div className="panel-config-shell">
            <div className="tab-strip">
              {manager.panels.map((panel) => {
                const draft = panelDrafts[panel.id] ?? panel;
                return (
                  <button
                    key={panel.id}
                    type="button"
                    className={`tab-button ${activePanelId === panel.id ? 'tab-button--active' : ''}`}
                    onClick={() => {
                      setActivePanelId(panel.id);
                      setActivePanelSection('general');
                    }}
                  >
                    {draft.name}
                  </button>
                );
              })}
            </div>

            {activePanel ? (
              <>
                <div className="subtab-strip">
                  {(['general', 'appearance', 'behavior'] as PanelSection[]).map((section) => (
                    <button
                      key={section}
                      type="button"
                      className={`subtab-button ${activePanelSection === section ? 'subtab-button--active' : ''}`}
                      onClick={() => setActivePanelSection(section)}
                    >
                      {section === 'general' ? 'General' : section === 'appearance' ? 'Appearance' : 'Behavior'}
                    </button>
                  ))}
                </div>

                {activePanelSection === 'general' ? (
                  <div className="field-grid">
                    <label>
                      <span>Panel title</span>
                      <input type="text" value={activePanel.name} readOnly title="Panel titles follow the selected project." />
                    </label>
                    <label>
                      <span>Project</span>
                      <select
                        value={activePanel.projectId ?? ''}
                        onChange={(event) => {
                          const projectId = event.target.value ? Number(event.target.value) : null;
                          const nextProjectLabel = projectId ? projectLabels.get(projectId) ?? '' : activePanel.name;
                          setPanelDraft(activePanel.id, {
                            ...activePanel,
                            projectId,
                            name: nextProjectLabel || activePanel.name
                          });
                        }}
                      >
                        <option value="">Choose project</option>
                        {manager.projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {projectLabels.get(project.id) ?? project.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Sort</span>
                      <select
                        value={activePanel.sortMode}
                        onChange={(event) =>
                          setPanelDraft(activePanel.id, {
                            ...activePanel,
                            sortMode: event.target.value as PanelConfig['sortMode']
                          })
                        }
                      >
                        <option value="vikunja">Vikunja order</option>
                        <option value="dueDate">Due date</option>
                        <option value="priority">Priority</option>
                        <option value="newest">Newest first</option>
                        <option value="oldest">Oldest first</option>
                        <option value="alphabetical">Alphabetical</option>
                        <option value="overdueFirst">Overdue first</option>
                      </select>
                    </label>
                    <label>
                      <span>Filter</span>
                      <select
                        value={activePanel.filterMode}
                        onChange={(event) =>
                          setPanelDraft(activePanel.id, {
                            ...activePanel,
                            filterMode: event.target.value as PanelConfig['filterMode']
                          })
                        }
                      >
                        <option value="open">Open tasks only</option>
                        <option value="dueToday">Due today</option>
                        <option value="overdue">Overdue</option>
                        <option value="dueEmphasis">Open with due emphasis</option>
                      </select>
                    </label>
                    <label>
                      <span>Item limit</span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={activePanel.itemCount}
                        onChange={(event) =>
                          setPanelDraft(activePanel.id, {
                            ...activePanel,
                            itemCount: Number(event.target.value) || 10
                          })
                        }
                      />
                    </label>
                  </div>
                ) : null}

                {activePanelSection === 'appearance' ? (
                  <div className="field-grid">
                    <label>
                      <span>Color</span>
                      <input
                        type="color"
                        value={activePanel.backgroundColor}
                        onChange={(event) => setPanelDraft(activePanel.id, { ...activePanel, backgroundColor: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Text color</span>
                      <input
                        type="color"
                        value={activePanel.textColor}
                        onChange={(event) => setPanelDraft(activePanel.id, { ...activePanel, textColor: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Font size</span>
                      <input
                        type="number"
                        min={12}
                        max={24}
                        value={activePanel.fontSize}
                        onChange={(event) => setPanelDraft(activePanel.id, { ...activePanel, fontSize: Number(event.target.value) || 14 })}
                      />
                    </label>
                    <label>
                      <span>Opacity</span>
                      <input
                        type="number"
                        min={0.45}
                        max={1}
                        step={0.05}
                        value={activePanel.opacity}
                        onChange={(event) => setPanelDraft(activePanel.id, { ...activePanel, opacity: Number(event.target.value) || 0.97 })}
                      />
                    </label>
                  </div>
                ) : null}

                {activePanelSection === 'behavior' ? (
                  <div className="field-grid">
                    <label>
                      <span>Display mode</span>
                      <select
                        value={activePanel.displayMode}
                        onChange={(event) =>
                          setPanelDraft(activePanel.id, {
                            ...activePanel,
                            displayMode: event.target.value as PanelConfig['displayMode']
                          })
                        }
                      >
                        <option value="full">Full</option>
                        <option value="minimized">Minimized</option>
                        <option value="edge-docked">Edge-docked</option>
                      </select>
                    </label>
                    <label>
                      <span>Dock edge</span>
                      <select
                        value={activePanel.dockEdge}
                        onChange={(event) =>
                          setPanelDraft(activePanel.id, {
                            ...activePanel,
                            dockEdge: event.target.value as PanelConfig['dockEdge']
                          })
                        }
                      >
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                        <option value="top">Top</option>
                        <option value="bottom">Bottom</option>
                      </select>
                    </label>
                    <label>
                      <span>Notify</span>
                      <select
                        value={activePanel.notificationMode}
                        onChange={(event) =>
                          setPanelDraft(activePanel.id, {
                            ...activePanel,
                            notificationMode: event.target.value as PanelConfig['notificationMode']
                          })
                        }
                      >
                        <option value="default">Use global defaults</option>
                        <option value="off">Off</option>
                        <option value="dueToday">Due today</option>
                        <option value="overdue">Overdue</option>
                        <option value="dueTodayAndOverdue">Due today + overdue</option>
                      </select>
                    </label>
                    <label className="toggle-row toggle-row--card">
                      <input
                        type="checkbox"
                        checked={activePanel.alwaysOnTop}
                        onChange={(event) => setPanelDraft(activePanel.id, { ...activePanel, alwaysOnTop: event.target.checked })}
                      />
                      <span>Always on top</span>
                    </label>
                  </div>
                ) : null}

                <div className="inline-actions">
                  <button className="secondary" type="button" onClick={() => void updatePanel(activePanel)}>
                    Save panel
                  </button>
                  <button className="ghost-button" type="button" onClick={() => void deletePanel(activePanel.id)}>
                    Delete panel
                  </button>
                </div>
              </>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

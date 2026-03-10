import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import type { PanelConfig, VikunjaProject, VikunjaTask } from '../../shared/types';
import { useAppStore } from '../store/useAppStore';

function formatDue(dateValue: string | null) {
  if (!dateValue) {
    return '';
  }

  return new Date(dateValue).toLocaleDateString();
}

function buildProjectLabel(projectId: number, projects: VikunjaProject[]) {
  const lookup = new Map(projects.map((project) => [project.id, project]));
  const parts: string[] = [];
  let current = lookup.get(projectId) ?? null;

  while (current) {
    parts.unshift(current.title);
    current = current.parentProjectId ? lookup.get(current.parentProjectId) ?? null : null;
  }

  return parts.join(' / ');
}

function parseHexColor(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;

  if (normalized.length === 3) {
    return normalized.split('').map((segment) => Number.parseInt(`${segment}${segment}`, 16)) as [number, number, number];
  }

  if (normalized.length === 6) {
    return [
      Number.parseInt(normalized.slice(0, 2), 16),
      Number.parseInt(normalized.slice(2, 4), 16),
      Number.parseInt(normalized.slice(4, 6), 16)
    ] as [number, number, number];
  }

  return null;
}

function toLinear(channel: number) {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function getLuminance(color: [number, number, number]) {
  return 0.2126 * toLinear(color[0]) + 0.7152 * toLinear(color[1]) + 0.0722 * toLinear(color[2]);
}

function getContrastRatio(background: string, foreground: string) {
  const backgroundRgb = parseHexColor(background);
  const foregroundRgb = parseHexColor(foreground);
  if (!backgroundRgb || !foregroundRgb) {
    return 0;
  }

  const backgroundLum = getLuminance(backgroundRgb);
  const foregroundLum = getLuminance(foregroundRgb);
  const lighter = Math.max(backgroundLum, foregroundLum);
  const darker = Math.min(backgroundLum, foregroundLum);
  return (lighter + 0.05) / (darker + 0.05);
}

function getAutoTextColor(background: string) {
  const dark = '#1f1400';
  const light = '#f8fafc';
  return getContrastRatio(background, dark) >= getContrastRatio(background, light) ? dark : light;
}

function resolvePanelTextColor(background: string, preferred: string) {
  const automatic = getAutoTextColor(background);
  return getContrastRatio(background, preferred) >= 4.5 ? preferred : automatic;
}

function rgbaFromHex(value: string, alpha: number) {
  const rgb = parseHexColor(value);
  if (!rgb) {
    return `rgba(15, 23, 42, ${alpha})`;
  }

  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function getPanelButtonFill(background: string) {
  const rgb = parseHexColor(background);
  if (!rgb) {
    return 'rgba(0, 0, 0, 0.15)';
  }

  return getLuminance(rgb) > 0.6 ? 'rgba(0, 0, 0, 0.14)' : 'rgba(255, 255, 255, 0.16)';
}

export function PanelView() {
  const panelBootstrap = useAppStore((state) => state.panel);
  const syncError = useAppStore((state) => state.panel?.sync.lastError);
  const updatePanel = useAppStore((state) => state.updatePanel);
  const setPanelHoverState = useAppStore((state) => state.setPanelHoverState);
  const togglePanelMinimized = useAppStore((state) => state.togglePanelMinimized);
  const createTask = useAppStore((state) => state.createTask);
  const toggleTaskDone = useAppStore((state) => state.toggleTaskDone);
  const renameTask = useAppStore((state) => state.renameTask);
  const openTaskDetails = useAppStore((state) => state.openTaskDetails);
  const syncNow = useAppStore((state) => state.syncNow);
  const showManager = useAppStore((state) => state.showManager);

  const [taskDraft, setTaskDraft] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsedLabelVisible, setCollapsedLabelVisible] = useState(true);
  const clickTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (clickTimer.current) {
        window.clearTimeout(clickTimer.current);
      }
    };
  }, []);

  const projectOptions = useMemo(() => panelBootstrap?.projects ?? [], [panelBootstrap]);
  const projectLabels = useMemo(
    () => new Map(projectOptions.map((project) => [project.id, buildProjectLabel(project.id, projectOptions)])),
    [projectOptions]
  );

  if (!panelBootstrap) {
    return null;
  }

  const panel = panelBootstrap.panel;
  const projectLabel = panel.projectId ? projectLabels.get(panel.projectId) ?? 'Choose project' : 'Choose project';
  const isCollapsedDock = panel.displayMode === 'edge-docked' && !panel.hoverExpanded;
  const showDates = panel.showDueDates;
  const resolvedTextColor = resolvePanelTextColor(panel.backgroundColor, panel.textColor);
  const shouldFadeCollapsedLabel = isCollapsedDock && (panel.dockEdge === 'left' || panel.dockEdge === 'right');
  const textStyle = {
    background: panel.backgroundColor,
    color: resolvedTextColor,
    fontSize: `${panel.fontSize}px`,
    opacity: panel.opacity,
    '--panel-subtle-color': rgbaFromHex(resolvedTextColor, 0.78),
    '--panel-border-color': rgbaFromHex(resolvedTextColor, 0.18),
    '--panel-button-fill': getPanelButtonFill(panel.backgroundColor)
  } as CSSProperties;

  useEffect(() => {
    if (!shouldFadeCollapsedLabel) {
      setCollapsedLabelVisible(true);
      return;
    }

    setCollapsedLabelVisible(true);
    const timer = window.setTimeout(() => {
      setCollapsedLabelVisible(false);
    }, 2400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [shouldFadeCollapsedLabel, panel.id, projectLabel]);

  function handleTaskClick(task: VikunjaTask) {
    clickTimer.current = window.setTimeout(() => {
      void openTaskDetails(panel.id, task.id);
    }, 180);
  }

  function handleTaskDoubleClick(task: VikunjaTask) {
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }

    setEditingTaskId(task.id);
    setEditingTitle(task.title);
  }

  async function submitQuickAdd() {
    if (!taskDraft.trim()) {
      return;
    }

    await createTask(panel.id, taskDraft.trim());
    setTaskDraft('');
  }

  function updatePanelField(next: Partial<PanelConfig>) {
    void updatePanel({
      ...panel,
      ...next
    });
  }

  return (
    <div
      className={`panel-shell panel-shell--${panel.displayMode} ${isCollapsedDock ? `panel-shell--collapsed panel-shell--dock-${panel.dockEdge}` : ''}`}
      style={textStyle}
      onMouseEnter={() => void setPanelHoverState(panel.id, true)}
      onMouseLeave={() => void setPanelHoverState(panel.id, false)}
    >
      <header className="sticky-header">
        <div
          className={`sticky-header__titles ${isCollapsedDock ? 'sticky-header__titles--collapsed' : ''}`}
          title={panel.displayMode === 'minimized' ? 'Double-click to restore full mode' : undefined}
          onDoubleClick={() => {
            if (panel.displayMode === 'minimized') {
              void togglePanelMinimized(panel.id);
            }
          }}
        >
          <p className={`eyebrow ${isCollapsedDock ? 'eyebrow--docked' : ''} ${shouldFadeCollapsedLabel && !collapsedLabelVisible ? 'eyebrow--hidden' : ''}`}>{projectLabel}</p>
          {!isCollapsedDock ? <h1>{panel.name}</h1> : null}
        </div>
        {!isCollapsedDock ? (
          <button
            className="menu-button"
            type="button"
            title="Open panel menu"
            aria-label="Open panel menu"
            onClick={() => setMenuOpen((current) => !current)}
          >
            Menu
          </button>
        ) : null}
      </header>

      {menuOpen ? (
        <section className={`panel-menu card-inline ${panel.dockEdge === 'right' ? 'panel-menu--left' : 'panel-menu--right'}`}>
          <label>
            <span>Project</span>
            <select
              value={panel.projectId ?? ''}
              onChange={(event) => {
                const projectId = event.target.value ? Number(event.target.value) : null;
                const nextProject = projectOptions.find((project) => project.id === projectId);
                updatePanelField({
                  projectId,
                  name: nextProject?.title ?? panel.name
                });
              }}
            >
              <option value="">Choose project</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {projectLabels.get(project.id) ?? project.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Display mode</span>
            <select
              value={panel.displayMode}
              onChange={(event) =>
                updatePanelField({
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
              value={panel.dockEdge}
              onChange={(event) =>
                updatePanelField({
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
            <span>Transparency</span>
            <input
              type="range"
              min={0.45}
              max={1}
              step={0.05}
              value={panel.opacity}
              onChange={(event) => updatePanelField({ opacity: Number(event.target.value) || panel.opacity })}
            />
            <span className="muted">{Math.round(panel.opacity * 100)}%</span>
          </label>
          <label>
            <span>Dock auto-hide</span>
            <input
              type="range"
              min={200}
              max={5000}
              step={100}
              value={panel.dockAutoHideDelayMs}
              onChange={(event) => updatePanelField({ dockAutoHideDelayMs: Number(event.target.value) || panel.dockAutoHideDelayMs })}
            />
            <span className="muted">{(panel.dockAutoHideDelayMs / 1000).toFixed(1)}s</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={panel.showDueDates}
              onChange={(event) => updatePanelField({ showDueDates: event.target.checked })}
            />
            <span>Show due dates</span>
          </label>
          <div className="inline-actions">
            <button className="secondary" type="button" onClick={() => void togglePanelMinimized(panel.id)}>
              Toggle minimized
            </button>
            <button className="secondary" type="button" onClick={() => void syncNow()}>
              Refresh
            </button>
            <button className="ghost-button" type="button" onClick={() => void showManager()}>
              Settings
            </button>
          </div>
        </section>
      ) : null}

      {syncError ? <p className="panel-banner">Offline cache shown: {syncError}</p> : null}

      {panel.displayMode !== 'minimized' && !isCollapsedDock ? (
        <>
          <section className="quick-add">
            <input
              type="text"
              placeholder="Quick add a task"
              value={taskDraft}
              onChange={(event) => setTaskDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void submitQuickAdd();
                }
              }}
            />
            <button type="button" onClick={() => void submitQuickAdd()}>
              Add
            </button>
          </section>

          <section className="task-list">
            {panelBootstrap.tasks.length === 0 ? (
              <p className="empty-state">
                No matching tasks in {panel.projectId ? projectLabel : 'this panel'}.
              </p>
            ) : null}
            {panelBootstrap.tasks.map((task) => (
              <article key={task.id} className={`task-row ${task.done ? 'task-row--done' : ''}`}>
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={(event) => void toggleTaskDone(panel.id, task.id, event.target.checked)}
                />
                <div className="task-row__body">
                  {editingTaskId === task.id ? (
                    <input
                      autoFocus
                      type="text"
                      value={editingTitle}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      onBlur={() => {
                        if (editingTitle.trim()) {
                          void renameTask(panel.id, task.id, editingTitle.trim());
                        }
                        setEditingTaskId(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          void renameTask(panel.id, task.id, editingTitle.trim());
                          setEditingTaskId(null);
                        }
                        if (event.key === 'Escape') {
                          setEditingTaskId(null);
                        }
                      }}
                    />
                  ) : (
                    <button
                      className="task-title"
                      type="button"
                      onClick={() => handleTaskClick(task)}
                      onDoubleClick={() => handleTaskDoubleClick(task)}
                    >
                      {task.title}
                    </button>
                  )}
                  <div className="task-row__meta">
                    {task.priority ? <span>P{task.priority}</span> : null}
                    {showDates && task.dueDate ? <span>{formatDue(task.dueDate)}</span> : null}
                  </div>
                </div>
              </article>
            ))}
          </section>
        </>
      ) : (
        <section className="minimized-note">
          <span>{panelBootstrap.tasks.length} open tasks</span>
        </section>
      )}
    </div>
  );
}

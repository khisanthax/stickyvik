import { useEffect, useMemo, useRef, useState } from 'react';

import type { PanelConfig, VikunjaTask } from '../../shared/types';
import { useAppStore } from '../store/useAppStore';

function formatDue(dateValue: string | null) {
  if (!dateValue) {
    return '';
  }

  return new Date(dateValue).toLocaleDateString();
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
  const clickTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (clickTimer.current) {
        window.clearTimeout(clickTimer.current);
      }
    };
  }, []);

  const projectOptions = useMemo(() => panelBootstrap?.projects ?? [], [panelBootstrap]);

  if (!panelBootstrap) {
    return null;
  }

  const panel = panelBootstrap.panel;
  const textStyle = {
    background: panel.backgroundColor,
    color: panel.textColor,
    fontSize: `${panel.fontSize}px`,
    opacity: panel.opacity
  };

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

  return (
    <div
      className={`panel-shell panel-shell--${panel.displayMode}`}
      style={textStyle}
      onMouseEnter={() => void setPanelHoverState(panel.id, true)}
      onMouseLeave={() => void setPanelHoverState(panel.id, false)}
    >
      <header className="sticky-header">
        <div>
          <p className="eyebrow">{projectOptions.find((project) => project.id === panel.projectId)?.title ?? 'Choose project'}</p>
          <h1>{panel.name}</h1>
        </div>
        <button className="menu-button" type="button" onClick={() => setMenuOpen((current) => !current)}>
          •••
        </button>
      </header>

      {menuOpen ? (
        <section className="panel-menu card-inline">
          <label>
            <span>Project</span>
            <select
              value={panel.projectId ?? ''}
              onChange={(event) =>
                void updatePanel({
                  ...panel,
                  projectId: event.target.value ? Number(event.target.value) : null
                })
              }
            >
              <option value="">Choose project</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Display mode</span>
            <select
              value={panel.displayMode}
              onChange={(event) =>
                void updatePanel({
                  ...panel,
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
                void updatePanel({
                  ...panel,
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

      {panel.displayMode !== 'minimized' ? (
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
            {panelBootstrap.tasks.length === 0 ? <p className="empty-state">No matching tasks for this panel.</p> : null}
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
                    {task.dueDate ? <span>{formatDue(task.dueDate)}</span> : null}
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

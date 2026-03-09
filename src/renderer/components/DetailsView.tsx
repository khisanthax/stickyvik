import { useEffect, useMemo, useState } from 'react';

import { useAppStore } from '../store/useAppStore';

function formatDate(dateValue: string | null) {
  if (!dateValue) {
    return 'No due date';
  }

  return new Date(dateValue).toLocaleString();
}

export function DetailsView() {
  const details = useAppStore((state) => state.details);
  const renameTask = useAppStore((state) => state.renameTask);
  const moveTask = useAppStore((state) => state.moveTask);
  const toggleTaskDone = useAppStore((state) => state.toggleTaskDone);
  const syncNow = useAppStore((state) => state.syncNow);
  const showManager = useAppStore((state) => state.showManager);

  const [titleDraft, setTitleDraft] = useState('');

  useEffect(() => {
    if (details) {
      setTitleDraft(details.task.title);
    }
  }, [details?.task.id, details?.task.title]);

  const projectTitle = useMemo(() => {
    if (!details) {
      return 'Unknown project';
    }

    return details.projects.find((project) => project.id === details.task.projectId)?.title ?? 'Unknown project';
  }, [details]);

  if (!details) {
    return null;
  }

  const panelId = details.panel.id;
  const task = details.task;

  return (
    <div className="details-shell">
      <header className="details-header">
        <div>
          <p className="eyebrow">Task details</p>
          <h1>{task.title}</h1>
          <p className="muted">{projectTitle}</p>
        </div>
        <button className="secondary" type="button" onClick={() => void showManager()}>
          Settings
        </button>
      </header>

      <section className="details-card">
        <label>
          <span>Title</span>
          <input type="text" value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} />
        </label>

        <div className="inline-actions">
          <button
            type="button"
            onClick={() => {
              const nextTitle = titleDraft.trim();
              if (!nextTitle) {
                return;
              }
              void renameTask(panelId, task.id, nextTitle);
            }}
          >
            Save title
          </button>
          <button className="secondary" type="button" onClick={() => void toggleTaskDone(panelId, task.id, !task.done)}>
            {task.done ? 'Mark open' : 'Complete task'}
          </button>
          <button className="secondary" type="button" onClick={() => void syncNow()}>
            Refresh
          </button>
        </div>
      </section>

      <section className="details-grid-card">
        <div>
          <h2>Status</h2>
          <p>{task.done ? 'Completed' : 'Open'}</p>
        </div>
        <div>
          <h2>Due</h2>
          <p>{formatDate(task.dueDate)}</p>
        </div>
        <div>
          <h2>Priority</h2>
          <p>{task.priority || 'None'}</p>
        </div>
        <div>
          <h2>Move to project</h2>
          <select value={task.projectId} onChange={(event) => void moveTask(panelId, task.id, Number(event.target.value))}>
            {details.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="details-card">
        <h2>Notes</h2>
        <div className="details-notes">{task.description || 'No description available.'}</div>
      </section>

      {details.sync.lastError ? <p className="panel-banner">Sync issue: {details.sync.lastError}</p> : null}
    </div>
  );
}

import type { VikunjaProject, VikunjaTask } from '../../shared/types';

interface TaskDetailsModalProps {
  task: VikunjaTask | null;
  projects: VikunjaProject[];
  onClose: () => void;
  onComplete: (task: VikunjaTask) => void;
  onMove: (task: VikunjaTask, projectId: number) => void;
}

export function TaskDetailsModal({ task, projects, onClose, onComplete, onMove }: TaskDetailsModalProps) {
  if (!task) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <div>
            <p className="modal__eyebrow">Task details</p>
            <h3>{task.title}</h3>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <dl className="details-grid">
          <div>
            <dt>Project</dt>
            <dd>{projects.find((project) => project.id === task.projectId)?.title ?? 'Unknown project'}</dd>
          </div>
          <div>
            <dt>Due</dt>
            <dd>{task.dueDate ? new Date(task.dueDate).toLocaleString() : 'No due date'}</dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>{task.priority || 'None'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{task.done ? 'Completed' : 'Open'}</dd>
          </div>
        </dl>

        <section className="details-body">
          <h4>Notes</h4>
          <p>{task.description || 'No description available.'}</p>
        </section>

        <div className="details-actions">
          <button type="button" onClick={() => onComplete(task)}>
            {task.done ? 'Mark Open' : 'Complete Task'}
          </button>
          <label>
            <span>Move to project</span>
            <select defaultValue={task.projectId} onChange={(event) => onMove(task, Number(event.target.value))}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
import type {
  AppSettings,
  AuthMethod,
  ConnectionTestInput,
  PanelConfig,
  PanelFilterMode,
  PanelSortMode,
  VikunjaProject,
  VikunjaTask
} from '../../shared/types';
import { loadStoredSecret } from './credentials';

interface RequestOptions extends RequestInit {
  authMethod?: AuthMethod;
}

function normalizeServerUrl(serverUrl: string) {
  return serverUrl.trim().replace(/\/+$/, '');
}

function getApiBase(serverUrl: string) {
  return `${normalizeServerUrl(serverUrl)}/api/v1`;
}

function mapProject(project: Record<string, unknown>): VikunjaProject {
  return {
    id: Number(project.id),
    title: String(project.title ?? project.name ?? `Project ${project.id}`),
    parentProjectId:
      project.parent_project_id === null || project.parent_project_id === undefined
        ? null
        : Number(project.parent_project_id),
    isArchived: Boolean(project.is_archived ?? false)
  };
}

function mapTask(task: Record<string, unknown>): VikunjaTask {
  return {
    id: Number(task.id),
    title: String(task.title ?? ''),
    description: String(task.description ?? ''),
    done: Boolean(task.done),
    dueDate: task.due_date ? String(task.due_date) : null,
    priority: Number(task.priority ?? 0),
    projectId: Number(task.project_id ?? 0),
    createdAt: task.created ? String(task.created) : null,
    updatedAt: task.updated ? String(task.updated) : null,
    position: task.position === undefined || task.position === null ? null : Number(task.position)
  };
}

async function getAuthToken(settings: AppSettings, authMethod?: AuthMethod) {
  const stored = await loadStoredSecret();
  if (!stored || !stored.secret) {
    throw new Error('No stored credentials found. Reconnect in settings.');
  }

  const effectiveMethod = authMethod ?? settings.authMethod;
  if (effectiveMethod === 'token') {
    return stored.secret;
  }

  const response = await fetch(`${getApiBase(settings.serverUrl)}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      username: stored.username,
      password: stored.secret
    })
  });

  if (!response.ok) {
    throw new Error(`Login failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { token?: string };
  if (!payload.token) {
    throw new Error('Vikunja login did not return a token');
  }

  return payload.token;
}

async function request<T>(settings: AppSettings, path: string, init?: RequestOptions) {
  const token = await getAuthToken(settings, init?.authMethod);
  const response = await fetch(`${getApiBase(settings.serverUrl)}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Vikunja request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function testConnection(input: ConnectionTestInput) {
  const settings: AppSettings = {
    serverUrl: input.serverUrl,
    authMethod: input.authMethod,
    username: input.username,
    includeSubprojects: true,
    allowedProjectIds: [],
    syncIntervalSeconds: 60,
    launchAtStartup: true,
    pauseAlwaysOnTop: false,
    notifications: {
      enabled: false,
      overdue: true,
      dueToday: true
    },
    defaults: {
      backgroundColor: '#fff2af',
      textColor: '#2d2513',
      fontSize: 14,
      opacity: 0.97,
      itemCount: 10,
      sortMode: 'vikunja',
      filterMode: 'open',
      notificationsEnabled: false,
      alwaysOnTop: true,
      displayMode: 'full',
      dockEdge: 'right'
    }
  };

  const token =
    input.authMethod === 'token'
      ? input.secret
      : await (async () => {
          const response = await fetch(`${getApiBase(input.serverUrl)}/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify({
              username: input.username,
              password: input.secret
            })
          });

          if (!response.ok) {
            throw new Error(`Login failed with status ${response.status}`);
          }

          const payload = (await response.json()) as { token?: string };
          if (!payload.token) {
            throw new Error('Login succeeded but no token was returned');
          }

          return payload.token;
        })();

  const response = await fetch(`${getApiBase(settings.serverUrl)}/projects`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Project fetch failed with status ${response.status}`);
  }

  const rawProjects = (await response.json()) as Record<string, unknown>[];
  return rawProjects.map(mapProject);
}

export async function fetchProjects(settings: AppSettings) {
  const rawProjects = await request<Record<string, unknown>[]>(settings, '/projects');
  return rawProjects.map(mapProject);
}

export async function fetchTasksForPanel(settings: AppSettings, panel: PanelConfig) {
  if (!panel.projectId) {
    return [] as VikunjaTask[];
  }

  const rawTasks = await request<Record<string, unknown>[]>(settings, `/projects/${panel.projectId}/tasks`);
  const mapped = rawTasks.map(mapTask).filter((task) => task.projectId === panel.projectId || task.projectId === 0);
  return sortAndFilterTasks(
    mapped.map((task) => ({
      ...task,
      projectId: task.projectId || panel.projectId || 0
    })),
    panel.sortMode,
    panel.filterMode,
    panel.itemCount
  );
}

export async function createTask(settings: AppSettings, projectId: number, title: string) {
  await request(settings, `/projects/${projectId}/tasks`, {
    method: 'PUT',
    body: JSON.stringify({ title })
  });
}

export async function getTaskDetails(settings: AppSettings, taskId: number) {
  const task = await request<Record<string, unknown>>(settings, `/tasks/${taskId}`);
  return mapTask(task);
}

async function updateTask(settings: AppSettings, taskId: number, patch: Record<string, unknown>) {
  const current = await getTaskDetails(settings, taskId);
  await request(settings, `/tasks/${taskId}`, {
    method: 'POST',
    body: JSON.stringify({
      title: current.title,
      description: current.description,
      done: current.done,
      due_date: current.dueDate,
      priority: current.priority,
      project_id: current.projectId,
      ...patch
    })
  });
}

export async function setTaskDone(settings: AppSettings, taskId: number, done: boolean) {
  await updateTask(settings, taskId, { done });
}

export async function renameTask(settings: AppSettings, taskId: number, title: string) {
  await updateTask(settings, taskId, { title });
}

export async function moveTask(settings: AppSettings, taskId: number, projectId: number) {
  await updateTask(settings, taskId, { project_id: projectId });
}

function isDueToday(dateValue: string | null) {
  if (!dateValue) {
    return false;
  }

  const due = new Date(dateValue);
  const now = new Date();
  return due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth() && due.getDate() === now.getDate();
}

function isOverdue(dateValue: string | null) {
  if (!dateValue) {
    return false;
  }

  return new Date(dateValue).getTime() < Date.now();
}

export function sortAndFilterTasks(
  tasks: VikunjaTask[],
  sortMode: PanelSortMode,
  filterMode: PanelFilterMode,
  itemLimit: number
) {
  const filtered = tasks.filter((task) => {
    if (filterMode === 'open') {
      return !task.done;
    }

    if (filterMode === 'dueToday') {
      return !task.done && isDueToday(task.dueDate);
    }

    if (filterMode === 'overdue') {
      return !task.done && isOverdue(task.dueDate);
    }

    if (filterMode === 'dueEmphasis') {
      return !task.done;
    }

    return true;
  });

  const sorted = [...filtered].sort((left, right) => {
    if (sortMode === 'vikunja') {
      return (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER);
    }

    if (sortMode === 'dueDate') {
      return compareOptionalDate(left.dueDate, right.dueDate);
    }

    if (sortMode === 'priority') {
      return right.priority - left.priority;
    }

    if (sortMode === 'newest') {
      return compareOptionalDate(right.createdAt, left.createdAt);
    }

    if (sortMode === 'oldest') {
      return compareOptionalDate(left.createdAt, right.createdAt);
    }

    if (sortMode === 'alphabetical') {
      return left.title.localeCompare(right.title);
    }

    if (sortMode === 'overdueFirst') {
      return Number(isOverdue(right.dueDate)) - Number(isOverdue(left.dueDate)) || compareOptionalDate(left.dueDate, right.dueDate);
    }

    return 0;
  });

  return sorted.slice(0, itemLimit);
}

function compareOptionalDate(left: string | null, right: string | null) {
  const leftValue = left ? new Date(left).getTime() : Number.MAX_SAFE_INTEGER;
  const rightValue = right ? new Date(right).getTime() : Number.MAX_SAFE_INTEGER;
  return leftValue - rightValue;
}
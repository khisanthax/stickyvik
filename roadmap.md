# Vikunja Sticky Roadmap

## Project summary

Windows-first Electron desktop companion for Vikunja with a tray controller, a manager/settings window, and floating sticky panels for project-scoped task visibility and quick actions.

## MVP scope

- Secure Vikunja connection and test flow
- Allowed-project privacy controls
- Tray controller for panel lifecycle and sync
- Multiple sticky panels with per-panel project selection and style overrides
- Open-task display, quick add, complete, rename, move, and details view
- Minimized and edge-docked collapsed hover-expand modes
- Persisted panel restore, monitor-aware placement, and Windows startup
- Minimal notifications for due-today / overdue reminders
- Graceful offline/auth failure handling with cached task visibility

## Current implementation status

### Phase 1: App foundation

- Electron + React + TypeScript + Vite scaffold: `Done`
- Secure preload bridge and typed IPC: `Done`
- Zustand renderer state: `Done`
- Persistent local settings store: `Done`
- Keytar credential storage: `Done`

### Phase 2: Vikunja onboarding and settings

- Server URL and auth setup: `Done`
- Test connection flow: `Done`
- Allowed projects selection: `Done`
- Include subprojects toggle: `Done`
- Clear first-run guidance: `Partial`

### Phase 3: Tray app and panel manager

- Tray menu with create/show/hide/sync/settings/pause/quit: `Done`
- Manager window for settings and panel management: `Done`
- Reopen existing panels on startup: `Done`
- Reopen closed panel history: `Deferred`

### Phase 4: Sticky panels

- Multiple floating panel windows: `Done`
- Per-panel project, colors, font size, opacity, item limit: `Done`
- Always-on-top control: `Done`
- Minimized title-only mode: `Done`
- Edge-docked collapsed hover-expand mode: `Done`
- Selected monitor placement and fallback restore: `Done`
- Snap-to-grid settings scaffolding: `Partial`

### Phase 5: Task interactions

- Fetch and display open tasks: `Done`
- Quick add task: `Done`
- Complete task: `Done`
- Double-click rename: `Done`
- Move task: `Done`
- Lightweight task details window: `Done`

### Phase 6: Sync, errors, notifications

- Auto-sync and manual refresh: `Done`
- Offline/auth error state with cached data: `Done`
- Password-auth credential reuse and session token caching: `Done`
- Global notification settings: `Done`
- Per-panel notification override: `Done`

### Phase 7: Windows behavior and polish

- Launch on Windows startup: `Done`
- Restore bounds across app restart: `Done`
- Monitor-aware restoration and missing-monitor recovery: `Done`
- Dock/focus/hover stability polish: `Done`

## Remaining high-priority work

1. Run a live smoke test against a real Vikunja instance with valid credentials.
2. Add dedicated first-run onboarding polish instead of relying on the manager window only.

## Post-MVP / deferred

- Mirrored panels across all monitors
- Native panel manager history for reopening closed panels
- Snap-to-grid controls beyond current scaffolding
- Broader notification rules and richer snooze behavior
- Deep task editing, comments, attachments, subtasks, labels

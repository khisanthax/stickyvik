# StickyVik

Vikunja Sticky is a Windows-first Electron desktop companion for Vikunja. It combines a tray controller, a manager/settings window, and lightweight floating sticky panels that keep project tasks visible on the desktop.

## Current MVP status

Implemented in the current branch:

- Electron + React + TypeScript + Vite desktop scaffold
- Secure preload bridge with isolated Electron main / preload / renderer separation
- Tray controller with create panel, show/hide, sync, settings, pause always-on-top, and quit actions
- Manager window with connection settings, allowed project selection, defaults, and persisted panel management
- Secure credential storage via `keytar`
- Multiple floating sticky panels with per-panel project selection, style overrides, minimized mode, and edge-docked hover-expand behavior
- Native lightweight task details windows for title, project move, notes, and completion actions
- Runtime-stabilized dock hover handling, monitor-change reconciliation, and monitor-aware restore fallback
- Vikunja API client layer for test connection, project fetch, task fetch, create task, complete task, rename task, move task, and details fetch
- Restore of saved panels and their monitor/bounds data on startup
- Global notification defaults plus per-panel notification overrides for due-today and overdue reminders

## Development

1. Install dependencies with `npm install`
2. Rebuild native Electron dependencies with `npm run postinstall` if needed
3. Start the app with `npm run dev`
4. Build the app with `npm run build`
5. Package Windows output with `npm run dist`

## Architecture

- `src/main`: Electron main process, secure credential handling, tray/controller behavior, Vikunja API client, state persistence, and panel/details window management
- `src/renderer`: React manager UI, sticky panel UI, and native details-window UI backed by Zustand stores
- `src/shared`: Typed contracts for IPC, settings, projects, tasks, and panels

## Configuration notes

- Vikunja server URL and non-secret app settings are stored locally in the app store
- Credentials or tokens are stored with `keytar`
- One Vikunja account/server is supported for MVP
- Saved credentials are reused for later syncs and connection tests unless you enter a replacement in settings
- The password auth flow caches its Vikunja session token in-process to avoid unnecessary repeat logins during sync
- The app targets Windows behavior first, including tray persistence and `openAtLogin`

## Smoke test checklist

1. Run `npm install`
2. Run `npm run postinstall`
3. Run `npm run dev`
4. In the manager window, enter your Vikunja URL and token or username/password
5. Click `Test connection` and confirm the project count returns successfully
6. Save settings, choose allowed projects, and create a panel
7. Verify the panel loads tasks for the selected project
8. Verify quick add, complete, rename, move, notification mode selection, and native details window behavior
9. Switch a panel to `edge-docked` and confirm expand/collapse behavior on hover and focus
10. Restart the app and confirm panels restore to the expected monitor and bounds

## Known limitations

- The Vikunja API layer is implemented against the common `/api/v1` endpoints and may need endpoint adjustments for older server versions
- A real live Vikunja smoke test still depends on developer-provided credentials and a reachable server
- The current first-run experience is functional through the manager window, but not yet a dedicated onboarding flow

## TODO after MVP

- Mirrored panels across all monitors
- Snap-to-grid placement controls in the panel manager
- Richer notification rules and snooze behavior

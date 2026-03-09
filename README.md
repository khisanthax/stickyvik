# StickyVik

StickyVik is a Windows-first Electron desktop panel for keeping Vikunja tasks pinned at the edge of the screen.

## Status

The repository currently contains the first milestone:

- Electron + React + TypeScript application scaffold
- Frameless always-on-top tray-backed panel window
- Persistent local settings and panel bounds storage
- Dock side and collapse controls in the renderer shell

## Development

1. Install dependencies with `npm install`
2. Start the desktop app with `npm run dev`
3. Build the app with `npm run build`
4. Create a Windows package with `npm run dist`

## Architecture

- `src/main`: Electron main process, preload bridge, window/tray control, persistence
- `src/renderer`: React UI rendered inside the sticky panel
- `src/shared`: Typed contracts shared across process boundaries

## Configuration

StickyVik stores its local state in Electron's `userData` directory as `stickyvik.settings.json`.

Planned next milestone:

- Vikunja API connection test
- Task fetching and sticky task rendering
- Monitor-aware dock/restore improvements
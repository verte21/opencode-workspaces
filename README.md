# opencode-workspaces

An **OpenCode v2** plugin (`@opencode/plugin` + `@opencode/plugin/tui` + `@opencode/plugin/rpc`) that turns the right-hand pane into a live, 2-level **Project → Git Worktree → Session** workspace tree.

## Features

- **Always-Visible Right Sidebar Widget (`sidebar.content`)**
  - Displays pinned and active/recent projects alongside each project's primary root and Git worktrees.
  - Shows real-time agent status across every workspace (`!` blocked waiting on permission or question, `●` working/running, `▸` active, `·` idle) — including child subagent activity.
  - Displays live Git branch, dirty file count (`*3`), and ahead/behind counts (`↑2 ↓1`) via a non-locking server RPC (`git --no-optional-locks status --porcelain=v1 -b`).
  - Stable WYSIWYG quick-jump slots (`1`–`9`) so workspace numbers do not reshuffle when switching sessions.
  - Click any project header to fold/unfold, or click any worktree/session to jump straight to it (automatically starting a session if the worktree doesn't have one yet).
- **Interactive Right Split-Pane (`session.panel` via `Ctrl+G`)**
  - Focusable keyboard-driven manager on the right side of the session view (`j`/`k` navigate, `Enter` open, `1`–`9` quick-jump, `n` new Git worktree + session, `s` new session, `m` move current session to worktree, `p` pin/unpin project, `x` remove worktree, `i` filter idle projects, `f` fullscreen, `q`/`Esc` close).
- **Global `/ws` Slash Command & Searchable Switcher (`Ctrl+Shift+W`)**
  - Works from both the **Home** screen and any **Session** screen.
  - `/ws` — Open searchable workspace/worktree/session selector (`Ctrl+N` new worktree, `Ctrl+S` new session, `Ctrl+P` pin/unpin).
  - `/ws 1` .. `/ws 9` — Instant jump to numbered workspace slot.
  - `/ws panel` — Toggle the interactive right-pane manager.
  - `/ws new [branch]` — Create a new Git worktree in the current project and immediately open a session inside it.
  - `/ws session` — Start a fresh session in the current workspace directory.
  - `/ws pin` — Pin or unpin the current project at the top of the right pane.
  - `/ws filter` — Toggle hiding unpinned idle projects.
  - `/ws refresh` — Force-sync worktrees and Git status.

## Installation

### 1. Register the plugin in `~/.config/opencode/opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "/path/to/opencode-workspaces"
  ]
}
```

Or with custom options:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "/path/to/opencode-workspaces",
      "options": {
        "toggleKey": "ctrl+g",
        "switcherKey": "ctrl+shift+w",
        "maxRecentProjects": 8
      }
    }
  ]
}
```

### 2. Ensure the right sidebar is enabled in `~/.config/opencode/cli.json`

Make sure `session.sidebar` is set to `"auto"` (or `"show"`), not `"hide"`:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "session": {
    "sidebar": "auto"
  }
}
```

> Tip: You can also toggle OpenCode's right sidebar anytime with `Ctrl+X B`, or open the focusable Workspaces right split-pane with `Ctrl+G`.

## Keyboard Shortcuts (Inside `Ctrl+G` Right Panel)

| Key | Action |
| --- | --- |
| `j` / `k` or `↓` / `↑` | Move selection cursor |
| `g` / `G` | Jump to first / last item |
| `Enter` / `l` / `→` | Open selected worktree or session (or expand project) |
| `Space` / `h` / `←` | Collapse / expand project |
| `1` – `9` | Instant jump to workspace quick-slot `1`–`9` |
| `n` | Create a new Git worktree + open a session in it |
| `s` | Create a new session in the selected workspace |
| `m` | Move the current session into the selected worktree |
| `p` | Pin / unpin project (`★`) |
| `x` / `d` | Remove secondary Git worktree (with confirmation) |
| `i` | Toggle showing unpinned idle projects |
| `r` | Refresh worktrees and Git status |
| `f` | Toggle panel fullscreen |
| `q` / `Esc` | Close panel |

## Development

```bash
bun install
bun run typecheck
bun test
```

## Architecture

- `src/model.ts` — Pure 2-level workspace tree builder, status aggregation (`blocked > working > idle`), longest-prefix worktree matcher, and `git status --porcelain=v1 -b` parser.
- `src/rpc.ts` — Portable `@opencode/plugin/rpc` contract (`WorkspacesRpc`) validated with Standard Schema v1.
- `src/index.ts` — Server plugin registering `WorkspacesRpc.inspectLocations` (non-locking cached `git` inspection) and debounced filesystem/VCS/worktree change events.
- `src/tui.tsx` — Solid/OpenTUI client plugin claiming `sidebar.content`, `session.panel`, and `home.footer.status`, backed by durable `context.storage.store` preferences.

# opencode-workspaces

An **OpenCode v2** plugin (`@opencode/plugin` + `@opencode/plugin/tui` + `@opencode/plugin/rpc`) that adds a live, 2-level **Project → Git Worktree → Session** workspace tree to the lower half of the right sidebar, an interactive split panel, and a searchable switcher dialog.

## Features

- **Always-Visible Right Sidebar Lower Half (`before: "sidebar.footer"`)**
  - Anchors cleanly in the lower half of OpenCode's right sidebar with a top divider.
  - Expandable/collapsible session trees (`▸` / `▾`) per worktree, plus automatic surfacing of running or blocked background sessions (`!` permission/question, `●` working, `▸` active, `·` idle).
  - Live Git branch, dirty file count (`~3`), and ahead/behind counts (`↑2 ↓1`) via a non-locking server RPC (`git --no-optional-locks status --porcelain=v1 -b`) with automatic live refresh on file edits and completed turns.
  - Hover marquee scrolling for long branch and session names, plus hover `+` per worktree and a `+ New session` action scoped to the currently active worktree.
- **Open Worktree in Editor (`/ws open`, `Ctrl+O`, `o`)**
  - Launch any worktree directly in GUI editors (`zed`, `cursor`, `code`, `windsurf` — with macOS `.app` fallback when CLI shims aren't in `PATH`) or terminal editors (`nvim`, `hx`, `vim`, `lazygit` — cleanly suspending and resuming OpenTUI).
- **Interactive Right Split-Pane (`session.panel` via `Ctrl+G`)**
  - Focusable keyboard-driven manager (`j`/`k` navigate, `Enter` open, `o` open in editor, `1`–`9` quick-jump, `n` new Git worktree + session, `s` new session, `m` move current session to worktree, `p` pin/unpin repo, `x` remove worktree, `a` toggle all repos, `f` fullscreen, `q`/`Esc` close).
- **Global `/ws` Slash Command & Searchable Switcher (`Ctrl+Shift+W`)**
  - `/ws` — Open searchable worktree/session switcher (`Ctrl+N` new worktree, `Ctrl+S` new session, `Ctrl+O` open editor, `Ctrl+X` remove worktree, `Ctrl+A` all repos).
  - `/ws open [editor]` — Open active worktree in your preferred editor (persists `[editor]` when specified, e.g. `/ws open zed` or `/ws open nvim`).
  - `/ws editor` — Pick and save your preferred GUI or terminal editor.
  - `/ws 1` .. `/ws 9` — Instant jump to numbered worktree slot.
  - `/ws panel` — Toggle the interactive right-pane manager.
  - `/ws new [branch]` — Create a new Git worktree in the current repository and open a session inside it.
  - `/ws session` — Start a fresh session in the current worktree directory.
  - `/ws pin` — Pin or unpin the current repository.
  - `/ws all` — Toggle showing all Git repositories vs. current repository only.
  - `/ws refresh` — Force-sync worktrees and Git status.

## Installation

### 1. Register the plugin in `~/.config/opencode/opencode.json`

> **Important:** Registering in `opencode.json` loads **both** the server plugin (`src/index.ts`, which powers `↑ahead`/`↓behind` counts and `git worktree` discovery via `WorkspacesRpc`) and the TUI plugin (`src/tui.tsx`). Registering only in `cli.json` loads the TUI in fallback mode without `↑`/`↓` tracking counts.

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
        "openEditorKey": "ctrl+alt+o",
        "editor": "zed",
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

## Keyboard Shortcuts (Inside `Ctrl+G` Right Panel)

| Key | Action |
| --- | --- |
| `j` / `k` or `↓` / `↑` | Move selection cursor |
| `g` / `G` | Jump to first / last item |
| `Enter` / `l` / `→` | Open selected worktree or session (or expand project) |
| `Space` / `h` / `←` | Collapse / expand project |
| `o` | Open selected worktree in preferred editor |
| `1` – `9` | Instant jump to worktree quick-slot `1`–`9` |
| `n` | Create a new Git worktree + open a session in it |
| `s` | Create a new session in the selected worktree |
| `m` | Move the current session into the selected worktree |
| `p` | Pin / unpin repository (`★`) |
| `x` / `d` | Remove secondary Git worktree (with confirmation) |
| `a` / `i` | Toggle showing all Git repositories |
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

- `src/model.ts` — Pure workspace tree builder, status aggregation (`blocked > working > idle`), longest-prefix worktree matcher, `git` porcelain parsers, marquee math, and editor command parser.
- `src/rpc.ts` — Portable `@opencode/plugin/rpc` contract (`WorkspacesRpc`) validated with Standard Schema v1.
- `src/index.ts` — Server plugin registering `WorkspacesRpc.inspectLocations` (root-deduplicated `git worktree list`, non-locking cached `git status`, selective cache invalidation).
- `src/tui.tsx` & `src/tui/*` — Modular Solid/OpenTUI client (`state.ts`, `sidebar.tsx`, `switcher-dialog.tsx`, `panel.tsx`, `editor.ts`, `hover.ts`, `marquee.tsx`).

/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import {
  TextAttributes,
  type BoxRenderable,
  type KeyEvent,
} from "@opentui/core"
import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import {
  DEFAULT_PREFERENCES,
  type AgentStatus,
  type AgentStatusDetail,
  type FlatTreeRow,
  type GitSummary,
  type ProjectNode,
  type SessionRuntimeState,
  type WorkspacePreferences,
  type WorkspaceSessionNode,
  type WorkspaceTreeResult,
  type WorktreeNode,
  buildWorkspaceTree,
  dirBasename,
  normalizeDir,
} from "./model.js"
import { WorkspacesRpc } from "./rpc.js"

const PANEL_NAME = "opencode-workspaces.panel"

interface EphemeralWorkspaceCache {
  worktreesByProject: Record<string, string[]>
  gitByDirectory: Record<string, GitSummary>
  lastSyncedAt: number
}

type SelectItemValue =
  | {
      readonly type: "worktree"
      readonly projectID: string
      readonly projectName: string
      readonly canonical: string
      readonly directory: string
      readonly primarySessionID?: string
    }
  | {
      readonly type: "session"
      readonly projectID: string
      readonly projectName: string
      readonly canonical: string
      readonly directory: string
      readonly sessionID: string
    }

function statusGlyph(status: AgentStatus, isCurrent: boolean): string {
  if (status === "blocked") return "!"
  if (status === "working") return "●"
  if (isCurrent) return "▸"
  return "·"
}

function statusLabel(
  status: AgentStatus,
  detail?: AgentStatusDetail,
): string | undefined {
  if (status === "blocked") {
    return detail === "permission" ? "perm" : "ask"
  }
  if (status === "working") return "busy"
  return undefined
}

export default Plugin.define({
  id: "opencode-workspaces",
  setup(context) {
    const toggleKey =
      typeof context.options.toggleKey === "string"
        ? context.options.toggleKey
        : "ctrl+g"
    const switcherKey =
      typeof context.options.switcherKey === "string"
        ? context.options.switcherKey
        : "ctrl+shift+w"
    const defaultMaxRecent =
      typeof context.options.maxRecentProjects === "number"
        ? context.options.maxRecentProjects
        : DEFAULT_PREFERENCES.maxRecentProjects

    const [prefs, setPrefs] = context.storage.store<WorkspacePreferences>(
      "preferences",
      {
        initial: {
          ...DEFAULT_PREFERENCES,
          maxRecentProjects: defaultMaxRecent,
        },
      },
    )

    const [cache, setCache] = context.storage.memory<EphemeralWorkspaceCache>(
      "runtime-cache",
      {
        initial: {
          worktreesByProject: {},
          gitByDirectory: {},
          lastSyncedAt: 0,
        },
      },
    )

    let disposed = false
    let syncInFlight = false
    let syncQueued = false

    const resolveActiveSessionID = (explicitSessionID?: string): string | undefined => {
      if (explicitSessionID) return context.data.session.root(explicitSessionID)
      const route = context.ui.router.current()
      if (route.type === "session") {
        return context.data.session.root(route.sessionID)
      }
      return undefined
    }

    const resolveActiveDirectory = (activeSessionID?: string): string | undefined => {
      if (activeSessionID) {
        const session = context.data.session.get(activeSessionID)
        if (session?.location.directory) {
          return normalizeDir(session.location.directory)
        }
      }
      if (context.location?.directory) {
        return normalizeDir(context.location.directory)
      }
      const def = context.data.location.default()
      return def?.directory ? normalizeDir(def.directory) : undefined
    }

    const collectSessionRuntime = (
      sessions: ReturnType<Plugin.Context["data"]["session"]["list"]>,
    ): Record<string, SessionRuntimeState> => {
      const runtime: Record<string, SessionRuntimeState> = {}
      // Map child subagent activity up to its root session so background subagents also show busy/blocked
      for (const s of sessions) {
        if (s.time.archived) continue
        const rootID = s.parentID ? context.data.session.root(s.id) : s.id
        const isRunning = context.data.session.status(s.id) === "running"
        const perms = context.data.session.permission.list(s.id)?.length ?? 0
        const forms = context.data.session.form.list(s.id)?.length ?? 0

        const existing = runtime[rootID]
        if (existing) {
          runtime[rootID] = {
            running: existing.running || isRunning,
            permissionsCount: existing.permissionsCount + perms,
            formsCount: existing.formsCount + forms,
          }
        } else {
          runtime[rootID] = {
            running: isRunning,
            permissionsCount: perms,
            formsCount: forms,
          }
        }
      }
      return runtime
    }

    const buildSnapshot = (
      explicitSessionID?: string,
      includeSessionRows = true,
    ): WorkspaceTreeResult => {
      const projects = context.data.project.list()
      const sessions = context.data.session.list()
      const currentSessionID = resolveActiveSessionID(explicitSessionID)
      const currentDirectory = resolveActiveDirectory(currentSessionID)
      const sessionRuntime = collectSessionRuntime(sessions)

      // Merge live VCS info from OpenCode's reactive location store as fallback when RPC hasn't populated yet
      const mergedGit: Record<string, GitSummary> = { ...cache.gitByDirectory }
      if (currentDirectory && !mergedGit[currentDirectory]) {
        const vcs = context.data.location.vcs.info({ directory: currentDirectory })
        if (vcs?.branch.current) {
          mergedGit[currentDirectory] = {
            branch: vcs.branch.current,
            dirtyCount: 0,
            ahead: 0,
            behind: 0,
          }
        }
      }

      return buildWorkspaceTree({
        projects,
        sessions,
        sessionRuntime,
        worktreesByProject: cache.worktreesByProject,
        gitByDirectory: mergedGit,
        prefs,
        currentSessionID,
        currentDirectory,
        includeSessionRows,
      })
    }

    const inspectDirectoriesFallback = async (
      directories: readonly string[],
    ): Promise<Record<string, GitSummary>> => {
      const out: Record<string, GitSummary> = {}
      const activeDir = resolveActiveDirectory()
      const targets = activeDir
        ? directories.filter((d) => normalizeDir(d) === activeDir)
        : []
      for (const dir of targets) {
        try {
          const [vcsRes, statusRes] = await Promise.all([
            context.client.vcs.get({ location: { directory: dir } }),
            context.client.vcs.status({ location: { directory: dir } }),
          ])
          out[normalizeDir(dir)] = {
            branch: vcsRes.data.branch.current,
            dirtyCount: statusRes.data.length,
            ahead: 0,
            behind: 0,
          }
        } catch {
          // Ignore directories without VCS
        }
      }
      return out
    }

    const refreshWorkspacesData = async () => {
      if (disposed) return
      if (syncInFlight) {
        syncQueued = true
        return
      }
      syncInFlight = true
      try {
        await context.data.project.sync().catch(() => {})
        const snap = buildSnapshot()
        const targetProjects = snap.projects

        const wtEntries = await Promise.all(
          targetProjects.map(async (proj) => {
            try {
              const list = await context.client.worktree.list({ projectID: proj.id })
              const dirs = Array.isArray(list)
                ? list.map((item) => normalizeDir(item.directory)).filter(Boolean)
                : []
              return [proj.id, dirs] as const
            } catch {
              return [proj.id, cache.worktreesByProject[proj.id] ?? []] as const
            }
          }),
        )

        if (disposed) return

        const nextWorktrees: Record<string, string[]> = {
          ...cache.worktreesByProject,
        }
        const dirSet = new Set<string>()
        for (const proj of targetProjects) {
          dirSet.add(proj.canonical)
          for (const wt of proj.worktrees) {
            dirSet.add(wt.directory)
          }
        }
        for (const [projectID, dirs] of wtEntries) {
          nextWorktrees[projectID] = dirs
          for (const d of dirs) dirSet.add(d)
        }

        const allDirs = Array.from(dirSet)
        let gitSummaries: Record<string, GitSummary> = {}

        if (allDirs.length > 0) {
          try {
            const rpcClient = context.client.rpc(WorkspacesRpc)
            const res = await rpcClient.inspectLocations(
              { directories: allDirs },
              context.location ? { location: context.location } : undefined,
            )
            gitSummaries = { ...res.summaries }
          } catch {
            gitSummaries = await inspectDirectoriesFallback(allDirs)
          }
        }

        if (disposed) return

        setCache((draft) => {
          draft.worktreesByProject = nextWorktrees
          draft.gitByDirectory = {
            ...draft.gitByDirectory,
            ...gitSummaries,
          }
          draft.lastSyncedAt = Date.now()
        })
      } finally {
        syncInFlight = false
        if (syncQueued && !disposed) {
          syncQueued = false
          void refreshWorkspacesData()
        }
      }
    }

    let refreshDebounce: ReturnType<typeof setTimeout> | undefined
    const scheduleRefresh = (delayMs = 250) => {
      if (disposed) return
      if (refreshDebounce) clearTimeout(refreshDebounce)
      refreshDebounce = setTimeout(() => {
        refreshDebounce = undefined
        void refreshWorkspacesData()
      }, delayMs)
    }

    // Initial sync + reactive event listeners
    scheduleRefresh(50)

    const cleanups: Array<() => void> = []

    cleanups.push(
      context.data.on("worktree.updated", () => scheduleRefresh(100)),
      context.data.on("vcs.branch.updated", () => scheduleRefresh(150)),
      context.data.on("project.updated", () => scheduleRefresh(200)),
      context.data.on("session.created", () => scheduleRefresh(200)),
      context.data.on("session.moved", () => scheduleRefresh(150)),
    )

    try {
      const stopRpcEvents = context.client
        .rpc(WorkspacesRpc)
        .events.on("updated", () => {
          scheduleRefresh(150)
        })
      cleanups.push(stopRpcEvents)
    } catch {
      // RPC event stream optional when connected to remote servers without server plugin
    }

    const pollInterval = setInterval(() => {
      scheduleRefresh(0)
    }, 15_000)
    cleanups.push(() => clearInterval(pollInterval))

    // --- Navigation & Workspace Actions ---

    const activateSession = (sessionID: string) => {
      if (context.ui.tabs.enabled()) {
        context.ui.tabs.focus(sessionID)
      }
      context.ui.router.navigate({ type: "session", sessionID })
    }

    const createSessionInDirectory = async (
      directory: string,
      announceLabel?: string,
    ) => {
      try {
        const created = await context.client.session.create({
          location: { directory },
        })
        await context.data.session.sync(created.id).catch(() => {})
        activateSession(created.id)
        if (announceLabel) {
          context.ui.toast.show({
            message: announceLabel,
            variant: "success",
            duration: 2200,
          })
        }
      } catch (err) {
        context.ui.toast.show({
          title: "Failed to start session",
          message: err instanceof Error ? err.message : String(err),
          variant: "error",
        })
      }
    }

    const openWorktree = async (
      directory: string,
      preferredSessionID?: string,
    ) => {
      if (preferredSessionID) {
        activateSession(preferredSessionID)
        return
      }
      await createSessionInDirectory(
        directory,
        `Opened new session in ${dirBasename(directory)}`,
      )
    }

    const toggleCollapseProject = (projectID: string) => {
      void setPrefs((draft) => {
        const idx = draft.collapsedProjects.indexOf(projectID)
        if (idx >= 0) {
          draft.collapsedProjects.splice(idx, 1)
        } else {
          draft.collapsedProjects.push(projectID)
        }
      })
    }

    const togglePinProject = async (project: {
      id: string
      name: string
      canonical: string
    }) => {
      const normCanonical = normalizeDir(project.canonical)
      let nowPinned = false
      await setPrefs((draft) => {
        const existingIdx = draft.pinnedProjects.findIndex(
          (entry) =>
            entry === project.id || normalizeDir(entry) === normCanonical,
        )
        if (existingIdx >= 0) {
          draft.pinnedProjects.splice(existingIdx, 1)
          nowPinned = false
        } else {
          draft.pinnedProjects.push(normCanonical)
          nowPinned = true
        }
      })
      context.ui.toast.show({
        message: nowPinned
          ? `Pinned ${project.name} to top of Workspaces`
          : `Unpinned ${project.name}`,
        variant: "info",
        duration: 1800,
      })
    }

    const toggleIdleFilter = async () => {
      let nextValue = true
      await setPrefs((draft) => {
        draft.showIdleProjects = !draft.showIdleProjects
        nextValue = draft.showIdleProjects
      })
      context.ui.toast.show({
        message: nextValue
          ? "Showing recent & idle projects"
          : "Hiding unpinned idle projects",
        variant: "info",
        duration: 1800,
      })
    }

    const createWorktreeFlow = async (
      project: { id: string; name: string; canonical: string },
      initialBranch?: string,
    ) => {
      const rawInput =
        initialBranch?.trim() ||
        (
          await context.ui.dialog.prompt({
            title: `New Git Worktree — ${project.name}`,
            description:
              "Enter a branch name to create an isolated Git worktree and open a session in it.",
            placeholder: "feat/workspace-sidebar",
          })
        )?.trim()

      if (!rawInput) return

      const safeName = rawInput
        .replace(/^refs\/heads\//, "")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")

      context.ui.toast.show({
        message: `Creating worktree "${rawInput}"...`,
        variant: "info",
        duration: 2000,
      })

      try {
        const createdWt = await context.client.worktree.create({
          projectID: project.id,
          branch: rawInput,
          name: safeName || undefined,
        })
        await refreshWorkspacesData()
        await createSessionInDirectory(
          createdWt.directory,
          `Switched to worktree ${dirBasename(createdWt.directory)} (${rawInput})`,
        )
      } catch (err) {
        context.ui.toast.show({
          title: "Worktree creation failed",
          message: err instanceof Error ? err.message : String(err),
          variant: "error",
        })
      }
    }

    const removeWorktreeFlow = async (
      project: ProjectNode,
      worktree: WorktreeNode,
    ) => {
      if (worktree.isCanonical) {
        context.ui.toast.show({
          message: "Primary project root cannot be removed as a worktree",
          variant: "warning",
        })
        return
      }

      const confirmed = await context.ui.dialog.confirm({
        title: "Remove Git Worktree",
        message: `Remove worktree "${worktree.label}" at ${context.ui.format.path(worktree.directory)}?`,
        label: { confirm: "Remove", cancel: "Cancel" },
      })
      if (!confirmed) return

      try {
        await context.client.worktree.remove({
          projectID: project.id,
          directory: worktree.directory,
          force: false,
        })
        await refreshWorkspacesData()
        context.ui.toast.show({
          message: `Removed worktree ${worktree.label}`,
          variant: "success",
        })
      } catch (err) {
        const forceConfirmed = await context.ui.dialog.confirm({
          title: "Worktree Has Uncommitted Changes",
          message: `${err instanceof Error ? err.message : String(err)}\n\nForce remove "${worktree.label}" anyway?`,
          label: { confirm: "Force Remove", cancel: "Keep" },
        })
        if (!forceConfirmed) return
        try {
          await context.client.worktree.remove({
            projectID: project.id,
            directory: worktree.directory,
            force: true,
          })
          await refreshWorkspacesData()
          context.ui.toast.show({
            message: `Force-removed worktree ${worktree.label}`,
            variant: "warning",
          })
        } catch (forceErr) {
          context.ui.toast.show({
            title: "Failed to remove worktree",
            message:
              forceErr instanceof Error ? forceErr.message : String(forceErr),
            variant: "error",
          })
        }
      }
    }

    const moveCurrentSessionToDirectory = async (
      targetDirectory: string,
      explicitSessionID?: string,
    ) => {
      const activeID = resolveActiveSessionID(explicitSessionID)
      if (!activeID) {
        context.ui.toast.show({
          message: "Open a session first before moving it to another worktree",
          variant: "warning",
        })
        return
      }
      try {
        await context.client.session.move({
          sessionID: activeID,
          directory: targetDirectory,
        })
        await context.data.session.sync(activeID).catch(() => {})
        scheduleRefresh(100)
        context.ui.toast.show({
          message: `Moved session to ${dirBasename(targetDirectory)}`,
          variant: "success",
        })
      } catch (err) {
        context.ui.toast.show({
          title: "Failed to move session",
          message: err instanceof Error ? err.message : String(err),
          variant: "error",
        })
      }
    }

    const jumpToQuickSlot = async (slot: number) => {
      const snap = buildSnapshot()
      const target = snap.quickSlots.get(slot)
      if (!target) {
        context.ui.toast.show({
          message: `No workspace assigned to slot [${slot}]`,
          variant: "warning",
          duration: 1600,
        })
        return
      }
      await openWorktree(target.directory, target.primarySessionID)
    }

    const openWorkspaceSwitcherDialog = async () => {
      await refreshWorkspacesData().catch(() => {})
      const snap = buildSnapshot()

      const options: Array<{
        title: string
        value: SelectItemValue
        description?: string
        footer?: string
        category?: string
      }> = []

      let currentOption: SelectItemValue | undefined

      for (const project of snap.projects) {
        const category = `${project.pinned ? "★ " : ""}${project.name}`
        for (const wt of project.worktrees) {
          const slotPrefix = wt.quickSlot ? `[${wt.quickSlot}] ` : ""
          const statusPrefix =
            wt.status === "blocked"
              ? "! "
              : wt.status === "working"
                ? "● "
                : ""
          const branchInfo =
            wt.branch && wt.branch !== wt.label ? ` (${wt.branch})` : ""
          const dirtyInfo = wt.dirtyCount > 0 ? ` *${wt.dirtyCount}` : ""
          const wtValue: SelectItemValue = {
            type: "worktree",
            projectID: project.id,
            projectName: project.name,
            canonical: project.canonical,
            directory: wt.directory,
            primarySessionID: wt.primarySessionID,
          }
          if (wt.isCurrent && !currentOption) {
            currentOption = wtValue
          }
          options.push({
            title: `${slotPrefix}${statusPrefix}${wt.label}${branchInfo}${dirtyInfo}`,
            description:
              wt.sessions.length > 0
                ? `${wt.sessions.length} session${wt.sessions.length === 1 ? "" : "s"} — ${context.ui.format.path(wt.directory)}`
                : `New session in ${context.ui.format.path(wt.directory)}`,
            footer: statusLabel(wt.status, wt.statusDetail) ?? "worktree",
            category,
            value: wtValue,
          })

          for (const session of wt.sessions) {
            const sessVal: SelectItemValue = {
              type: "session",
              projectID: project.id,
              projectName: project.name,
              canonical: project.canonical,
              directory: wt.directory,
              sessionID: session.id,
            }
            if (session.isCurrent) {
              currentOption = sessVal
            }
            const badge = statusLabel(session.status, session.statusDetail)
            options.push({
              title: `  ↳ ${statusGlyph(session.status, session.isCurrent)} ${session.title}`,
              description: `${wt.label}${dirtyInfo}`,
              footer: badge ?? "session",
              category,
              value: sessVal,
            })
          }
        }
      }

      const chosen = await context.ui.dialog.select<SelectItemValue>({
        title: "Workspaces & Worktrees",
        placeholder: "Filter projects, branches, worktrees, or sessions...",
        options,
        current: currentOption,
        actions: [
          {
            bind: "ctrl+n",
            title: "new worktree",
            selection: "required",
            onTrigger: (val) => {
              context.ui.dialog.clear()
              void createWorktreeFlow({
                id: val.projectID,
                name: val.projectName,
                canonical: val.canonical,
              })
            },
          },
          {
            bind: "ctrl+s",
            title: "new session",
            selection: "required",
            onTrigger: (val) => {
              context.ui.dialog.clear()
              void createSessionInDirectory(
                val.directory,
                `Started new session in ${dirBasename(val.directory)}`,
              )
            },
          },
          {
            bind: "ctrl+p",
            title: "pin/unpin",
            selection: "required",
            onTrigger: (val) => {
              void togglePinProject({
                id: val.projectID,
                name: val.projectName,
                canonical: val.canonical,
              })
            },
          },
        ],
      })

      if (!chosen) return
      if (chosen.type === "session") {
        activateSession(chosen.sessionID)
      } else {
        await openWorktree(chosen.directory, chosen.primarySessionID)
      }
    }

    const toggleWorkspacesPanel = () => {
      const route = context.ui.router.current()
      if (route.type !== "session") {
        void openWorkspaceSwitcherDialog()
        return
      }
      const activePanel = context.ui.panel.current()
      if (activePanel?.name === PANEL_NAME) {
        context.ui.panel.close()
      } else {
        scheduleRefresh(0)
        const opened = context.ui.panel.open(PANEL_NAME)
        if (!opened) {
          void openWorkspaceSwitcherDialog()
        }
      }
    }

    const findCurrentProject = ():
      | { id: string; name: string; canonical: string }
      | undefined => {
      const snap = buildSnapshot()
      const current = snap.projects.find((p) => p.isCurrent) ?? snap.projects[0]
      if (!current) return undefined
      return {
        id: current.id,
        name: current.name,
        canonical: current.canonical,
      }
    }

    const handleSlashWs = async (rawArgs?: string) => {
      const trimmed = (rawArgs ?? "").trim()
      // Strip leading `/ws` or `/workspaces` if raw prompt text is passed when `arguments: true`
      const argsText = trimmed
        .replace(/^\/(?:ws|workspaces)\b\s*/i, "")
        .trim()

      if (!argsText) {
        await openWorkspaceSwitcherDialog()
        return
      }

      const [sub, ...rest] = argsText.split(/\s+/)
      const restJoined = rest.join(" ").trim()

      if (/^[1-9]$/.test(sub!)) {
        await jumpToQuickSlot(Number.parseInt(sub!, 10))
        return
      }

      switch (sub!.toLowerCase()) {
        case "panel":
        case "pane":
        case "right":
          toggleWorkspacesPanel()
          return
        case "new":
        case "wt":
        case "worktree": {
          const proj = findCurrentProject()
          if (!proj) {
            context.ui.toast.show({
              message: "No active project found to create a worktree in",
              variant: "warning",
            })
            return
          }
          await createWorktreeFlow(proj, restJoined || undefined)
          return
        }
        case "session":
        case "s": {
          const dir = resolveActiveDirectory()
          if (!dir) {
            context.ui.toast.show({
              message: "No active workspace directory found",
              variant: "warning",
            })
            return
          }
          await createSessionInDirectory(
            dir,
            `Started new session in ${dirBasename(dir)}`,
          )
          return
        }
        case "pin": {
          const proj = findCurrentProject()
          if (proj) await togglePinProject(proj)
          return
        }
        case "filter":
        case "idle":
          await toggleIdleFilter()
          return
        case "refresh":
        case "sync":
          await refreshWorkspacesData()
          context.ui.toast.show({
            message: "Refreshed workspaces & Git worktrees",
            variant: "success",
            duration: 1500,
          })
          return
        default:
          await openWorkspaceSwitcherDialog()
      }
    }

    // --- Register Global Keymaps & Slash Commands ---

    const quickJumpCommands = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((slot) => ({
      id: `workspaces.jump.${slot}`,
      title: `Workspaces: Jump to Slot ${slot}`,
      group: "Workspaces",
      run: () => jumpToQuickSlot(slot),
    }))

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "workspaces.panel.toggle",
          title: "Workspaces: Toggle Right Panel",
          description:
            "Open or close the interactive Workspaces & Git Worktrees right pane",
          group: "Workspaces",
          bind: toggleKey,
          palette: true,
          suggested: true,
          run: () => {
            toggleWorkspacesPanel()
          },
        },
        {
          id: "workspaces.switcher",
          title: "Workspaces: Switch Workspace / Worktree",
          description:
            "Search and switch across pinned projects, Git worktrees, and sessions (/ws [1-9|new|panel|pin])",
          group: "Workspaces",
          bind: switcherKey,
          palette: true,
          slash: {
            name: "ws",
            aliases: ["workspaces"],
            arguments: true,
          },
          run: (input) => handleSlashWs(input),
        },
        {
          id: "workspaces.worktree.new",
          title: "Workspaces: New Git Worktree",
          description:
            "Create a new Git worktree in the current project and start a session in it",
          group: "Workspaces",
          palette: true,
          run: async () => {
            const proj = findCurrentProject()
            if (proj) await createWorktreeFlow(proj)
          },
        },
        {
          id: "workspaces.project.pin",
          title: "Workspaces: Pin / Unpin Current Project",
          group: "Workspaces",
          palette: true,
          run: async () => {
            const proj = findCurrentProject()
            if (proj) await togglePinProject(proj)
          },
        },
        ...quickJumpCommands,
      ],
    }))

    // --- UI Components ---

    const statusColor = (status: AgentStatus, isCurrent: boolean) => {
      if (status === "blocked") return context.theme.text.feedback.warning.base
      if (status === "working") return context.theme.text.feedback.info.base
      if (isCurrent) return context.theme.text.feedback.success.base
      return context.theme.text.faint
    }

    const WorkspacesSidebar = (props: { readonly sessionID: string }) => {
      const tree = createMemo(() =>
        buildSnapshot(props.sessionID, prefs.showSessionsInSidebar),
      )

      return (
        <box
          flexDirection="column"
          width="100%"
          paddingBottom={1}
          marginBottom={1}
          border={["bottom"]}
          borderColor={context.theme.border.base}
          rowGap={0}
        >
          {/* Header Row */}
          <box
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
            paddingBottom={1}
            onMouseUp={() => toggleWorkspacesPanel()}
          >
            <box flexDirection="row" columnGap={1} alignItems="center">
              <text
                fg={context.theme.text.base}
                attributes={TextAttributes.BOLD}
                wrapMode="none"
              >
                WORKSPACES
              </text>
              <Show when={tree().summary.blockedSessions > 0}>
                <text
                  fg={context.theme.text.feedback.warning.base}
                  attributes={TextAttributes.BOLD}
                  wrapMode="none"
                >
                  !{tree().summary.blockedSessions}
                </text>
              </Show>
              <Show when={tree().summary.workingSessions > 0}>
                <text
                  fg={context.theme.text.feedback.info.base}
                  attributes={TextAttributes.BOLD}
                  wrapMode="none"
                >
                  ●{tree().summary.workingSessions}
                </text>
              </Show>
            </box>
            <text fg={context.theme.text.faint} wrapMode="none">
              ^G
            </text>
          </box>

          {/* Empty Fallback */}
          <Show
            when={tree().projects.length > 0}
            fallback={
              <text fg={context.theme.text.muted} wrapMode="word">
                No workspaces yet. Run /ws new to create a Git worktree.
              </text>
            }
          >
            <For each={tree().projects}>
              {(project) => (
                <box flexDirection="column" width="100%">
                  {/* Level 1: Project Header */}
                  <box
                    flexDirection="row"
                    justifyContent="space-between"
                    alignItems="center"
                    width="100%"
                    onMouseUp={() => toggleCollapseProject(project.id)}
                  >
                    <box
                      flexDirection="row"
                      columnGap={1}
                      flexGrow={1}
                      flexShrink={1}
                      overflow="hidden"
                    >
                      <text fg={context.theme.text.muted} wrapMode="none">
                        {project.collapsed ? "▸" : "▾"}
                      </text>
                      <Show when={project.pinned}>
                        <text
                          fg={context.theme.text.feedback.warning.base}
                          wrapMode="none"
                        >
                          ★
                        </text>
                      </Show>
                      <text
                        fg={
                          project.isCurrent
                            ? context.theme.text.base
                            : context.theme.text.muted
                        }
                        attributes={
                          project.isCurrent
                            ? TextAttributes.BOLD
                            : TextAttributes.NONE
                        }
                        wrapMode="none"
                        truncate
                        flexShrink={1}
                      >
                        {project.name}
                      </text>
                    </box>

                    <box flexDirection="row" columnGap={1} flexShrink={0}>
                      <Show
                        when={project.collapsed && project.status !== "idle"}
                      >
                        <text
                          fg={statusColor(project.status, project.isCurrent)}
                          attributes={TextAttributes.BOLD}
                          wrapMode="none"
                        >
                          {statusGlyph(project.status, false)}
                        </text>
                      </Show>
                      <Show when={project.worktrees.length > 1}>
                        <text fg={context.theme.text.faint} wrapMode="none">
                          {project.worktrees.length}wt
                        </text>
                      </Show>
                    </box>
                  </box>

                  {/* Level 2: Worktrees & Active Sessions */}
                  <Show when={!project.collapsed}>
                    <For each={project.worktrees}>
                      {(wt) => (
                        <box flexDirection="column" width="100%">
                          <box
                            flexDirection="row"
                            justifyContent="space-between"
                            alignItems="center"
                            width="100%"
                            paddingLeft={1}
                            paddingRight={1}
                            backgroundColor={
                              wt.isCurrent
                                ? context.theme.background.raised.high
                                : undefined
                            }
                            onMouseUp={() => {
                              void openWorktree(
                                wt.directory,
                                wt.primarySessionID,
                              )
                            }}
                          >
                            <box
                              flexDirection="row"
                              columnGap={1}
                              flexGrow={1}
                              flexShrink={1}
                              overflow="hidden"
                            >
                              <text
                                fg={
                                  wt.isCurrent
                                    ? context.theme.text.action.primary.base
                                    : context.theme.text.faint
                                }
                                wrapMode="none"
                              >
                                {wt.quickSlot ? `${wt.quickSlot}` : " "}
                              </text>
                              <text
                                fg={statusColor(wt.status, wt.isCurrent)}
                                attributes={
                                  wt.status !== "idle" || wt.isCurrent
                                    ? TextAttributes.BOLD
                                    : TextAttributes.NONE
                                }
                                wrapMode="none"
                              >
                                {statusGlyph(wt.status, wt.isCurrent)}
                              </text>
                              <text
                                fg={
                                  wt.isCurrent
                                    ? context.theme.text.base
                                    : context.theme.text.muted
                                }
                                attributes={
                                  wt.isCurrent
                                    ? TextAttributes.BOLD
                                    : TextAttributes.NONE
                                }
                                wrapMode="none"
                                truncate
                                flexShrink={1}
                              >
                                {wt.label}
                              </text>
                              <Show
                                when={
                                  !wt.isCanonical &&
                                  wt.branch &&
                                  wt.branch !== wt.label
                                }
                              >
                                <text
                                  fg={context.theme.text.faint}
                                  wrapMode="none"
                                  truncate
                                  flexShrink={1}
                                >
                                  ({wt.branch})
                                </text>
                              </Show>
                            </box>

                            <box
                              flexDirection="row"
                              columnGap={1}
                              flexShrink={0}
                            >
                              <Show when={wt.dirtyCount > 0}>
                                <text
                                  fg={context.theme.text.feedback.warning.base}
                                  wrapMode="none"
                                >
                                  *{wt.dirtyCount}
                                </text>
                              </Show>
                              <Show when={wt.ahead > 0}>
                                <text
                                  fg={context.theme.text.feedback.success.base}
                                  wrapMode="none"
                                >
                                  ↑{wt.ahead}
                                </text>
                              </Show>
                              <Show when={wt.behind > 0}>
                                <text
                                  fg={context.theme.text.faint}
                                  wrapMode="none"
                                >
                                  ↓{wt.behind}
                                </text>
                              </Show>
                            </box>
                          </box>

                          {/* Session sub-items when worktree has sessions */}
                          <Show
                            when={
                              prefs.showSessionsInSidebar &&
                              wt.sessions.length > 0
                            }
                          >
                            <For each={wt.sessions.slice(0, 4)}>
                              {(session) => (
                                <box
                                  flexDirection="row"
                                  justifyContent="space-between"
                                  alignItems="center"
                                  width="100%"
                                  paddingLeft={3}
                                  paddingRight={1}
                                  onMouseUp={() => activateSession(session.id)}
                                >
                                  <box
                                    flexDirection="row"
                                    columnGap={1}
                                    flexGrow={1}
                                    flexShrink={1}
                                    overflow="hidden"
                                  >
                                    <text
                                      fg={statusColor(
                                        session.status,
                                        session.isCurrent,
                                      )}
                                      attributes={
                                        session.status !== "idle"
                                          ? TextAttributes.BOLD
                                          : TextAttributes.NONE
                                      }
                                      wrapMode="none"
                                    >
                                      {session.isCurrent
                                        ? "▸"
                                        : statusGlyph(session.status, false)}
                                    </text>
                                    <text
                                      fg={
                                        session.isCurrent
                                          ? context.theme.text.base
                                          : context.theme.text.faint
                                      }
                                      wrapMode="none"
                                      truncate
                                      flexShrink={1}
                                    >
                                      {session.title}
                                    </text>
                                  </box>
                                  <Show
                                    when={statusLabel(
                                      session.status,
                                      session.statusDetail,
                                    )}
                                  >
                                    {(badge) => (
                                      <text
                                        fg={statusColor(
                                          session.status,
                                          session.isCurrent,
                                        )}
                                        wrapMode="none"
                                        flexShrink={0}
                                      >
                                        {badge()}
                                      </text>
                                    )}
                                  </Show>
                                </box>
                              )}
                            </For>
                          </Show>
                        </box>
                      )}
                    </For>
                  </Show>
                </box>
              )}
            </For>
          </Show>

          {/* Compact hint bar */}
          <box paddingTop={1} flexDirection="row" justifyContent="space-between">
            <text fg={context.theme.text.faint} wrapMode="none">
              /ws switch · /ws new
            </text>
            <text fg={context.theme.text.faint} wrapMode="none">
              1-9
            </text>
          </box>
        </box>
      )
    }

    const WorkspacesPanel = (props: {
      readonly panel: {
        readonly name: string
        readonly sessionID: string
        readonly width: number
        readonly presentation: "panel" | "fullscreen"
        readonly focused: boolean
        readonly focus: () => void
        readonly close: () => void
        readonly toggleFullscreen: () => void
      }
    }) => {
      let containerRef: BoxRenderable | undefined
      const tree = createMemo(() => buildSnapshot(props.panel.sessionID, true))
      const [selectedKey, setSelectedKey] = createSignal<string>("")

      // Keep cursor anchored to current session/worktree on initial open or if selected row disappears
      createEffect(() => {
        const rows = tree().rows
        if (rows.length === 0) return
        const currentKey = selectedKey()
        if (currentKey && rows.some((r) => r.key === currentKey)) return

        const activeRow =
          rows.find(
            (r) => r.kind === "session" && r.session.isCurrent,
          ) ??
          rows.find(
            (r) => r.kind === "worktree" && r.worktree.isCurrent,
          ) ??
          rows.find((r) => r.kind === "project" && r.project.isCurrent) ??
          rows[0]

        if (activeRow) setSelectedKey(activeRow.key)
      })

      createEffect(() => {
        if (props.panel.focused && containerRef) {
          containerRef.focus()
        }
      })

      const selectedRow = createMemo<FlatTreeRow | undefined>(() => {
        const rows = tree().rows
        const key = selectedKey()
        return rows.find((r) => r.key === key) ?? rows[0]
      })

      const moveCursor = (delta: number) => {
        const rows = tree().rows
        if (rows.length === 0) return
        const key = selectedKey()
        const idx = rows.findIndex((r) => r.key === key)
        const start = idx === -1 ? 0 : idx
        const nextIdx = Math.max(0, Math.min(rows.length - 1, start + delta))
        const target = rows[nextIdx]
        if (target) setSelectedKey(target.key)
      }

      const activateRow = (row: FlatTreeRow | undefined) => {
        if (!row) return
        if (row.kind === "project") {
          toggleCollapseProject(row.project.id)
          return
        }
        if (row.kind === "worktree") {
          void openWorktree(
            row.worktree.directory,
            row.worktree.primarySessionID,
          )
          return
        }
        activateSession(row.session.id)
      }

      const handleKeyDown = (event: KeyEvent) => {
        if (!props.panel.focused) return
        const rows = tree().rows
        const row = selectedRow()

        if (
          !event.ctrl &&
          !event.meta &&
          /^[1-9]$/.test(event.name)
        ) {
          event.preventDefault()
          event.stopPropagation()
          void jumpToQuickSlot(Number.parseInt(event.name, 10))
          return
        }

        switch (event.name) {
          case "j":
          case "down":
            event.preventDefault()
            event.stopPropagation()
            moveCursor(1)
            return
          case "k":
          case "up":
            event.preventDefault()
            event.stopPropagation()
            moveCursor(-1)
            return
          case "g":
            if (!event.ctrl) {
              event.preventDefault()
              event.stopPropagation()
              if (event.shift) {
                const last = rows[rows.length - 1]
                if (last) setSelectedKey(last.key)
              } else {
                const first = rows[0]
                if (first) setSelectedKey(first.key)
              }
            }
            return
          case "home": {
            event.preventDefault()
            event.stopPropagation()
            const first = rows[0]
            if (first) setSelectedKey(first.key)
            return
          }
          case "end": {
            event.preventDefault()
            event.stopPropagation()
            const last = rows[rows.length - 1]
            if (last) setSelectedKey(last.key)
            return
          }
          case "return":
          case "enter":
            event.preventDefault()
            event.stopPropagation()
            activateRow(row)
            return
          case "space":
            event.preventDefault()
            event.stopPropagation()
            if (row) toggleCollapseProject(row.project.id)
            return
          case "h":
          case "left":
            event.preventDefault()
            event.stopPropagation()
            if (row && !row.project.collapsed) {
              toggleCollapseProject(row.project.id)
              setSelectedKey(`project:${row.project.id}`)
            }
            return
          case "l":
          case "right":
            event.preventDefault()
            event.stopPropagation()
            if (row?.kind === "project" && row.project.collapsed) {
              toggleCollapseProject(row.project.id)
            } else {
              activateRow(row)
            }
            return
          case "n":
            event.preventDefault()
            event.stopPropagation()
            if (row) {
              void createWorktreeFlow({
                id: row.project.id,
                name: row.project.name,
                canonical: row.project.canonical,
              })
            }
            return
          case "s":
            event.preventDefault()
            event.stopPropagation()
            if (row) {
              const dir =
                row.kind === "project"
                  ? row.project.canonical
                  : row.worktree.directory
              void createSessionInDirectory(
                dir,
                `Started new session in ${dirBasename(dir)}`,
              )
            }
            return
          case "m":
            event.preventDefault()
            event.stopPropagation()
            if (row) {
              const dir =
                row.kind === "project"
                  ? row.project.canonical
                  : row.worktree.directory
              void moveCurrentSessionToDirectory(dir, props.panel.sessionID)
            }
            return
          case "p":
            event.preventDefault()
            event.stopPropagation()
            if (row) {
              void togglePinProject({
                id: row.project.id,
                name: row.project.name,
                canonical: row.project.canonical,
              })
            }
            return
          case "x":
          case "d":
            event.preventDefault()
            event.stopPropagation()
            if (row && row.kind === "worktree") {
              void removeWorktreeFlow(row.project, row.worktree)
            } else if (row && row.kind === "session") {
              void removeWorktreeFlow(row.project, row.worktree)
            }
            return
          case "i":
            event.preventDefault()
            event.stopPropagation()
            void toggleIdleFilter()
            return
          case "r":
            event.preventDefault()
            event.stopPropagation()
            void refreshWorkspacesData()
            context.ui.toast.show({
              message: "Refreshed workspaces",
              variant: "info",
              duration: 1200,
            })
            return
          case "f":
            event.preventDefault()
            event.stopPropagation()
            props.panel.toggleFullscreen()
            return
          case "q":
          case "escape":
            event.preventDefault()
            event.stopPropagation()
            props.panel.close()
            return
        }
      }

      const renderPanelRow = (row: FlatTreeRow) => {
        const isSelected = () => selectedRow()?.key === row.key

        if (row.kind === "project") {
          const p = row.project
          return (
            <box
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
              width="100%"
              paddingX={1}
              backgroundColor={
                isSelected()
                  ? context.theme.background.raised.high
                  : undefined
              }
              onMouseUp={() => {
                setSelectedKey(row.key)
                toggleCollapseProject(p.id)
              }}
            >
              <box
                flexDirection="row"
                columnGap={1}
                flexGrow={1}
                flexShrink={1}
                overflow="hidden"
              >
                <text
                  fg={
                    isSelected()
                      ? context.theme.text.action.primary.base
                      : context.theme.text.muted
                  }
                  wrapMode="none"
                >
                  {isSelected() ? "▌" : " "}
                  {p.collapsed ? "▸" : "▾"}
                </text>
                <Show when={p.pinned}>
                  <text
                    fg={context.theme.text.feedback.warning.base}
                    wrapMode="none"
                  >
                    ★
                  </text>
                </Show>
                <text
                  fg={context.theme.text.base}
                  attributes={TextAttributes.BOLD}
                  wrapMode="none"
                  truncate
                  flexShrink={1}
                >
                  {p.name}
                </text>
              </box>
              <text fg={context.theme.text.faint} wrapMode="none">
                {p.worktrees.length} wt · {p.totalSessions} sess
              </text>
            </box>
          )
        }

        if (row.kind === "worktree") {
          const wt = row.worktree
          return (
            <box
              flexDirection="column"
              width="100%"
              paddingLeft={2}
              paddingRight={1}
              backgroundColor={
                isSelected()
                  ? context.theme.background.raised.high
                  : undefined
              }
              onMouseUp={() => {
                setSelectedKey(row.key)
                void openWorktree(wt.directory, wt.primarySessionID)
              }}
            >
              <box
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
                width="100%"
              >
                <box
                  flexDirection="row"
                  columnGap={1}
                  flexGrow={1}
                  flexShrink={1}
                  overflow="hidden"
                >
                  <text
                    fg={
                      isSelected()
                        ? context.theme.text.action.primary.base
                        : context.theme.text.faint
                    }
                    wrapMode="none"
                  >
                    {wt.quickSlot ? `[${wt.quickSlot}]` : "   "}
                  </text>
                  <text
                    fg={statusColor(wt.status, wt.isCurrent)}
                    attributes={TextAttributes.BOLD}
                    wrapMode="none"
                  >
                    {statusGlyph(wt.status, wt.isCurrent)}
                  </text>
                  <text
                    fg={
                      wt.isCurrent
                        ? context.theme.text.base
                        : context.theme.text.muted
                    }
                    attributes={
                      wt.isCurrent
                        ? TextAttributes.BOLD
                        : TextAttributes.NONE
                    }
                    wrapMode="none"
                    truncate
                    flexShrink={1}
                  >
                    {wt.label}
                  </text>
                  <Show when={wt.branch && wt.branch !== wt.label}>
                    <text
                      fg={context.theme.text.faint}
                      wrapMode="none"
                      truncate
                      flexShrink={1}
                    >
                      ⎇ {wt.branch}
                    </text>
                  </Show>
                </box>

                <box flexDirection="row" columnGap={1} flexShrink={0}>
                  <Show when={wt.dirtyCount > 0}>
                    <text
                      fg={context.theme.text.feedback.warning.base}
                      wrapMode="none"
                    >
                      *{wt.dirtyCount}
                    </text>
                  </Show>
                  <Show when={wt.ahead > 0}>
                    <text
                      fg={context.theme.text.feedback.success.base}
                      wrapMode="none"
                    >
                      ↑{wt.ahead}
                    </text>
                  </Show>
                  <Show when={wt.behind > 0}>
                    <text fg={context.theme.text.faint} wrapMode="none">
                      ↓{wt.behind}
                    </text>
                  </Show>
                </box>
              </box>

              <Show when={isSelected()}>
                <box paddingLeft={4}>
                  <text
                    fg={context.theme.text.faint}
                    wrapMode="none"
                    truncate
                  >
                    {context.ui.format.path(wt.directory)}
                  </text>
                </box>
              </Show>
            </box>
          )
        }

        const s = row.session
        return (
          <box
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
            width="100%"
            paddingLeft={5}
            paddingRight={1}
            backgroundColor={
              isSelected() ? context.theme.background.raised.high : undefined
            }
            onMouseUp={() => {
              setSelectedKey(row.key)
              activateSession(s.id)
            }}
          >
            <box
              flexDirection="row"
              columnGap={1}
              flexGrow={1}
              flexShrink={1}
              overflow="hidden"
            >
              <text
                fg={statusColor(s.status, s.isCurrent)}
                attributes={
                  s.status !== "idle" || s.isCurrent
                    ? TextAttributes.BOLD
                    : TextAttributes.NONE
                }
                wrapMode="none"
              >
                {s.isCurrent ? "▸" : statusGlyph(s.status, false)}
              </text>
              <text
                fg={
                  s.isCurrent
                    ? context.theme.text.base
                    : context.theme.text.muted
                }
                wrapMode="none"
                truncate
                flexShrink={1}
              >
                {s.title}
              </text>
            </box>
            <Show when={statusLabel(s.status, s.statusDetail)}>
              {(badge) => (
                <text
                  fg={statusColor(s.status, s.isCurrent)}
                  attributes={TextAttributes.BOLD}
                  wrapMode="none"
                  flexShrink={0}
                >
                  [{badge()}]
                </text>
              )}
            </Show>
          </box>
        )
      }

      return (
        <box
          ref={(el) => {
            containerRef = el
          }}
          flexDirection="column"
          width="100%"
          height="100%"
          paddingY={1}
          focusable
          focused={props.panel.focused}
          onMouseDown={() => props.panel.focus()}
          onKeyDown={handleKeyDown}
        >
          {/* Panel Header */}
          <box
            flexDirection="row"
            justifyContent="space-between"
            alignItems="center"
            paddingX={1}
            paddingBottom={1}
            border={["bottom"]}
            borderColor={context.theme.border.base}
          >
            <box flexDirection="row" columnGap={1} alignItems="center">
              <text
                fg={context.theme.text.base}
                attributes={TextAttributes.BOLD}
                wrapMode="none"
              >
                WORKSPACES MANAGER
              </text>
              <Show when={!prefs.showIdleProjects}>
                <text
                  fg={context.theme.text.feedback.info.base}
                  wrapMode="none"
                >
                  [active/pinned]
                </text>
              </Show>
            </box>
            <text fg={context.theme.text.faint} wrapMode="none">
              {props.panel.focused ? "focused" : "click to focus"} · esc
            </text>
          </box>

          {/* Scrollable Tree */}
          <scrollbox flexGrow={1} paddingY={1}>
            <box flexDirection="column" width="100%">
              <For each={tree().rows}>{(row) => renderPanelRow(row)}</For>
            </box>
          </scrollbox>

          {/* Keyboard Footer Legend */}
          <box
            flexDirection="column"
            paddingX={1}
            paddingTop={1}
            border={["top"]}
            borderColor={context.theme.border.base}
          >
            <text fg={context.theme.text.muted} wrapMode="word">
              j/k move · ⏎ open · 1-9 jump · n new worktree · s new session
            </text>
            <text fg={context.theme.text.faint} wrapMode="word">
              p pin · m move current session · x remove wt · i filter · r sync
            </text>
          </box>
        </box>
      )
    }

    const HomeWorkspacesBadge = () => {
      const tree = createMemo(() => buildSnapshot(undefined, false))
      return (
        <Show when={tree().summary.totalWorktrees > 0}>
          <box
            flexDirection="row"
            columnGap={1}
            onMouseUp={() => {
              void openWorkspaceSwitcherDialog()
            }}
          >
            <text fg={context.theme.text.muted} wrapMode="none">
              ⎇ {tree().summary.totalWorktrees} ws
            </text>
            <Show when={tree().summary.blockedSessions > 0}>
              <text
                fg={context.theme.text.feedback.warning.base}
                attributes={TextAttributes.BOLD}
                wrapMode="none"
              >
                !{tree().summary.blockedSessions}
              </text>
            </Show>
            <Show when={tree().summary.workingSessions > 0}>
              <text
                fg={context.theme.text.feedback.info.base}
                wrapMode="none"
              >
                ●{tree().summary.workingSessions}
              </text>
            </Show>
          </box>
        </Show>
      )
    }

    // --- Claim Slots ---

    cleanups.push(
      context.ui.slot({
        prepend: "sidebar.content",
        render: ({ sessionID }) => <WorkspacesSidebar sessionID={sessionID} />,
      }),
      context.ui.slot({
        append: "session.panel",
        render: (panel) => (
          <Show when={panel.name === PANEL_NAME}>
            <WorkspacesPanel panel={panel} />
          </Show>
        ),
      }),
      context.ui.slot({
        append: "home.footer.status",
        render: () => <HomeWorkspacesBadge />,
      }),
    )

    return () => {
      disposed = true
      if (refreshDebounce) clearTimeout(refreshDebounce)
      for (const cleanup of cleanups) {
        try {
          cleanup()
        } catch {
          // Ignore individual teardown errors
        }
      }
    }
  },
})

import type { Plugin } from "@opencode/plugin/tui"
import { createSignal, untrack } from "solid-js"
import type { Store } from "solid-js/store"
import {
  DEFAULT_PREFERENCES,
  buildWorkspaceTree,
  dirBasename,
  isInvalidWorkspaceRoot,
  isSubpathOrSame,
  normalizeDir,
  parseEditorCommand,
  resolveWorkspaceNewSessionDirectory,
  type GitSummary,
  type GitWorktreeEntry,
  type ProjectNode,
  type SessionRuntimeState,
  type WorkspacePreferences,
  type WorkspaceSessionNode,
  type WorkspaceTreeResult,
  type WorktreeNode,
} from "../model.js"
import { WorkspacesRpc } from "../rpc.js"
import {
  launchParsedEditor,
  promptPreferredEditor,
  resolveConfiguredEditor,
  type EditorSpawner,
} from "./editor.js"
import type { EphemeralWorkspaceCache } from "./types.js"

const FALLBACK_DISCOVERY_TTL_MS = 15_000

export interface WorkspacesController {
  readonly context: Plugin.Context
  readonly prefs: Store<WorkspacePreferences>
  readonly cache: Store<EphemeralWorkspaceCache>
  readonly terminalHeight: () => number
  readonly selectedWorkspace: () =>
    | { readonly directory: string; readonly projectID?: string }
    | undefined
  readonly resolveActiveSessionID: (explicitSessionID?: string) => string | undefined
  readonly resolveActiveDirectory: (activeSessionID?: string) => string | undefined
  readonly syncSessionWorkspace: (sessionID: string | undefined) => void
  readonly buildSnapshot: (options?: {
    readonly explicitSessionID?: string
    readonly includeSessionRows?: boolean
    readonly currentProjectOnly?: boolean
    readonly onlyRelevantProjects?: boolean
  }) => WorkspaceTreeResult
  readonly refreshWorkspacesData: (options?: {
    readonly forceWorktreeRefresh?: boolean
    readonly includeAllProjects?: boolean
  }) => Promise<void>
  readonly scheduleRefresh: (delayMs?: number) => void
  readonly findCurrentProject: () =>
    | { id: string; name: string; canonical: string }
    | undefined
  readonly activateSession: (
    sessionID: string,
    directoryHint?: string,
    projectIDHint?: string,
  ) => void
  readonly createSessionInDirectory: (
    directory: string,
    announceLabel?: string,
    projectIDHint?: string,
  ) => Promise<void>
  readonly openWorktree: (
    directory: string,
    preferredSessionID?: string,
    projectIDHint?: string,
  ) => Promise<void>
  readonly toggleCollapseProject: (projectID: string) => void
  readonly isSidebarWorktreeExpanded: (directory: string) => boolean
  readonly toggleSidebarWorktree: (directory: string) => void
  readonly togglePinProject: (project: {
    id: string
    name: string
    canonical: string
  }) => Promise<void>
  readonly toggleShowAllGitProjects: () => Promise<void>
  readonly createWorktreeFlow: (
    project: { id: string; name: string; canonical: string },
    initialBranch?: string,
  ) => Promise<void>
  readonly removeWorktreeFlow: (
    project: ProjectNode,
    worktree: WorktreeNode,
  ) => Promise<void>
  readonly removeSessionFlow: (session: WorkspaceSessionNode) => Promise<void>
  readonly openSessionContextMenu: (
    session: WorkspaceSessionNode,
    worktreeDirectory: string,
    projectID: string,
  ) => Promise<void>
  readonly moveCurrentSessionToDirectory: (
    targetDirectory: string,
    explicitSessionID?: string,
    projectIDHint?: string,
  ) => Promise<void>
  readonly jumpToQuickSlot: (slot: number) => Promise<void>
  readonly openWorktreeInEditor: (
    targetDirectory?: string,
    explicitEditorArg?: string,
  ) => Promise<void>
  readonly choosePreferredEditor: () => Promise<string | undefined>
  readonly dispose: () => void
}

export function createWorkspacesController(
  context: Plugin.Context,
): WorkspacesController {
  const defaultMaxRecent =
    typeof context.options.maxRecentProjects === "number"
      ? context.options.maxRecentProjects
      : DEFAULT_PREFERENCES.maxRecentProjects

  const customEditorSpawner =
    typeof context.options.editorSpawner === "function"
      ? (context.options.editorSpawner as EditorSpawner)
      : undefined

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
        gitWorktreesByRoot: {},
        gitByDirectory: {},
        lastSyncedAt: 0,
      },
    },
  )

  // Heal ephemeral/persisted stores if hot-reloading over an older plugin generation
  if (
    !cache.worktreesByProject ||
    !cache.gitWorktreesByRoot ||
    !cache.gitByDirectory
  ) {
    setCache((draft) => {
      draft.worktreesByProject ??= {}
      draft.gitWorktreesByRoot ??= {}
      draft.gitByDirectory ??= {}
      draft.lastSyncedAt ??= 0
    })
  }
  if (
    !Array.isArray(prefs.pinnedProjects) ||
    !Array.isArray(prefs.collapsedProjects) ||
    !Array.isArray(prefs.expandedSidebarWorktrees) ||
    typeof prefs.showAllGitProjects !== "boolean"
  ) {
    void setPrefs((draft) => {
      if (!Array.isArray(draft.pinnedProjects)) draft.pinnedProjects = []
      if (!Array.isArray(draft.collapsedProjects)) draft.collapsedProjects = []
      if (!Array.isArray(draft.expandedSidebarWorktrees)) {
        draft.expandedSidebarWorktrees = []
      }
      if (typeof draft.showAllGitProjects !== "boolean") {
        draft.showAllGitProjects = false
      }
      if (typeof draft.maxRecentProjects !== "number") {
        draft.maxRecentProjects = defaultMaxRecent
      }
    }).catch(() => {})
  }

  let disposed = false
  let syncInFlight = false
  let syncQueued = false
  let lastRpcSucceeded = false
  let inventoryDiscoveryDirty = false
  let projectSyncInFlight = false
  const syncedLocationAt = new Map<string, number>()
  const inFlightLocationDirs = new Set<string>()
  const lastInventoryRefreshAt = new Map<string, number>()

  const [selectedWorkspace, setSelectedWorkspace] = createSignal<
    | {
        readonly directory: string
        readonly projectID?: string
      }
    | undefined
  >(undefined)
  const [deletedSessionIDs, setDeletedSessionIDs] = createSignal<
    ReadonlySet<string>
  >(new Set())

  const resolveLaunchDirectory = (): string | undefined => {
    if (context.location?.directory) {
      return normalizeDir(context.location.directory)
    }
    const def = context.data.location.default()
    return def?.directory ? normalizeDir(def.directory) : undefined
  }

  const inferProjectIDForDirectory = (dir: string): string | undefined => {
    const normDir = normalizeDir(dir)
    if (!normDir || isInvalidWorkspaceRoot(normDir)) return undefined
    let bestID: string | undefined
    let bestLen = -1
    for (const proj of context.data.project.list()) {
      if (proj.time.archived) continue
      const canon = normalizeDir(proj.canonical)
      const candidates = [
        canon,
        ...(proj.sandboxes ?? []),
        ...(cache.worktreesByProject?.[proj.id] ?? []),
        ...(canon
          ? (cache.gitWorktreesByRoot?.[canon]?.map((w) => w.directory) ?? [])
          : []),
      ]
      for (const raw of candidates) {
        const norm = normalizeDir(raw)
        if (norm && isSubpathOrSame(normDir, norm) && norm.length > bestLen) {
          bestLen = norm.length
          bestID = proj.id
        }
      }
    }
    return bestID
  }

  const ensureProjectSynced = (projectID?: string) => {
    if (!projectID || projectSyncInFlight) return
    if (context.data.project.get(projectID)) return
    projectSyncInFlight = true
    void context.data.project
      .sync()
      .catch(() => {})
      .finally(() => {
        projectSyncInFlight = false
      })
  }

  const ensureLocationSynced = (
    rawLocation:
      | { readonly directory: string; readonly subpath?: string }
      | undefined,
    projectIDHint?: string,
    options?: { readonly force?: boolean; readonly invalidate?: boolean },
  ) => {
    if (!rawLocation?.directory) return
    const norm = normalizeDir(rawLocation.directory)
    if (!norm || isInvalidWorkspaceRoot(norm)) return
    ensureProjectSynced(projectIDHint)

    const syncRef = rawLocation.subpath
      ? { directory: norm, subpath: rawLocation.subpath }
      : { directory: norm }

    if (options?.invalidate) {
      syncedLocationAt.delete(norm)
      try {
        context.data.location.invalidate(syncRef)
        context.data.location.vcs.invalidate(syncRef)
      } catch {
        // Ignore optional invalidate failures
      }
    }

    if (
      !options?.force &&
      (syncedLocationAt.has(norm) || inFlightLocationDirs.has(norm))
    ) {
      return
    }
    if (inFlightLocationDirs.has(norm)) return

    inFlightLocationDirs.add(norm)
    void Promise.all([
      context.data.location.sync(syncRef),
      context.data.location.vcs.sync(syncRef),
    ])
      .then(() => {
        inFlightLocationDirs.delete(norm)
        syncedLocationAt.set(norm, Date.now())
      })
      .catch(() => {
        inFlightLocationDirs.delete(norm)
        syncedLocationAt.delete(norm)
      })
  }

  const recordSelectedWorkspace = (
    directory: string | undefined,
    projectIDHint?: string,
  ) => {
    if (!directory) return
    const norm = normalizeDir(directory)
    if (!norm || isInvalidWorkspaceRoot(norm)) return
    const projectID = projectIDHint ?? inferProjectIDForDirectory(norm)
    const prev = selectedWorkspace()
    if (!prev || prev.directory !== norm || prev.projectID !== projectID) {
      setSelectedWorkspace({ directory: norm, projectID })
    }
    ensureLocationSynced({ directory: norm }, projectID)
  }

  const resolveActiveSessionID = (
    explicitSessionID?: string,
  ): string | undefined => {
    if (explicitSessionID) return context.data.session.root(explicitSessionID)
    const route = context.ui.router.current()
    if (route.type === "session") {
      return context.data.session.root(route.sessionID)
    }
    return undefined
  }

  const resolveActiveDirectory = (
    activeSessionID?: string,
  ): string | undefined => {
    const sid = activeSessionID ?? resolveActiveSessionID()
    const session = sid ? context.data.session.get(sid) : undefined
    return resolveWorkspaceNewSessionDirectory({
      activeSessionDirectory: session?.location.directory,
      selectedWorkspaceDirectory: selectedWorkspace()?.directory,
      launchDirectory: resolveLaunchDirectory(),
    })
  }

  const collectSessionRuntime = (
    sessions: ReturnType<Plugin.Context["data"]["session"]["list"]>,
    projectIDFilter?: ReadonlySet<string>,
  ): Record<string, SessionRuntimeState> => {
    const runtime: Record<string, SessionRuntimeState> = {}
    for (const s of sessions) {
      if (s.time.archived) continue
      if (projectIDFilter && !projectIDFilter.has(s.projectID)) continue
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

  const buildSnapshot = (options?: {
    readonly explicitSessionID?: string
    readonly includeSessionRows?: boolean
    readonly currentProjectOnly?: boolean
    readonly onlyRelevantProjects?: boolean
  }): WorkspaceTreeResult => {
    const projects = context.data.project.list()
    const deleted = deletedSessionIDs()
    const listedSessions = context.data.session
      .list()
      .filter((s) => !deleted.has(s.id))
    const rawCurrentSessionID = resolveActiveSessionID(
      options?.explicitSessionID,
    )
    const currentSessionID =
      rawCurrentSessionID && !deleted.has(rawCurrentSessionID)
        ? rawCurrentSessionID
        : undefined
    const currentDirectory = resolveActiveDirectory(currentSessionID)

    let sessions = listedSessions
    const activeDirect = currentSessionID
      ? listedSessions.find((s) => s.id === currentSessionID) ??
        context.data.session.get(currentSessionID)
      : undefined

    if (
      activeDirect &&
      !listedSessions.some((s) => s.id === activeDirect.id)
    ) {
      sessions = [activeDirect, ...listedSessions]
    }

    let runtimeProjectFilter: ReadonlySet<string> | undefined
    if (options?.currentProjectOnly) {
      const targetProjID =
        activeDirect?.projectID ??
        (currentDirectory
          ? inferProjectIDForDirectory(currentDirectory)
          : undefined)
      if (targetProjID) {
        runtimeProjectFilter = new Set([targetProjID])
      }
    }

    const sessionRuntime = collectSessionRuntime(sessions, runtimeProjectFilter)

    const mergedGit: Record<string, GitSummary> = {
      ...(cache.gitByDirectory ?? {}),
    }
    if (
      currentDirectory &&
      !isInvalidWorkspaceRoot(currentDirectory) &&
      !mergedGit[currentDirectory]
    ) {
      const vcs = context.data.location.vcs.info({
        directory: currentDirectory,
      })
      if (vcs?.branch.current || vcs?.provider) {
        mergedGit[currentDirectory] = {
          branch: vcs.branch.current || "detached",
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
      worktreesByProject: cache.worktreesByProject ?? {},
      gitWorktreesByRoot: cache.gitWorktreesByRoot ?? {},
      gitByDirectory: mergedGit,
      prefs,
      currentSessionID,
      currentDirectory,
      includeSessionRows: options?.includeSessionRows ?? true,
      currentProjectOnly: options?.currentProjectOnly,
      onlyRelevantProjects: options?.onlyRelevantProjects,
    })
  }

  const inspectDirectoriesFallback = async (
    directories: readonly string[],
  ): Promise<{
    readonly summaries: Record<string, GitSummary>
    readonly staleDirs: Set<string>
  }> => {
    const summaries: Record<string, GitSummary> = {}
    const staleDirs = new Set<string>()
    const targets = Array.from(
      new Set(
        directories
          .map((d) => normalizeDir(d))
          .filter((d) => !isInvalidWorkspaceRoot(d)),
      ),
    ).slice(0, 16)

    await Promise.all(
      targets.map(async (dir) => {
        try {
          const [vcsRes, statusRes] = await Promise.all([
            context.client.vcs.get({ location: { directory: dir } }),
            context.client.vcs.status({ location: { directory: dir } }),
          ])
          const currentBranch = vcsRes.data?.branch?.current
          const statusItems = Array.isArray(statusRes.data)
            ? statusRes.data
            : []
          const isGitCheckout = Boolean(
            currentBranch ||
              vcsRes.data?.provider ||
              vcsRes.data?.branch?.default ||
              statusItems.length > 0,
          )
          if (isGitCheckout) {
            summaries[dir] = {
              branch: currentBranch || "detached",
              dirtyCount: statusItems.length,
              ahead: 0,
              behind: 0,
            }
          } else {
            staleDirs.add(dir)
          }
        } catch {
          staleDirs.add(dir)
        }
      }),
    )

    return { summaries, staleDirs }
  }

  const refreshWorkspacesData = async (options?: {
    readonly forceWorktreeRefresh?: boolean
    readonly includeAllProjects?: boolean
  }) => {
    if (disposed) return
    if (syncInFlight) {
      syncQueued = true
      return
    }
    syncInFlight = true
    try {
      await context.data.project.sync().catch(() => {})

      const activeSessionID = resolveActiveSessionID()
      const activeSession = activeSessionID
        ? context.data.session.get(activeSessionID)
        : undefined
      const activeDir = resolveActiveDirectory(activeSessionID)

      const candidateProjects = context.data.project
        .list()
        .filter(
          (p) =>
            !p.time.archived &&
            !isInvalidWorkspaceRoot(p.canonical) &&
            (Boolean(p.vcs) || p.sandboxes.length > 0),
        )

      let activeProj = activeSession
        ? candidateProjects.find((p) => p.id === activeSession.projectID)
        : undefined
      if (!activeProj && activeDir) {
        let bestLen = -1
        for (const p of candidateProjects) {
          const canon = normalizeDir(p.canonical)
          const known = [
            canon,
            ...(p.sandboxes ?? []),
            ...(cache.worktreesByProject?.[p.id] ?? []),
            ...(cache.gitWorktreesByRoot?.[canon]?.map((w) => w.directory) ??
              []),
          ]
          for (const raw of known) {
            const norm = normalizeDir(raw)
            if (
              norm &&
              isSubpathOrSame(activeDir, norm) &&
              norm.length > bestLen
            ) {
              bestLen = norm.length
              activeProj = p
            }
          }
        }
      }

      const wantAll = Boolean(
        prefs.showAllGitProjects || options?.includeAllProjects,
      )
      const sortedOthers = candidateProjects
        .filter((p) => p.id !== activeProj?.id)
        .sort(
          (a, b) =>
            Math.max(b.time.active ?? 0, b.time.updated) -
            Math.max(a.time.active ?? 0, a.time.updated),
        )

      const projectsToInspect = activeProj
        ? wantAll
          ? [activeProj, ...sortedOthers.slice(0, 11)]
          : [activeProj]
        : wantAll
          ? sortedOthers.slice(0, 12)
          : []

      const now = Date.now()
      const dirtyFlagConsumed = inventoryDiscoveryDirty
      inventoryDiscoveryDirty = false

      const wtEntries = await Promise.all(
        projectsToInspect.map(async (proj) => {
          const prevRefreshAt = lastInventoryRefreshAt.get(proj.id)
          const isActiveProj = proj.id === activeProj?.id
          const needsPeriodicFallbackDiscovery =
            isActiveProj &&
            !lastRpcSucceeded &&
            (prevRefreshAt === undefined ||
              now - prevRefreshAt >= FALLBACK_DISCOVERY_TTL_MS)

          const shouldRefreshInventory =
            Boolean(options?.forceWorktreeRefresh) ||
            prevRefreshAt === undefined ||
            (isActiveProj && dirtyFlagConsumed) ||
            needsPeriodicFallbackDiscovery

          if (shouldRefreshInventory) {
            lastInventoryRefreshAt.set(proj.id, now)
            await context.client.worktree
              .refresh({ projectID: proj.id })
              .catch(() => {})
          }
          try {
            const list = await context.client.worktree.list({
              projectID: proj.id,
            })
            const dirs = Array.isArray(list)
              ? list
                  .map((item) => normalizeDir(item.directory))
                  .filter((d) => !isInvalidWorkspaceRoot(d))
              : []
            return [proj.id, dirs, true] as const
          } catch {
            return [
              proj.id,
              cache.worktreesByProject?.[proj.id] ?? [],
              false,
            ] as const
          }
        }),
      )

      if (disposed) return

      const nextWorktrees: Record<string, string[]> = {
        ...(cache.worktreesByProject ?? {}),
      }
      const rootDirSet = new Set<string>()
      const dirSet = new Set<string>()
      const activeProjDirs = new Set<string>()
      const previousKnownDirsForInspectedProjects = new Set<string>()

      for (const proj of projectsToInspect) {
        const canon = normalizeDir(proj.canonical)
        if (!isInvalidWorkspaceRoot(canon)) {
          rootDirSet.add(canon)
          dirSet.add(canon)
          if (proj.id === activeProj?.id) activeProjDirs.add(canon)
        }
        for (const oldWt of cache.worktreesByProject?.[proj.id] ?? []) {
          previousKnownDirsForInspectedProjects.add(normalizeDir(oldWt))
        }
        for (const oldGw of cache.gitWorktreesByRoot?.[canon] ?? []) {
          previousKnownDirsForInspectedProjects.add(normalizeDir(oldGw.directory))
        }
      }

      for (const [projectID, dirs, ok] of wtEntries) {
        if (ok) {
          nextWorktrees[projectID] = dirs
        }
        for (const d of dirs) {
          dirSet.add(d)
          if (projectID === activeProj?.id) activeProjDirs.add(d)
        }
        if (!ok) {
          const proj = projectsToInspect.find((p) => p.id === projectID)
          for (const sb of proj?.sandboxes ?? []) {
            const norm = normalizeDir(sb)
            if (!isInvalidWorkspaceRoot(norm)) {
              dirSet.add(norm)
              if (projectID === activeProj?.id) activeProjDirs.add(norm)
            }
          }
        }
      }

      if (activeDir && !isInvalidWorkspaceRoot(activeDir)) {
        dirSet.add(activeDir)
        if (activeProj) activeProjDirs.add(activeDir)
      }

      const projectRootDirs = Array.from(rootDirSet)
      const allDirs = Array.from(dirSet)
      let gitSummaries: Record<string, GitSummary> = {}
      const gitWorktreesByRoot: Record<string, GitWorktreeEntry[]> = {}
      const staleSummaryDirs = new Set<string>()
      let rpcSucceededThisCycle = false

      if (allDirs.length > 0) {
        const rpcLocation =
          context.location ??
          (activeDir ? { directory: activeDir } : undefined) ??
          (allDirs[0] ? { directory: allDirs[0] } : undefined)

        try {
          const rpcClient = context.client.rpc(WorkspacesRpc)
          const res = await rpcClient.inspectLocations(
            {
              directories: allDirs,
              rootDirectories: projectRootDirs,
            },
            rpcLocation ? { location: rpcLocation } : undefined,
          )
          rpcSucceededThisCycle = true
          lastRpcSucceeded = true
          gitSummaries = { ...res.summaries }
          for (const [rootDir, entries] of Object.entries(res.worktreesByRoot)) {
            const normRoot = normalizeDir(rootDir)
            gitWorktreesByRoot[normRoot] = [...entries]
            for (const wt of entries) {
              const normWt = normalizeDir(wt.directory)
              if (!isInvalidWorkspaceRoot(normWt)) {
                dirSet.add(normWt)
                if (activeProj && normalizeDir(activeProj.canonical) === normRoot) {
                  activeProjDirs.add(normWt)
                }
              }
            }
          }
        } catch {
          lastRpcSucceeded = false
        }

        const missingActiveDirs = Array.from(activeProjDirs).filter(
          (d) => !gitSummaries[d],
        )
        if (missingActiveDirs.length > 0) {
          const fallback = await inspectDirectoriesFallback(missingActiveDirs)
          gitSummaries = { ...gitSummaries, ...fallback.summaries }
          for (const stale of fallback.staleDirs) {
            staleSummaryDirs.add(stale)
          }
        }
      }

      // Prune cached git summaries for worktrees that were removed from inspected projects
      for (const oldDir of previousKnownDirsForInspectedProjects) {
        if (!dirSet.has(oldDir)) {
          staleSummaryDirs.add(oldDir)
        }
      }

      if (disposed) return

      setCache((draft) => {
        draft.worktreesByProject = nextWorktrees

        const nextGitWorktreesByRoot: Record<string, GitWorktreeEntry[]> = {
          ...(draft.gitWorktreesByRoot ?? {}),
        }
        if (rpcSucceededThisCycle) {
          for (const rootDir of projectRootDirs) {
            if (gitWorktreesByRoot[rootDir]) {
              nextGitWorktreesByRoot[rootDir] = gitWorktreesByRoot[rootDir]
            } else {
              delete nextGitWorktreesByRoot[rootDir]
            }
          }
        }
        draft.gitWorktreesByRoot = nextGitWorktreesByRoot

        const nextGitByDir: Record<string, GitSummary> = {
          ...(draft.gitByDirectory ?? {}),
          ...gitSummaries,
        }
        for (const stale of staleSummaryDirs) {
          if (!gitSummaries[stale]) {
            delete nextGitByDir[stale]
          }
        }
        draft.gitByDirectory = nextGitByDir
        draft.lastSyncedAt = Date.now()
      })
      syncOpenTabLocations()
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

  scheduleRefresh(50)

  const [terminalHeight, setTerminalHeight] = createSignal(
    context.renderer.height || 40,
  )
  const handleRendererResize = () => {
    if (context.renderer.height > 0) {
      setTerminalHeight(context.renderer.height)
    }
  }
  context.renderer.on("resize", handleRendererResize)

  const cleanups: Array<() => void> = [
    () => {
      context.renderer.off("resize", handleRendererResize)
    },
  ]

  const syncPendingSessionIDs = new Set<string>()

  function syncOpenTabLocations() {
    if (disposed || !context.ui.tabs.enabled()) return
    for (const tab of context.ui.tabs.list()) {
      const sess = context.data.session.get(tab.sessionID)
      if (!sess) {
        if (!syncPendingSessionIDs.has(tab.sessionID)) {
          syncPendingSessionIDs.add(tab.sessionID)
          void context.data.session
            .sync(tab.sessionID)
            .then(() => {
              syncPendingSessionIDs.delete(tab.sessionID)
              const loaded = context.data.session.get(tab.sessionID)
              if (loaded && !disposed) {
                ensureLocationSynced(loaded.location, loaded.projectID)
              }
            })
            .catch(() => {
              syncPendingSessionIDs.delete(tab.sessionID)
            })
        }
        continue
      }
      ensureLocationSynced(sess.location, sess.projectID)
    }
  }

  const syncSessionWorkspace = (sessionID: string | undefined) => {
    if (disposed || !sessionID) return
    const rootID = context.data.session.root(sessionID)
    if (!rootID) return

    const session = context.data.session.get(rootID)
    if (!session) {
      if (!syncPendingSessionIDs.has(rootID)) {
        syncPendingSessionIDs.add(rootID)
        void context.data.session
          .sync(rootID)
          .then(() => {
            syncPendingSessionIDs.delete(rootID)
            if (!disposed) syncSessionWorkspace(rootID)
          })
          .catch(() => {
            syncPendingSessionIDs.delete(rootID)
          })
      }
      return
    }

    untrack(() => {
      recordSelectedWorkspace(session.location.directory, session.projectID)
      ensureLocationSynced(session.location, session.projectID)
    })
  }

  cleanups.push(
    context.data.on("worktree.updated", () => {
      inventoryDiscoveryDirty = true
      syncedLocationAt.clear()
      scheduleRefresh(100)
    }),
    context.data.on("vcs.branch.updated", () => {
      inventoryDiscoveryDirty = true
      syncedLocationAt.clear()
      syncOpenTabLocations()
      scheduleRefresh(150)
    }),
    context.data.on("project.updated", () => scheduleRefresh(200)),
    context.data.on("session.created", () => scheduleRefresh(150)),
    context.data.on("session.deleted", (event) => {
      const deletedID =
        (event as { data?: { sessionID?: string }; durable?: { aggregateID?: string } })
          .data?.sessionID ??
        (event as { durable?: { aggregateID?: string } }).durable?.aggregateID
      if (deletedID) {
        setDeletedSessionIDs((prev) => {
          if (prev.has(deletedID)) return prev
          const next = new Set(prev)
          next.add(deletedID)
          return next
        })
      }
      scheduleRefresh(150)
    }),
    context.data.on("filesystem.changed", () => scheduleRefresh(400)),
    context.data.on("session.idle", () => scheduleRefresh(250)),
    context.data.on("session.moved", (event) => {
      context.data.session.invalidate(event.data.sessionID)
      void context.data.session.sync(event.data.sessionID).catch(() => {})
      ensureLocationSynced(event.data.location, event.data.projectID, {
        force: true,
        invalidate: true,
      })
      const activeRoot = resolveActiveSessionID()
      if (
        activeRoot &&
        context.data.session.root(event.data.sessionID) === activeRoot
      ) {
        recordSelectedWorkspace(
          event.data.location.directory,
          event.data.projectID,
        )
      }
      scheduleRefresh(100)
    }),
  )

  try {
    const stopRpcEvents = context.client
      .rpc(WorkspacesRpc)
      .events.on("updated", () => {
        scheduleRefresh(150)
      })
    cleanups.push(stopRpcEvents)
  } catch {
    // Optional on remote or TUI-only setups
  }

  const pollInterval = setInterval(() => {
    scheduleRefresh(0)
  }, 15_000)
  cleanups.push(() => clearInterval(pollInterval))

  // --- Actions ---

  const findCurrentProject = ():
    | { id: string; name: string; canonical: string }
    | undefined => {
    const snap = buildSnapshot({ currentProjectOnly: true })
    const current = snap.projects[0]
    if (!current) return undefined
    return {
      id: current.id,
      name: current.name,
      canonical: current.canonical,
    }
  }

  const activateSession = (
    sessionID: string,
    directoryHint?: string,
    projectIDHint?: string,
  ) => {
    const existing = context.data.session.get(sessionID)
    const targetDir = directoryHint ?? existing?.location.directory
    const targetProjectID = projectIDHint ?? existing?.projectID
    recordSelectedWorkspace(targetDir, targetProjectID)

    const locRef =
      existing?.location ??
      (targetDir ? { directory: normalizeDir(targetDir) } : undefined)
    if (locRef?.directory) {
      const norm = normalizeDir(locRef.directory)
      const missingVcs = !context.data.location.vcs.info(locRef)
      const lastAt = syncedLocationAt.get(norm) ?? 0
      ensureLocationSynced(locRef, targetProjectID, {
        force: missingVcs && Date.now() - lastAt > 1_000,
      })
    }

    if (!existing && !syncPendingSessionIDs.has(sessionID)) {
      syncPendingSessionIDs.add(sessionID)
      void context.data.session
        .sync(sessionID)
        .then(() => {
          syncPendingSessionIDs.delete(sessionID)
          const synced = context.data.session.get(sessionID)
          if (synced && !disposed) {
            ensureLocationSynced(synced.location, synced.projectID)
          }
        })
        .catch(() => {
          syncPendingSessionIDs.delete(sessionID)
        })
    }

    if (context.ui.tabs.enabled()) {
      context.ui.tabs.open(sessionID)
      context.ui.tabs.focus(sessionID)
    }
    context.ui.router.navigate({ type: "session", sessionID })
  }

  const createSessionInDirectory = async (
    directory: string,
    announceLabel?: string,
    projectIDHint?: string,
  ) => {
    const normDir = normalizeDir(directory)
    if (!normDir) return
    recordSelectedWorkspace(normDir, projectIDHint)

    try {
      const resolvedProjectID =
        projectIDHint ?? inferProjectIDForDirectory(normDir)
      const projectCanonical = resolvedProjectID
        ? normalizeDir(
            context.data.project.get(resolvedProjectID)?.canonical ?? "",
          )
        : ""
      if (
        resolvedProjectID &&
        normDir !== projectCanonical &&
        !(cache.worktreesByProject?.[resolvedProjectID] ?? []).some(
          (wt) => normalizeDir(wt) === normDir,
        )
      ) {
        await context.client.worktree
          .refresh({ projectID: resolvedProjectID })
          .catch(() => {})
      }

      await Promise.all([
        context.data.location.sync({ directory: normDir }),
        context.data.location.vcs.sync({ directory: normDir }),
      ])
        .then(() => {
          syncedLocationAt.set(normDir, Date.now())
        })
        .catch(() => {
          syncedLocationAt.delete(normDir)
        })

      const created = await context.client.session.create({
        location: { directory: normDir },
      })

      if (
        created?.location?.directory &&
        normalizeDir(created.location.directory) !== normDir
      ) {
        try {
          await context.client.session.move({
            sessionID: created.id,
            directory: normDir,
          })
        } catch {
          await context.client.session.move({
            sessionID: created.id,
            directory: normDir,
            delivery: "steer",
          })
        }
      }

      context.data.session.invalidate(created.id)
      await context.data.session.sync(created.id).catch(() => {})
      const synced = context.data.session.get(created.id)
      const finalLocation = synced?.location ??
        created?.location ?? { directory: normDir }
      const finalProjectID =
        synced?.projectID ?? resolvedProjectID ?? created?.projectID
      ensureLocationSynced(finalLocation, finalProjectID, { force: true })

      activateSession(
        created.id,
        normalizeDir(finalLocation.directory) || normDir,
        finalProjectID,
      )
      scheduleRefresh(80)
      if (announceLabel) {
        context.ui.toast.show({
          message: announceLabel,
          variant: "success",
          duration: 2000,
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
    projectIDHint?: string,
  ) => {
    recordSelectedWorkspace(directory, projectIDHint)
    if (preferredSessionID) {
      activateSession(preferredSessionID, directory, projectIDHint)
      return
    }
    await createSessionInDirectory(
      directory,
      `Opened session in ${dirBasename(directory)}`,
      projectIDHint,
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
    }).catch(() => {})
  }

  const isSidebarWorktreeExpanded = (directory: string): boolean => {
    const norm = normalizeDir(directory)
    if (!norm) return false
    const list = prefs.expandedSidebarWorktrees
    if (!Array.isArray(list)) return false
    return list.some((entry) => normalizeDir(entry) === norm)
  }

  const toggleSidebarWorktree = (directory: string) => {
    const norm = normalizeDir(directory)
    if (!norm) return
    void setPrefs((draft) => {
      const current = Array.isArray(draft.expandedSidebarWorktrees)
        ? draft.expandedSidebarWorktrees
        : []
      const exists = current.some((entry) => normalizeDir(entry) === norm)
      draft.expandedSidebarWorktrees = exists
        ? current.filter((entry) => normalizeDir(entry) !== norm)
        : [...current, norm]
    }).catch(() => {})
  }

  const clearSidebarWorktreeExpanded = (directory: string) => {
    const norm = normalizeDir(directory)
    if (!norm) return
    void setPrefs((draft) => {
      if (!Array.isArray(draft.expandedSidebarWorktrees)) return
      draft.expandedSidebarWorktrees = draft.expandedSidebarWorktrees.filter(
        (entry) => normalizeDir(entry) !== norm,
      )
    }).catch(() => {})
  }

  const pruneRemovedWorktreeFromCache = (
    projectID: string,
    canonicalDir: string,
    removedDir: string,
  ) => {
    const normRemoved = normalizeDir(removedDir)
    const normCanon = normalizeDir(canonicalDir)
    setCache((draft) => {
      if (draft.worktreesByProject[projectID]) {
        draft.worktreesByProject[projectID] = draft.worktreesByProject[
          projectID
        ]!.filter((d) => normalizeDir(d) !== normRemoved)
      }
      if (draft.gitWorktreesByRoot[normCanon]) {
        draft.gitWorktreesByRoot[normCanon] = draft.gitWorktreesByRoot[
          normCanon
        ]!.filter((w) => normalizeDir(w.directory) !== normRemoved)
      }
      delete draft.gitByDirectory[normRemoved]
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
      message: nowPinned ? `Pinned ${project.name}` : `Unpinned ${project.name}`,
      variant: "info",
      duration: 1600,
    })
  }

  const toggleShowAllGitProjects = async () => {
    let nextValue = false
    await setPrefs((draft) => {
      draft.showAllGitProjects = !draft.showAllGitProjects
      nextValue = draft.showAllGitProjects
    })
    if (nextValue) {
      void refreshWorkspacesData({ includeAllProjects: true })
    }
    context.ui.toast.show({
      message: nextValue
        ? "Showing all Git repositories"
        : "Showing current repository only",
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
            "Branch name to create an isolated Git worktree and open a session in it.",
          placeholder: "feat/my-branch",
        })
      )?.trim()

    if (!rawInput) return

    const safeName = rawInput
      .replace(/^refs\/heads\//, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")

    try {
      const createdWt = await context.client.worktree.create({
        projectID: project.id,
        branch: rawInput,
        name: safeName || undefined,
      })
      await refreshWorkspacesData({ forceWorktreeRefresh: true })
      await createSessionInDirectory(
        createdWt.directory,
        `Switched to worktree ${rawInput}`,
        project.id,
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
        message: "Primary checkout cannot be removed as a worktree",
        variant: "warning",
      })
      return
    }

    const confirmed = await context.ui.dialog.confirm({
      title: "Remove Git Worktree",
      message: `Remove worktree "${worktree.label}" (${context.ui.format.path(worktree.directory)})?`,
      label: { confirm: "Remove", cancel: "Cancel" },
    })
    if (!confirmed) return

    try {
      await context.client.worktree.remove({
        projectID: project.id,
        directory: worktree.directory,
        force: false,
      })
      clearSidebarWorktreeExpanded(worktree.directory)
      pruneRemovedWorktreeFromCache(
        project.id,
        project.canonical,
        worktree.directory,
      )
      if (selectedWorkspace()?.directory === normalizeDir(worktree.directory)) {
        recordSelectedWorkspace(project.canonical, project.id)
      }
      await refreshWorkspacesData({ forceWorktreeRefresh: true })
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
        clearSidebarWorktreeExpanded(worktree.directory)
        pruneRemovedWorktreeFromCache(
          project.id,
          project.canonical,
          worktree.directory,
        )
        if (
          selectedWorkspace()?.directory === normalizeDir(worktree.directory)
        ) {
          recordSelectedWorkspace(project.canonical, project.id)
        }
        await refreshWorkspacesData({ forceWorktreeRefresh: true })
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

  const removeSessionFlow = async (session: WorkspaceSessionNode) => {
    const confirmed = await context.ui.dialog.confirm({
      title: "Delete Session",
      message: `Delete session "${session.title}"?`,
      label: { confirm: "Delete", cancel: "Cancel" },
    })
    if (!confirmed) return

    const wasActive = resolveActiveSessionID() === session.id
    const wasInTabs =
      context.ui.tabs.enabled() &&
      context.ui.tabs.list().some((t) => t.sessionID === session.id)

    try {
      await context.client.session.remove({ sessionID: session.id })
      setDeletedSessionIDs((prev) => {
        const next = new Set(prev)
        next.add(session.id)
        return next
      })
      context.data.session.invalidate(session.id)

      if (wasInTabs) {
        context.ui.tabs.close(session.id)
      }

      if (wasActive) {
        const routeAfterTabClose = context.ui.router.current()
        if (
          !wasInTabs ||
          (routeAfterTabClose.type === "session" &&
            context.data.session.root(routeAfterTabClose.sessionID) ===
              session.id)
        ) {
          const deleted = deletedSessionIDs()
          const remaining = context.data.session
            .list()
            .filter(
              (s) =>
                !s.parentID &&
                !s.time.archived &&
                s.id !== session.id &&
                !deleted.has(s.id) &&
                s.projectID === session.projectID,
            )
            .sort((a, b) => b.time.updated - a.time.updated)
          const sameWorktree = remaining.find(
            (s) => normalizeDir(s.location.directory) === session.directory,
          )
          const fallback = sameWorktree ?? remaining[0]
          if (fallback) {
            activateSession(
              fallback.id,
              fallback.location.directory,
              fallback.projectID,
            )
          } else {
            context.ui.router.navigate({ type: "home" })
          }
        }
      }

      scheduleRefresh(80)
      context.ui.toast.show({
        message: `Deleted session ${session.title}`,
        variant: "success",
        duration: 1800,
      })
    } catch (err) {
      context.ui.toast.show({
        title: "Failed to delete session",
        message: err instanceof Error ? err.message : String(err),
        variant: "error",
      })
    }
  }

  const openSessionContextMenu = async (
    session: WorkspaceSessionNode,
    worktreeDirectory: string,
    projectID: string,
  ) => {
    const isInTabs =
      context.ui.tabs.enabled() &&
      context.ui.tabs.list().some((t) => t.sessionID === session.id)

    type SessionAction = "delete" | "open" | "close-tab"
    const options: Array<{
      readonly title: string
      readonly value: SessionAction
      readonly description?: string
    }> = [
      {
        title: "Delete session",
        value: "delete",
        description: `Permanently delete "${session.title}"`,
      },
      {
        title: "Open session",
        value: "open",
        description: `Switch to "${session.title}"`,
      },
      ...(isInTabs
        ? [
            {
              title: "Close tab" as const,
              value: "close-tab" as const,
              description: "Close tab without deleting session history",
            },
          ]
        : []),
    ]

    const action = await context.ui.dialog.select<SessionAction>({
      title: session.title,
      placeholder: "Choose session action...",
      options,
    })

    if (action === "open") {
      activateSession(session.id, worktreeDirectory, projectID)
    } else if (action === "close-tab") {
      context.ui.tabs.close(session.id)
    } else if (action === "delete") {
      await removeSessionFlow(session)
    }
  }

  const moveCurrentSessionToDirectory = async (
    targetDirectory: string,
    explicitSessionID?: string,
    projectIDHint?: string,
  ) => {
    const activeID = resolveActiveSessionID(explicitSessionID)
    if (!activeID) {
      context.ui.toast.show({
        message: "Open a session first before moving it to another worktree",
        variant: "warning",
      })
      return
    }
    const normTarget = normalizeDir(targetDirectory)
    try {
      try {
        await context.client.session.move({
          sessionID: activeID,
          directory: normTarget,
        })
      } catch {
        await context.client.session.move({
          sessionID: activeID,
          directory: normTarget,
          delivery: "steer",
        })
      }
      recordSelectedWorkspace(normTarget, projectIDHint)
      context.data.session.invalidate(activeID)
      await context.data.session.sync(activeID).catch(() => {})
      const moved = context.data.session.get(activeID)
      ensureLocationSynced(
        moved?.location ?? { directory: normTarget },
        moved?.projectID ?? projectIDHint,
        { force: true, invalidate: true },
      )
      scheduleRefresh(100)
      context.ui.toast.show({
        message: `Moved session to ${dirBasename(normTarget)}`,
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
    const snap = buildSnapshot({
      currentProjectOnly: !prefs.showAllGitProjects,
    })
    const target = snap.quickSlots.get(slot)
    if (!target) {
      context.ui.toast.show({
        message: `No worktree in slot ${slot}`,
        variant: "warning",
        duration: 1500,
      })
      return
    }
    await openWorktree(
      target.directory,
      target.primarySessionID,
      target.projectID,
    )
  }

  const choosePreferredEditor = async (): Promise<string | undefined> => {
    const selected = await promptPreferredEditor(context, prefs.preferredEditor)
    if (!selected) return undefined
    await setPrefs((draft) => {
      draft.preferredEditor = selected
    }).catch(() => {})
    context.ui.toast.show({
      message: `Preferred editor set to ${selected}`,
      variant: "info",
      duration: 1600,
    })
    return selected
  }

  const openWorktreeInEditor = async (
    targetDirectory?: string,
    explicitEditorArg?: string,
  ) => {
    const dir = normalizeDir(targetDirectory ?? resolveActiveDirectory() ?? "")
    if (!dir || isInvalidWorkspaceRoot(dir)) {
      context.ui.toast.show({
        message: "Select or open a Git worktree first",
        variant: "warning",
      })
      return
    }

    const configured = resolveConfiguredEditor({
      explicitArg: explicitEditorArg,
      pluginOptionEditor: context.options.editor,
      preferredEditor: prefs.preferredEditor,
    })

    let parsed = configured.parsed
    if (configured.shouldPersistExplicit && configured.raw && parsed) {
      await setPrefs((draft) => {
        draft.preferredEditor = configured.raw
      }).catch(() => {})
    }

    if (!parsed) {
      const chosen = await choosePreferredEditor()
      if (!chosen) return
      parsed = parseEditorCommand(chosen)
      if (!parsed) return
    }

    try {
      await launchParsedEditor({
        context,
        directory: dir,
        parsed,
        spawner: customEditorSpawner,
        onAfterTerminalExit: () => {
          scheduleRefresh(80)
        },
      })
    } catch (err) {
      context.ui.toast.show({
        title: `Failed to launch ${parsed.binary}`,
        message:
          err instanceof Error
            ? `${err.message} (use "/ws editor" to pick another editor)`
            : String(err),
        variant: "error",
      })
    }
  }

  const dispose = () => {
    disposed = true
    if (refreshDebounce) clearTimeout(refreshDebounce)
    for (const cleanup of cleanups) {
      try {
        cleanup()
      } catch {
        // Ignore teardown errors
      }
    }
  }

  return {
    context,
    prefs,
    cache,
    terminalHeight,
    selectedWorkspace,
    resolveActiveSessionID,
    resolveActiveDirectory,
    syncSessionWorkspace,
    buildSnapshot,
    refreshWorkspacesData,
    scheduleRefresh,
    findCurrentProject,
    activateSession,
    createSessionInDirectory,
    openWorktree,
    toggleCollapseProject,
    isSidebarWorktreeExpanded,
    toggleSidebarWorktree,
    togglePinProject,
    toggleShowAllGitProjects,
    createWorktreeFlow,
    removeWorktreeFlow,
    removeSessionFlow,
    openSessionContextMenu,
    moveCurrentSessionToDirectory,
    jumpToQuickSlot,
    openWorktreeInEditor,
    choosePreferredEditor,
    dispose,
  }
}

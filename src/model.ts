export type AgentStatus = "blocked" | "working" | "idle"
export type AgentStatusDetail = "permission" | "form" | "running"

export interface GitSummary {
  readonly branch?: string
  readonly head?: string
  readonly dirtyCount: number
  readonly ahead: number
  readonly behind: number
}

export interface GitWorktreeEntry {
  readonly directory: string
  readonly branch?: string
  readonly head?: string
}

export interface WorkspacePreferences {
  pinnedProjects: string[]
  collapsedProjects: string[]
  expandedSidebarWorktrees?: string[]
  preferredEditor?: string
  showAllGitProjects: boolean
  maxRecentProjects: number
}

export const DEFAULT_PREFERENCES: WorkspacePreferences = {
  pinnedProjects: [],
  collapsedProjects: [],
  expandedSidebarWorktrees: [],
  showAllGitProjects: false,
  maxRecentProjects: 8,
}

export interface ProjectInput {
  readonly id: string
  readonly canonical: string
  readonly vcs?: string
  readonly name?: string
  readonly sandboxes?: readonly string[]
  readonly time: {
    readonly created: number
    readonly updated: number
    readonly active?: number
    readonly archived?: number
  }
}

export interface SessionInput {
  readonly id: string
  readonly parentID?: string
  readonly projectID: string
  readonly title?: string
  readonly outcome?: "succeeded" | "failed" | "interrupted"
  readonly time: {
    readonly created: number
    readonly updated: number
    readonly busy?: number
    readonly idle?: number
    readonly viewed?: number
    readonly archived?: number
  }
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
  }
}

export interface SessionRuntimeState {
  readonly running: boolean
  readonly permissionsCount: number
  readonly formsCount: number
}

export interface WorkspaceSessionNode {
  readonly id: string
  readonly projectID: string
  readonly title: string
  readonly directory: string
  readonly status: AgentStatus
  readonly statusDetail?: AgentStatusDetail
  readonly outcome?: "succeeded" | "failed" | "interrupted"
  readonly isCurrent: boolean
  readonly updatedAt: number
}

export interface WorktreeNode {
  readonly projectID: string
  readonly directory: string
  readonly label: string
  readonly sublabel?: string
  readonly isCanonical: boolean
  readonly branch?: string
  readonly dirtyCount: number
  readonly ahead: number
  readonly behind: number
  readonly status: AgentStatus
  readonly statusDetail?: AgentStatusDetail
  readonly isCurrent: boolean
  readonly sessions: readonly WorkspaceSessionNode[]
  readonly primarySessionID?: string
  readonly quickSlot?: number
}

export interface ProjectNode {
  readonly id: string
  readonly name: string
  readonly canonical: string
  readonly pinned: boolean
  readonly collapsed: boolean
  readonly isCurrent: boolean
  readonly status: AgentStatus
  readonly statusDetail?: AgentStatusDetail
  readonly totalSessions: number
  readonly activeCount: number
  readonly updatedAt: number
  readonly worktrees: readonly WorktreeNode[]
}

export type FlatTreeRow =
  | {
      readonly kind: "project"
      readonly key: string
      readonly project: ProjectNode
    }
  | {
      readonly kind: "worktree"
      readonly key: string
      readonly project: ProjectNode
      readonly worktree: WorktreeNode
    }
  | {
      readonly kind: "session"
      readonly key: string
      readonly project: ProjectNode
      readonly worktree: WorktreeNode
      readonly session: WorkspaceSessionNode
    }

export interface WorkspaceTreeResult {
  readonly projects: readonly ProjectNode[]
  readonly rows: readonly FlatTreeRow[]
  readonly quickSlots: ReadonlyMap<number, WorktreeNode>
  readonly summary: {
    readonly totalProjects: number
    readonly totalWorktrees: number
    readonly workingSessions: number
    readonly blockedSessions: number
  }
}

export interface BuildWorkspaceTreeInput {
  readonly projects: readonly ProjectInput[]
  readonly sessions: readonly SessionInput[]
  readonly sessionRuntime: Readonly<Record<string, SessionRuntimeState>>
  readonly worktreesByProject: Readonly<Record<string, readonly string[]>>
  readonly gitWorktreesByRoot?: Readonly<Record<string, readonly GitWorktreeEntry[]>>
  readonly gitByDirectory: Readonly<Record<string, GitSummary>>
  readonly prefs: WorkspacePreferences
  readonly currentSessionID?: string
  readonly currentDirectory?: string
  readonly homeDirectory?: string
  readonly includeSessionRows?: boolean
  /** When true (e.g. in the session sidebar & default panel), strictly shows only the active repository. */
  readonly currentProjectOnly?: boolean
  /** When false (e.g. when viewing all Git repos), includes idle single-worktree Git repos too. */
  readonly onlyRelevantProjects?: boolean
}

const STATUS_PRIORITY: Readonly<Record<AgentStatus, number>> = {
  blocked: 3,
  working: 2,
  idle: 1,
}

export function normalizeDir(dir: string): string {
  if (!dir) return ""
  const trimmed = dir.trim().replace(/\\/g, "/")
  if (trimmed === "/") return "/"
  return trimmed.replace(/\/+$/, "")
}

export function dirBasename(dir: string): string {
  const norm = normalizeDir(dir)
  if (!norm || norm === "/") return ""
  const idx = norm.lastIndexOf("/")
  return idx === -1 ? norm : norm.slice(idx + 1)
}

export function isSubpathOrSame(candidateDir: string, rootDir: string): boolean {
  const candidate = normalizeDir(candidateDir)
  const root = normalizeDir(rootDir)
  if (!candidate || !root) return false
  if (candidate === root) return true
  if (root === "/") return false
  return candidate.startsWith(`${root}/`)
}

export function isInvalidWorkspaceRoot(
  dir: string,
  homeDirectory?: string,
): boolean {
  const norm = normalizeDir(dir)
  if (!norm || norm === "/") return true
  if (norm === "/Users" || norm === "/home" || norm === "/tmp" || norm === "/private/tmp") {
    return true
  }
  if (homeDirectory && norm === normalizeDir(homeDirectory)) {
    return true
  }
  // Also guard standard /Users/<username> or /home/<username> home roots when homeDirectory isn't passed
  if (/^\/Users\/[^/]+$/.test(norm) || /^\/home\/[^/]+$/.test(norm)) {
    return true
  }
  return false
}

export function computeSessionStatus(state?: SessionRuntimeState): {
  readonly status: AgentStatus
  readonly detail?: AgentStatusDetail
} {
  if (!state) return { status: "idle" }
  if (state.permissionsCount > 0) {
    return { status: "blocked", detail: "permission" }
  }
  if (state.formsCount > 0) {
    return { status: "blocked", detail: "form" }
  }
  if (state.running) {
    return { status: "working", detail: "running" }
  }
  return { status: "idle" }
}

export function aggregateStatus(
  items: readonly { readonly status: AgentStatus; readonly statusDetail?: AgentStatusDetail }[],
): { readonly status: AgentStatus; readonly detail?: AgentStatusDetail } {
  let best: AgentStatus = "idle"
  let detail: AgentStatusDetail | undefined
  for (const item of items) {
    if (STATUS_PRIORITY[item.status] > STATUS_PRIORITY[best]) {
      best = item.status
      detail = item.statusDetail
    } else if (
      item.status === "blocked" &&
      best === "blocked" &&
      detail !== "permission" &&
      item.statusDetail === "permission"
    ) {
      detail = "permission"
    }
  }
  return { status: best, detail }
}

/**
 * Computes the status rolled up onto a parent worktree row from child sessions
 * that are NOT currently rendered underneath it. When child sessions are unfolded,
 * their `!` / `●` glyphs and `perm` / `ask` / `busy` badges appear only on the
 * session rows instead of duplicating onto the parent worktree row.
 */
export function rollupHiddenWorktreeStatus(
  worktree: Pick<WorktreeNode, "sessions">,
  visibleSessions: readonly Pick<WorkspaceSessionNode, "id">[],
): { readonly status: AgentStatus; readonly detail?: AgentStatusDetail } {
  if (worktree.sessions.length === 0) return { status: "idle" }
  if (visibleSessions.length === 0) {
    return aggregateStatus(worktree.sessions)
  }
  const visibleIDs = new Set(visibleSessions.map((s) => s.id))
  const hidden = worktree.sessions.filter((s) => !visibleIDs.has(s.id))
  return aggregateStatus(hidden)
}

export function matchSessionWorktree(
  sessionDir: string,
  knownWorktreeDirs: readonly string[],
  canonicalDir: string,
): string {
  const normSession = normalizeDir(sessionDir)
  if (!normSession) return normalizeDir(canonicalDir)

  let bestMatch: string | undefined
  for (const rawCandidate of knownWorktreeDirs) {
    const candidate = normalizeDir(rawCandidate)
    if (!candidate || candidate === "/") continue
    if (isSubpathOrSame(normSession, candidate)) {
      if (!bestMatch || candidate.length > bestMatch.length) {
        bestMatch = candidate
      }
    }
  }
  return bestMatch ?? normSession
}

/**
 * Parses `git status --porcelain=v1 -b` output into branch, ahead/behind, and dirty file count.
 */
export function parseGitPorcelainBranchStatus(output: string): GitSummary {
  const lines = output.split(/\r?\n/)
  let branch: string | undefined
  let ahead = 0
  let behind = 0
  let dirtyCount = 0

  for (const line of lines) {
    if (!line) continue
    if (line.startsWith("## ")) {
      const header = line.slice(3).trim()
      const bracketMatch = header.match(/\[([^\]]+)\]$/)
      const branchPart = bracketMatch ? header.slice(0, bracketMatch.index).trim() : header

      if (bracketMatch?.[1]) {
        const aheadMatch = bracketMatch[1].match(/ahead\s+(\d+)/)
        const behindMatch = bracketMatch[1].match(/behind\s+(\d+)/)
        if (aheadMatch?.[1]) ahead = Number.parseInt(aheadMatch[1], 10) || 0
        if (behindMatch?.[1]) behind = Number.parseInt(behindMatch[1], 10) || 0
      }

      if (
        branchPart.startsWith("HEAD (") ||
        branchPart === "HEAD" ||
        branchPart.includes("(no branch)")
      ) {
        branch = "detached"
      } else if (branchPart.startsWith("No commits yet on ")) {
        branch = branchPart.slice("No commits yet on ".length).trim() || undefined
      } else if (branchPart.startsWith("Initial commit on ")) {
        branch = branchPart.slice("Initial commit on ".length).trim() || undefined
      } else {
        const dotsIdx = branchPart.indexOf("...")
        branch = (dotsIdx === -1 ? branchPart : branchPart.slice(0, dotsIdx)).trim() || undefined
      }
    } else {
      dirtyCount += 1
    }
  }

  return { branch, dirtyCount, ahead, behind }
}

/**
 * Parses `git worktree list --porcelain` into real active Git worktrees (excluding bare/prunable).
 */
export function parseGitWorktreePorcelain(output: string): GitWorktreeEntry[] {
  const entries: GitWorktreeEntry[] = []
  const blocks = output.trim().split(/\r?\n\r?\n+/)

  for (const block of blocks) {
    if (!block.trim()) continue
    const lines = block.split(/\r?\n/)
    let directory: string | undefined
    let branch: string | undefined
    let head: string | undefined
    let isBare = false
    let isPrunable = false

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        directory = normalizeDir(line.slice("worktree ".length))
      } else if (line.startsWith("HEAD ")) {
        head = line.slice("HEAD ".length).trim()
      } else if (line.startsWith("branch ")) {
        const ref = line.slice("branch ".length).trim()
        branch = ref.startsWith("refs/heads/")
          ? ref.slice("refs/heads/".length)
          : ref
      } else if (line === "detached") {
        branch = head ? head.slice(0, 7) : "detached"
      } else if (line === "bare") {
        isBare = true
      } else if (line.startsWith("prunable ")) {
        isPrunable = true
      }
    }

    if (directory && !isBare && !isPrunable) {
      entries.push({ directory, branch, head })
    }
  }

  return entries
}

export function formatSessionTitle(session: Pick<SessionInput, "id" | "title">): string {
  const cleaned = session.title?.replace(/\s+/g, " ").trim()
  if (cleaned) return cleaned
  return `Session ${session.id.slice(-6)}`
}

export function buildWorkspaceTree(input: BuildWorkspaceTreeInput): WorkspaceTreeResult {
  const normCurrentDir = input.currentDirectory ? normalizeDir(input.currentDirectory) : undefined
  const includeSessionRows = input.includeSessionRows ?? true
  const onlyRelevant =
    input.onlyRelevantProjects ?? !input.prefs?.showAllGitProjects

  const rootSessions = input.sessions.filter((s) => !s.parentID && !s.time.archived)
  const currentSession = input.currentSessionID
    ? rootSessions.find((s) => s.id === input.currentSessionID)
    : undefined

  const sessionsByProject = new Map<string, SessionInput[]>()
  for (const session of rootSessions) {
    const bucket = sessionsByProject.get(session.projectID)
    if (bucket) {
      bucket.push(session)
    } else {
      sessionsByProject.set(session.projectID, [session])
    }
  }

  const pinnedOrder = new Map<string, number>()
  ;(input.prefs?.pinnedProjects ?? []).forEach((key, index) => {
    pinnedOrder.set(normalizeDir(key), index)
    pinnedOrder.set(key, index)
  })

  const collapsedSet = new Set(input.prefs?.collapsedProjects ?? [])

  // Filter strictly to valid Git/worktree projects (never `/`, `$HOME`, or non-VCS random directories)
  const validProjects = input.projects.filter((p) => {
    if (p.time.archived) return false
    const canonicalDir = normalizeDir(p.canonical)
    if (isInvalidWorkspaceRoot(canonicalDir, input.homeDirectory)) return false

    const hasVcsFlag = Boolean(p.vcs)
    const hasDiscoveredGit = Boolean(input.gitByDirectory?.[canonicalDir])
    const hasGitWorktrees =
      (input.gitWorktreesByRoot?.[canonicalDir]?.length ?? 0) > 0
    const hasRecordedWorktrees =
      (p.sandboxes?.length ?? 0) > 0 ||
      (input.worktreesByProject?.[p.id]?.length ?? 0) > 0

    return (
      hasVcsFlag ||
      hasDiscoveredGit ||
      hasGitWorktrees ||
      hasRecordedWorktrees
    )
  })

  // Resolve active project among valid Git projects (preferring currentSession, else longest matching path)
  const resolveProjectByDir = (dir: string): string | undefined => {
    let bestProjectID: string | undefined
    let bestMatchLen = -1
    for (const p of validProjects) {
      const canonicalDir = normalizeDir(p.canonical)
      const gitWts =
        input.gitWorktreesByRoot?.[canonicalDir]?.map((w) => w.directory) ?? []
      const knownDirs = [
        canonicalDir,
        ...(p.sandboxes ?? []),
        ...(input.worktreesByProject?.[p.id] ?? []),
        ...gitWts,
      ]
      for (const rawDir of knownDirs) {
        const candidate = normalizeDir(rawDir)
        if (!candidate) continue
        if (isSubpathOrSame(dir, candidate) && candidate.length > bestMatchLen) {
          bestMatchLen = candidate.length
          bestProjectID = p.id
        }
      }
    }
    return bestProjectID
  }

  const activeProjectID =
    (currentSession &&
    validProjects.some((p) => p.id === currentSession.projectID)
      ? currentSession.projectID
      : undefined) ??
    (normCurrentDir ? resolveProjectByDir(normCurrentDir) : undefined)

  // Build candidate ProjectNodes first so we know exact worktree counts for relevance filtering
  type BuiltCandidate = {
    node: Omit<ProjectNode, "worktrees"> & { worktrees: WorktreeNode[] }
    pinnedIndex: number | undefined
    hasMultipleWorktrees: boolean
    hasActiveRuntime: boolean
  }

  const candidates: BuiltCandidate[] = []

  for (const project of validProjects) {
    const canonicalDir = normalizeDir(project.canonical)
    const pinnedIndex =
      pinnedOrder.get(project.id) ?? pinnedOrder.get(canonicalDir)
    const isCurrentProject = project.id === activeProjectID
    const projSessions = sessionsByProject.get(project.id) ?? []

    // Collect real live worktrees for this project (`git worktree list` + OpenCode worktree list)
    const knownDirSet = new Set<string>()
    knownDirSet.add(canonicalDir)

    const gitWorktreeEntries = input.gitWorktreesByRoot?.[canonicalDir]
    const projectWorktreeEntries = input.worktreesByProject?.[project.id]
    const hasLiveWorktreeSource =
      (gitWorktreeEntries !== undefined && gitWorktreeEntries.length > 0) ||
      projectWorktreeEntries !== undefined

    const gitWorktreeBranchMap = new Map<string, string>()
    for (const gw of gitWorktreeEntries ?? []) {
      const norm = normalizeDir(gw.directory)
      if (norm && !isInvalidWorkspaceRoot(norm, input.homeDirectory)) {
        knownDirSet.add(norm)
        if (gw.branch) gitWorktreeBranchMap.set(norm, gw.branch)
      }
    }
    for (const wt of projectWorktreeEntries ?? []) {
      const norm = normalizeDir(wt)
      if (norm && !isInvalidWorkspaceRoot(norm, input.homeDirectory)) {
        knownDirSet.add(norm)
      }
    }
    // Only fall back to static `project.sandboxes` before live worktree sources have loaded
    if (!hasLiveWorktreeSource) {
      for (const sb of project.sandboxes ?? []) {
        const norm = normalizeDir(sb)
        if (norm && !isInvalidWorkspaceRoot(norm, input.homeDirectory)) {
          knownDirSet.add(norm)
        }
      }
    }

    const baseKnownDirs = Array.from(knownDirSet)
    const sessionsByWorktree = new Map<string, WorkspaceSessionNode[]>()
    let latestSessionTime = 0
    let projectActiveCount = 0

    for (const s of projSessions) {
      if (s.time.updated > latestSessionTime) latestSessionTime = s.time.updated
      const targetDir = matchSessionWorktree(
        s.location.directory,
        baseKnownDirs,
        canonicalDir,
      )
      const isCurrentSess = s.id === input.currentSessionID
      // Never resurrect deleted worktrees from old idle session history; only keep live worktrees (or active current session)
      if (!knownDirSet.has(targetDir)) {
        if (isCurrentSess && !isInvalidWorkspaceRoot(targetDir, input.homeDirectory)) {
          knownDirSet.add(targetDir)
        } else {
          continue
        }
      }
      const runtime = computeSessionStatus(input.sessionRuntime[s.id])
      if (runtime.status !== "idle") projectActiveCount += 1

      const sessionNode: WorkspaceSessionNode = {
        id: s.id,
        projectID: project.id,
        title: formatSessionTitle(s),
        directory: normalizeDir(s.location.directory),
        status: runtime.status,
        statusDetail: runtime.detail,
        outcome: s.outcome,
        isCurrent: isCurrentSess,
        updatedAt: s.time.updated,
      }

      const list = sessionsByWorktree.get(targetDir)
      if (list) {
        list.push(sessionNode)
      } else {
        sessionsByWorktree.set(targetDir, [sessionNode])
      }
    }

    const sortedWorktreeDirs = Array.from(knownDirSet).sort((a, b) => {
      if (a === canonicalDir) return -1
      if (b === canonicalDir) return 1
      const baseCmp = dirBasename(a).localeCompare(dirBasename(b))
      return baseCmp !== 0 ? baseCmp : a.localeCompare(b)
    })

    const collapsed =
      collapsedSet.has(project.id) || collapsedSet.has(canonicalDir)
    const projectName =
      project.name?.trim() || dirBasename(canonicalDir) || project.id

    const worktreeNodes: WorktreeNode[] = sortedWorktreeDirs.map((wtDir) => {
      const wtSessions = (sessionsByWorktree.get(wtDir) ?? []).sort(
        (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
      )
      const agg = aggregateStatus(wtSessions)
      const git = input.gitByDirectory?.[wtDir]
      const branch = git?.branch ?? gitWorktreeBranchMap.get(wtDir)
      const isCanonical = wtDir === canonicalDir
      const containsCurrentSession = wtSessions.some((s) => s.isCurrent)
      const matchesCurrentLocation =
        !currentSession &&
        normCurrentDir !== undefined &&
        isSubpathOrSame(normCurrentDir, wtDir) &&
        matchSessionWorktree(normCurrentDir, sortedWorktreeDirs, canonicalDir) ===
          wtDir

      const isCurrentWorktree = containsCurrentSession || matchesCurrentLocation
      const currentInWt = wtSessions.find((s) => s.isCurrent)
      const primarySessionID = currentInWt?.id ?? wtSessions[0]?.id

      const folderName = dirBasename(wtDir)
      const displayBranch =
        branch && (isCanonical || branch !== "detached") ? branch : undefined
      // Prefer clean branch name (`main`, `feat/auth`); fall back to folder basename (never "root")
      const label = displayBranch || folderName || projectName
      const sublabel =
        !isCanonical && displayBranch && folderName && folderName !== displayBranch
          ? folderName
          : undefined

      return {
        projectID: project.id,
        directory: wtDir,
        label,
        sublabel,
        isCanonical,
        branch,
        dirtyCount: git?.dirtyCount ?? 0,
        ahead: git?.ahead ?? 0,
        behind: git?.behind ?? 0,
        status: agg.status,
        statusDetail: agg.detail,
        isCurrent: isCurrentWorktree,
        sessions: wtSessions,
        primarySessionID,
      }
    })

    const projAgg = aggregateStatus(worktreeNodes)
    const updatedAt = Math.max(
      project.time.active ?? 0,
      project.time.updated ?? 0,
      latestSessionTime,
    )

    candidates.push({
      node: {
        id: project.id,
        name: projectName,
        canonical: canonicalDir,
        pinned: pinnedIndex !== undefined,
        collapsed,
        isCurrent: isCurrentProject,
        status: projAgg.status,
        statusDetail: projAgg.detail,
        totalSessions: projSessions.length,
        activeCount: projectActiveCount,
        updatedAt,
        worktrees: worktreeNodes,
      },
      pinnedIndex,
      hasMultipleWorktrees: worktreeNodes.length > 1,
      hasActiveRuntime: projectActiveCount > 0,
    })
  }

  // Filter & order projects
  let ordered: BuiltCandidate[]
  if (input.currentProjectOnly) {
    ordered = candidates
      .filter((c) => c.node.isCurrent)
      .map((c) =>
        c.node.collapsed
          ? { ...c, node: { ...c.node, collapsed: false } }
          : c,
      )
  } else {
    const pinnedList = candidates
      .filter((c) => c.pinnedIndex !== undefined)
      .sort((a, b) => (a.pinnedIndex ?? 0) - (b.pinnedIndex ?? 0))

    const unpinnedPool = candidates
      .filter((c) => c.pinnedIndex === undefined)
      .filter((c) => {
        if (c.node.isCurrent) return true
        if (c.hasMultipleWorktrees) return true
        if (c.hasActiveRuntime) return true
        return !onlyRelevant
      })
      .sort((a, b) => {
        // Current project first among unpinned, then multi-worktree / active runtime, then recency
        if (a.node.isCurrent !== b.node.isCurrent) {
          return a.node.isCurrent ? -1 : 1
        }
        if (a.hasActiveRuntime !== b.hasActiveRuntime) {
          return a.hasActiveRuntime ? -1 : 1
        }
        if (a.hasMultipleWorktrees !== b.hasMultipleWorktrees) {
          return a.hasMultipleWorktrees ? -1 : 1
        }
        if (b.node.updatedAt !== a.node.updatedAt) {
          return b.node.updatedAt - a.node.updatedAt
        }
        return a.node.canonical.localeCompare(b.node.canonical)
      })

    const maxRecent = Math.max(
      1,
      input.prefs?.maxRecentProjects ?? DEFAULT_PREFERENCES.maxRecentProjects,
    )
    const selectedUnpinned = unpinnedPool.filter(
      (c, idx) =>
        idx < maxRecent ||
        c.node.isCurrent ||
        c.hasMultipleWorktrees ||
        c.hasActiveRuntime,
    )

    ordered = [...pinnedList, ...selectedUnpinned]
  }

  // Assign quick slots 1..9 and compute totals
  let nextQuickSlot = 1
  let totalWorktrees = 0
  let workingSessions = 0
  let blockedSessions = 0
  const quickSlots = new Map<number, WorktreeNode>()
  const finalProjects: ProjectNode[] = []

  for (const item of ordered) {
    const updatedWorktrees = item.node.worktrees.map((wt) => {
      for (const s of wt.sessions) {
        if (s.status === "working") workingSessions += 1
        if (s.status === "blocked") blockedSessions += 1
      }

      let quickSlot: number | undefined
      if (nextQuickSlot <= 9 && (!item.node.collapsed || wt.isCanonical)) {
        quickSlot = nextQuickSlot
        nextQuickSlot += 1
      }

      const withSlot: WorktreeNode =
        quickSlot !== undefined ? { ...wt, quickSlot } : wt
      if (quickSlot !== undefined) {
        quickSlots.set(quickSlot, withSlot)
      }
      return withSlot
    })

    totalWorktrees += updatedWorktrees.length
    finalProjects.push({
      ...item.node,
      worktrees: updatedWorktrees,
    })
  }

  const rows: FlatTreeRow[] = []
  for (const project of finalProjects) {
    rows.push({
      kind: "project",
      key: `project:${project.id}`,
      project,
    })
    if (!project.collapsed) {
      for (const worktree of project.worktrees) {
        rows.push({
          kind: "worktree",
          key: `worktree:${project.id}:${worktree.directory}`,
          project,
          worktree,
        })
        if (includeSessionRows) {
          for (const session of worktree.sessions) {
            rows.push({
              kind: "session",
              key: `session:${session.id}`,
              project,
              worktree,
              session,
            })
          }
        }
      }
    }
  }

  return {
    projects: finalProjects,
    rows,
    quickSlots,
    summary: {
      totalProjects: finalProjects.length,
      totalWorktrees,
      workingSessions,
      blockedSessions,
    },
  }
}

export interface SwitcherWorktreeGroup {
  readonly key: string
  readonly worktree: WorktreeNode
  readonly sessions: readonly WorkspaceSessionNode[]
  readonly directlyMatched: boolean
}

export interface SwitcherProjectGroup {
  readonly project: ProjectNode
  readonly worktrees: readonly SwitcherWorktreeGroup[]
}

export type SwitcherSelectableRow =
  | {
      readonly kind: "worktree"
      readonly key: string
      readonly project: ProjectNode
      readonly worktree: WorktreeNode
      readonly directlyMatched: boolean
    }
  | {
      readonly kind: "session"
      readonly key: string
      readonly project: ProjectNode
      readonly worktree: WorktreeNode
      readonly session: WorkspaceSessionNode
      readonly isLastSession: boolean
      readonly directlyMatched: boolean
    }

export interface SwitcherFilterResult {
  readonly projects: readonly SwitcherProjectGroup[]
  readonly selectableRows: readonly SwitcherSelectableRow[]
}

/**
 * Filters a `ProjectNode[]` hierarchy by query while preserving Project → Worktree → Session
 * tree grouping so matching sessions always retain their parent worktree context.
 */
export function filterWorkspaceTreeForSwitcher(
  projects: readonly ProjectNode[],
  rawQuery: string,
): SwitcherFilterResult {
  const query = rawQuery.trim().toLowerCase()
  const tokens = query ? query.split(/\s+/).filter(Boolean) : []

  const filteredProjects: SwitcherProjectGroup[] = []
  const selectableRows: SwitcherSelectableRow[] = []

  for (const project of projects) {
    const filteredWorktrees: SwitcherWorktreeGroup[] = []

    for (const wt of project.worktrees) {
      const wtKey = `worktree:${project.id}:${wt.directory}`

      if (tokens.length === 0) {
        filteredWorktrees.push({
          key: wtKey,
          worktree: wt,
          sessions: wt.sessions,
          directlyMatched: false,
        })
        selectableRows.push({
          kind: "worktree",
          key: wtKey,
          project,
          worktree: wt,
          directlyMatched: false,
        })
        wt.sessions.forEach((session, idx) => {
          selectableRows.push({
            kind: "session",
            key: `session:${session.id}`,
            project,
            worktree: wt,
            session,
            isLastSession: idx === wt.sessions.length - 1,
            directlyMatched: false,
          })
        })
        continue
      }

      const wtSearchText = [
        project.name,
        wt.label,
        wt.sublabel ?? "",
        wt.branch ?? "",
        wt.directory,
      ]
        .join(" ")
        .toLowerCase()

      const wtMatches = tokens.every((token) => wtSearchText.includes(token))

      const matchingSessions = wt.sessions.filter((session) => {
        const combined = `${wtSearchText} ${session.title} ${session.id} ${session.status} ${session.statusDetail ?? ""}`.toLowerCase()
        return tokens.every((token) => combined.includes(token))
      })

      if (!wtMatches && matchingSessions.length === 0) continue

      const sessionsToShow = wtMatches
        ? (() => {
            const narrowerSessions = wt.sessions.filter((session) => {
              const sessOnly = `${session.title} ${session.id} ${session.status} ${session.statusDetail ?? ""}`.toLowerCase()
              return tokens.every((token) => sessOnly.includes(token))
            })
            return narrowerSessions.length > 0 && narrowerSessions.length < wt.sessions.length
              ? wt.sessions
              : matchingSessions
          })()
        : matchingSessions

      filteredWorktrees.push({
        key: wtKey,
        worktree: wt,
        sessions: sessionsToShow,
        directlyMatched: wtMatches,
      })

      selectableRows.push({
        kind: "worktree",
        key: wtKey,
        project,
        worktree: wt,
        directlyMatched: wtMatches,
      })

      sessionsToShow.forEach((session, idx) => {
        const sessOnly = `${session.title} ${session.id} ${session.status} ${session.statusDetail ?? ""}`.toLowerCase()
        const sessDirectlyMatched =
          !wtMatches || tokens.every((token) => sessOnly.includes(token))

        selectableRows.push({
          kind: "session",
          key: `session:${session.id}`,
          project,
          worktree: wt,
          session,
          isLastSession: idx === sessionsToShow.length - 1,
          directlyMatched: sessDirectlyMatched,
        })
      })
    }

    if (filteredWorktrees.length > 0) {
      filteredProjects.push({
        project,
        worktrees: filteredWorktrees,
      })
    }
  }

  return {
    projects: filteredProjects,
    selectableRows,
  }
}

export interface WorkspaceNewSessionTargetInput {
  readonly explicitWorktreeDirectory?: string
  readonly currentWorktreeDirectory?: string
  readonly activeSessionDirectory?: string
  readonly selectedWorkspaceDirectory?: string
  readonly launchDirectory?: string
}

/**
 * Resolves the target directory when the user clicks the plugin's explicit
 * "+ session" / "new session" action to spawn a session in a workspace.
 */
export function resolveWorkspaceNewSessionDirectory(
  input: WorkspaceNewSessionTargetInput,
): string | undefined {
  const candidates = [
    input.explicitWorktreeDirectory,
    input.currentWorktreeDirectory,
    input.activeSessionDirectory,
    input.selectedWorkspaceDirectory,
    input.launchDirectory,
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    const norm = normalizeDir(candidate)
    if (norm && !isInvalidWorkspaceRoot(norm)) {
      return norm
    }
  }

  return undefined
}

export interface MarqueeTimingOptions {
  readonly holdStartMs?: number
  readonly stepMs?: number
  readonly holdEndMs?: number
  readonly returnStepMs?: number
  readonly betweenCyclesMs?: number
}

/**
 * Computes horizontal column scroll offset (`0 .. maxScrollX`) for a hovered/focused
 * workspace or session label that overflows its container width.
 *
 * Cycle:
 * 1. Brief initial pause at column 0 (`holdStartMs`)
 * 2. Smooth forward step to `maxScrollX` (`stepMs` per column)
 * 3. Pause at `maxScrollX` so the full suffix is easy to read (`holdEndMs`)
 * 4. Smooth glide back to column 0 (`returnStepMs` per column) + rest (`betweenCyclesMs`)
 */
export function computeMarqueeScrollX(
  elapsedMs: number,
  maxScrollX: number,
  options?: MarqueeTimingOptions,
): number {
  const maxCols = Math.max(0, Math.trunc(maxScrollX))
  if (maxCols <= 0 || !Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return 0
  }

  const holdStartMs = options?.holdStartMs ?? 320
  const stepMs = Math.max(16, options?.stepMs ?? 70)
  const holdEndMs = options?.holdEndMs ?? 900
  const returnStepMs = Math.max(16, options?.returnStepMs ?? 45)
  const betweenCyclesMs = options?.betweenCyclesMs ?? 300

  const intermediateCols = Math.max(0, maxCols - 1)
  const forwardGlideMs = intermediateCols * stepMs
  const backwardGlideMs = intermediateCols * returnStepMs
  const cycleMs =
    holdStartMs + forwardGlideMs + holdEndMs + backwardGlideMs + betweenCyclesMs

  const t = elapsedMs % cycleMs

  if (t < holdStartMs) {
    return 0
  }

  const afterStart = t - holdStartMs
  if (afterStart < forwardGlideMs) {
    return Math.min(maxCols, 1 + Math.floor(afterStart / stepMs))
  }

  const afterForward = afterStart - forwardGlideMs
  if (afterForward < holdEndMs) {
    return maxCols
  }

  const afterHoldEnd = afterForward - holdEndMs
  if (afterHoldEnd < backwardGlideMs) {
    const stepsBack = 1 + Math.floor(afterHoldEnd / returnStepMs)
    return Math.max(0, maxCols - stepsBack)
  }

  return 0
}

export interface EditorPreset {
  readonly id: string
  readonly title: string
  readonly command: string
  readonly description: string
  readonly kind: "gui" | "terminal"
  readonly macAppName?: string
}

export const EDITOR_PRESETS: readonly EditorPreset[] = [
  {
    id: "zed",
    title: "Zed",
    command: "zed",
    description: "Open worktree window in Zed",
    kind: "gui",
    macAppName: "Zed",
  },
  {
    id: "cursor",
    title: "Cursor",
    command: "cursor",
    description: "Open worktree window in Cursor",
    kind: "gui",
    macAppName: "Cursor",
  },
  {
    id: "code",
    title: "VS Code",
    command: "code",
    description: "Open worktree window in Visual Studio Code",
    kind: "gui",
    macAppName: "Visual Studio Code",
  },
  {
    id: "windsurf",
    title: "Windsurf",
    command: "windsurf",
    description: "Open worktree window in Windsurf",
    kind: "gui",
    macAppName: "Windsurf",
  },
  {
    id: "nvim",
    title: "Neovim",
    command: "nvim",
    description: "Suspend TUI and open worktree in Neovim",
    kind: "terminal",
  },
  {
    id: "hx",
    title: "Helix",
    command: "hx",
    description: "Suspend TUI and open worktree in Helix",
    kind: "terminal",
  },
  {
    id: "vim",
    title: "Vim",
    command: "vim",
    description: "Suspend TUI and open worktree in Vim",
    kind: "terminal",
  },
  {
    id: "lazygit",
    title: "Lazygit",
    command: "lazygit",
    description: "Suspend TUI and inspect worktree in Lazygit",
    kind: "terminal",
  },
  {
    id: "open",
    title: "System File Manager",
    command: "open",
    description: "Reveal worktree folder in Finder / file manager",
    kind: "gui",
  },
]

const TERMINAL_EDITOR_BINARIES = new Set([
  "nvim",
  "vim",
  "vi",
  "view",
  "nano",
  "hx",
  "helix",
  "kak",
  "micro",
  "ne",
  "joe",
  "mg",
  "yazi",
  "ranger",
  "nnn",
  "lf",
  "lazygit",
  "tig",
])

const MAC_GUI_APP_NAMES: Readonly<Record<string, string>> = {
  zed: "Zed",
  "zed-preview": "Zed Preview",
  cursor: "Cursor",
  code: "Visual Studio Code",
  "code-insiders": "Visual Studio Code - Insiders",
  windsurf: "Windsurf",
  subl: "Sublime Text",
  fleet: "Fleet",
  idea: "IntelliJ IDEA",
  webstorm: "WebStorm",
  pycharm: "PyCharm",
  goland: "GoLand",
}

export interface ParsedEditorCommand {
  readonly binary: string
  readonly args: readonly string[]
  readonly kind: "gui" | "terminal"
  readonly macAppName?: string
}

function splitCommandTokens(raw: string): string[] {
  const tokens: string[] = []
  let current = ""
  let quote: "'" | '"' | null = null
  let escaped = false

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!
    if (escaped) {
      current += ch
      escaped = false
      continue
    }
    if (ch === "\\" && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        current += ch
      }
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      continue
    }
    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ""
      }
      continue
    }
    current += ch
  }

  if (current.length > 0) {
    tokens.push(current)
  }
  return tokens
}

/**
 * Parses an editor command string (e.g. `zed`, `code --wait`, `/opt/homebrew/bin/nvim`)
 * into executable + sanitized arguments + GUI vs terminal TTY classification.
 */
export function parseEditorCommand(
  rawCommand: string | undefined,
): ParsedEditorCommand | undefined {
  const trimmed = rawCommand?.trim()
  if (!trimmed) return undefined

  const tokens = splitCommandTokens(trimmed)
  if (tokens.length === 0) return undefined

  const binary = tokens[0]!
  const rawArgs = tokens.slice(1)
  const baseName = dirBasename(binary).toLowerCase().replace(/\.exe$/, "")

  const isTerminalEmacs =
    baseName === "emacs" &&
    rawArgs.some((arg) => arg === "-nw" || arg === "--no-window-system")

  const kind: "gui" | "terminal" =
    TERMINAL_EDITOR_BINARIES.has(baseName) || isTerminalEmacs
      ? "terminal"
      : "gui"

  // Strip `--wait` / `-w` when launching GUI editors on a workspace folder so OpenCode never blocks
  const args =
    kind === "gui"
      ? rawArgs.filter((arg) => arg !== "--wait" && arg !== "-w")
      : rawArgs

  return {
    binary,
    args,
    kind,
    macAppName: MAC_GUI_APP_NAMES[baseName],
  }
}

export type AgentStatus = "blocked" | "working" | "idle"
export type AgentStatusDetail = "permission" | "form" | "running"

export interface GitSummary {
  readonly branch?: string
  readonly dirtyCount: number
  readonly ahead: number
  readonly behind: number
}

export interface WorkspacePreferences {
  pinnedProjects: string[]
  collapsedProjects: string[]
  showIdleProjects: boolean
  showSessionsInSidebar: boolean
  maxRecentProjects: number
}

export const DEFAULT_PREFERENCES: WorkspacePreferences = {
  pinnedProjects: [],
  collapsedProjects: [],
  showIdleProjects: true,
  showSessionsInSidebar: true,
  maxRecentProjects: 8,
}

export interface ProjectInput {
  readonly id: string
  readonly canonical: string
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
  readonly gitByDirectory: Readonly<Record<string, GitSummary>>
  readonly prefs: WorkspacePreferences
  readonly currentSessionID?: string
  readonly currentDirectory?: string
  readonly includeSessionRows?: boolean
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
  if (!norm || norm === "/") return norm || "/"
  const idx = norm.lastIndexOf("/")
  return idx === -1 ? norm : norm.slice(idx + 1)
}

export function isSubpathOrSame(candidateDir: string, rootDir: string): boolean {
  const candidate = normalizeDir(candidateDir)
  const root = normalizeDir(rootDir)
  if (!candidate || !root) return false
  if (candidate === root) return true
  if (root === "/") return candidate.startsWith("/")
  return candidate.startsWith(`${root}/`)
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
 * Maps a session's working directory to the most specific enclosing worktree directory.
 * If the session directory is outside all known worktrees (e.g. a newly created external
 * git worktree before `worktree.list` finishes syncing), returns the normalized session directory.
 */
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
    if (!candidate) continue
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
        branch = "HEAD"
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

export function formatSessionTitle(session: Pick<SessionInput, "id" | "title">): string {
  const cleaned = session.title?.replace(/\s+/g, " ").trim()
  if (cleaned) return cleaned
  return `Session ${session.id.slice(-6)}`
}

export function buildWorkspaceTree(input: BuildWorkspaceTreeInput): WorkspaceTreeResult {
  const normCurrentDir = input.currentDirectory ? normalizeDir(input.currentDirectory) : undefined
  const includeSessionRows = input.includeSessionRows ?? true

  // Filter to root, non-archived sessions
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
  input.prefs.pinnedProjects.forEach((key, index) => {
    pinnedOrder.set(normalizeDir(key), index)
    pinnedOrder.set(key, index)
  })

  const collapsedSet = new Set(input.prefs.collapsedProjects)

  // Determine which project is currently active
  const activeProjectID =
    currentSession?.projectID ??
    (normCurrentDir
      ? input.projects.find((p) => {
          const knownDirs = [
            p.canonical,
            ...(p.sandboxes ?? []),
            ...(input.worktreesByProject[p.id] ?? []),
          ]
          return knownDirs.some((d) => isSubpathOrSame(normCurrentDir, d))
        })?.id
      : undefined)

  // Score and filter projects while keeping pinned ordering completely stable
  const nonArchivedProjects = input.projects.filter((p) => !p.time.archived)

  type PreparedProject = {
    raw: ProjectInput
    pinnedIndex: number | undefined
    isCurrent: boolean
    hasActiveRuntime: boolean
    lastUpdated: number
  }

  const prepared: PreparedProject[] = nonArchivedProjects.map((p) => {
    const normCanonical = normalizeDir(p.canonical)
    const pinnedIndex = pinnedOrder.get(p.id) ?? pinnedOrder.get(normCanonical)
    const projSessions = sessionsByProject.get(p.id) ?? []
    let latestSessionTime = 0
    let hasActiveRuntime = false
    for (const s of projSessions) {
      if (s.time.updated > latestSessionTime) latestSessionTime = s.time.updated
      const st = computeSessionStatus(input.sessionRuntime[s.id])
      if (st.status !== "idle") hasActiveRuntime = true
    }
    const lastUpdated = Math.max(
      p.time.active ?? 0,
      p.time.updated ?? 0,
      latestSessionTime,
    )
    return {
      raw: p,
      pinnedIndex,
      isCurrent: p.id === activeProjectID,
      hasActiveRuntime,
      lastUpdated,
    }
  })

  const pinnedProjects = prepared
    .filter((p) => p.pinnedIndex !== undefined)
    .sort((a, b) => (a.pinnedIndex ?? 0) - (b.pinnedIndex ?? 0))

  const unpinnedCandidates = prepared
    .filter((p) => p.pinnedIndex === undefined)
    .filter((p) => {
      if (p.isCurrent || p.hasActiveRuntime) return true
      if (!input.prefs.showIdleProjects) return false
      return true
    })
    .sort((a, b) => {
      if (b.lastUpdated !== a.lastUpdated) return b.lastUpdated - a.lastUpdated
      return normalizeDir(a.raw.canonical).localeCompare(normalizeDir(b.raw.canonical))
    })

  // Guarantee current & active runtime projects are included even if beyond maxRecentProjects
  const maxRecent = Math.max(1, input.prefs.maxRecentProjects)
  const selectedUnpinned: PreparedProject[] = []
  for (const candidate of unpinnedCandidates) {
    if (
      selectedUnpinned.length < maxRecent ||
      candidate.isCurrent ||
      candidate.hasActiveRuntime
    ) {
      selectedUnpinned.push(candidate)
    }
  }

  const orderedPrepared = [...pinnedProjects, ...selectedUnpinned]

  let workingSessions = 0
  let blockedSessions = 0
  let totalWorktrees = 0
  let nextQuickSlot = 1
  const quickSlots = new Map<number, WorktreeNode>()
  const projectNodes: ProjectNode[] = []

  for (const item of orderedPrepared) {
    const project = item.raw
    const canonicalDir = normalizeDir(project.canonical)
    const projSessions = sessionsByProject.get(project.id) ?? []

    // Gather known worktree roots for this project
    const knownDirSet = new Set<string>()
    if (canonicalDir) knownDirSet.add(canonicalDir)
    for (const sb of project.sandboxes ?? []) {
      const norm = normalizeDir(sb)
      if (norm) knownDirSet.add(norm)
    }
    for (const wt of input.worktreesByProject[project.id] ?? []) {
      const norm = normalizeDir(wt)
      if (norm) knownDirSet.add(norm)
    }

    const baseKnownDirs = Array.from(knownDirSet)

    // Group sessions into enclosing worktree (or add external directory if outside known dirs)
    const sessionsByWorktree = new Map<string, WorkspaceSessionNode[]>()
    for (const s of projSessions) {
      const targetDir = matchSessionWorktree(
        s.location.directory,
        baseKnownDirs,
        canonicalDir,
      )
      knownDirSet.add(targetDir)
      const runtime = computeSessionStatus(input.sessionRuntime[s.id])
      if (runtime.status === "working") workingSessions += 1
      if (runtime.status === "blocked") blockedSessions += 1

      const sessionNode: WorkspaceSessionNode = {
        id: s.id,
        projectID: project.id,
        title: formatSessionTitle(s),
        directory: normalizeDir(s.location.directory),
        status: runtime.status,
        statusDetail: runtime.detail,
        outcome: s.outcome,
        isCurrent: s.id === input.currentSessionID,
        updatedAt: s.time.updated,
      }

      const list = sessionsByWorktree.get(targetDir)
      if (list) {
        list.push(sessionNode)
      } else {
        sessionsByWorktree.set(targetDir, [sessionNode])
      }
    }

    // Order worktrees stably: canonical directory first, then alphabetical by basename/path
    const sortedWorktreeDirs = Array.from(knownDirSet).sort((a, b) => {
      if (a === canonicalDir) return -1
      if (b === canonicalDir) return 1
      const baseCmp = dirBasename(a).localeCompare(dirBasename(b))
      return baseCmp !== 0 ? baseCmp : a.localeCompare(b)
    })

    const collapsed = collapsedSet.has(project.id) || collapsedSet.has(canonicalDir)
    const worktreeNodes: WorktreeNode[] = []
    let projectActiveCount = 0

    for (const wtDir of sortedWorktreeDirs) {
      const wtSessions = (sessionsByWorktree.get(wtDir) ?? []).sort(
        (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
      )

      for (const s of wtSessions) {
        if (s.status !== "idle") projectActiveCount += 1
      }

      const agg = aggregateStatus(wtSessions)
      const git = input.gitByDirectory[wtDir]
      const isCanonical = wtDir === canonicalDir
      const containsCurrentSession = wtSessions.some((s) => s.isCurrent)
      const matchesCurrentLocation =
        !currentSession &&
        normCurrentDir !== undefined &&
        matchSessionWorktree(normCurrentDir, sortedWorktreeDirs, canonicalDir) === wtDir

      const isCurrentWorktree = containsCurrentSession || matchesCurrentLocation
      const currentInWt = wtSessions.find((s) => s.isCurrent)
      const primarySessionID = currentInWt?.id ?? wtSessions[0]?.id

      // Assign WYSIWYG quick-jump slot [1]..[9] to visible worktrees (or canonical worktree when collapsed)
      let quickSlot: number | undefined
      if (nextQuickSlot <= 9 && (!collapsed || isCanonical)) {
        quickSlot = nextQuickSlot
        nextQuickSlot += 1
      }

      const wtLabel = isCanonical
        ? git?.branch || "root"
        : dirBasename(wtDir)

      const wtNode: WorktreeNode = {
        projectID: project.id,
        directory: wtDir,
        label: wtLabel,
        isCanonical,
        branch: git?.branch,
        dirtyCount: git?.dirtyCount ?? 0,
        ahead: git?.ahead ?? 0,
        behind: git?.behind ?? 0,
        status: agg.status,
        statusDetail: agg.detail,
        isCurrent: isCurrentWorktree,
        sessions: wtSessions,
        primarySessionID,
        quickSlot,
      }

      if (quickSlot !== undefined) {
        quickSlots.set(quickSlot, wtNode)
      }
      worktreeNodes.push(wtNode)
    }

    totalWorktrees += worktreeNodes.length
    const projAgg = aggregateStatus(worktreeNodes)
    const projectName = project.name?.trim() || dirBasename(canonicalDir) || project.id

    projectNodes.push({
      id: project.id,
      name: projectName,
      canonical: canonicalDir,
      pinned: item.pinnedIndex !== undefined,
      collapsed,
      isCurrent: item.isCurrent,
      status: projAgg.status,
      statusDetail: projAgg.detail,
      totalSessions: projSessions.length,
      activeCount: projectActiveCount,
      updatedAt: item.lastUpdated,
      worktrees: worktreeNodes,
    })
  }

  // Build flat navigable row list
  const rows: FlatTreeRow[] = []
  for (const project of projectNodes) {
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
    projects: projectNodes,
    rows,
    quickSlots,
    summary: {
      totalProjects: projectNodes.length,
      totalWorktrees,
      workingSessions,
      blockedSessions,
    },
  }
}

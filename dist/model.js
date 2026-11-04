export const DEFAULT_PREFERENCES = {
  pinnedProjects: [],
  collapsedProjects: [],
  expandedSidebarWorktrees: [],
  showAllGitProjects: false,
  maxRecentProjects: 8,
  leftTabsMode: "scoped",
  tabsByWorktree: {}
};
const STATUS_PRIORITY = {
  blocked: 3,
  working: 2,
  idle: 1
};
export function normalizeDir(dir) {
  if (!dir) return "";
  const trimmed = dir.trim().replace(/\\/g, "/");
  if (trimmed === "/") return "/";
  return trimmed.replace(/\/+$/, "");
}
export function dirBasename(dir) {
  const norm = normalizeDir(dir);
  if (!norm || norm === "/") return "";
  const idx = norm.lastIndexOf("/");
  return idx === -1 ? norm : norm.slice(idx + 1);
}
export function isSubpathOrSame(candidateDir, rootDir) {
  const candidate = normalizeDir(candidateDir);
  const root = normalizeDir(rootDir);
  if (!candidate || !root) return false;
  if (candidate === root) return true;
  if (root === "/") return false;
  return candidate.startsWith(`${root}/`);
}
export function isInvalidWorkspaceRoot(dir, homeDirectory) {
  const norm = normalizeDir(dir);
  if (!norm || norm === "/") return true;
  if (norm === "/Users" || norm === "/home" || norm === "/tmp" || norm === "/private/tmp") {
    return true;
  }
  if (homeDirectory && norm === normalizeDir(homeDirectory)) {
    return true;
  }
  // Also guard standard /Users/<username> or /home/<username> home roots when homeDirectory isn't passed
  if (/^\/Users\/[^/]+$/.test(norm) || /^\/home\/[^/]+$/.test(norm)) {
    return true;
  }
  return false;
}
export function computeSessionStatus(state) {
  if (!state) return {
    status: "idle"
  };
  if (state.permissionsCount > 0) {
    return {
      status: "blocked",
      detail: "permission"
    };
  }
  if (state.formsCount > 0) {
    return {
      status: "blocked",
      detail: "form"
    };
  }
  if (state.running) {
    return {
      status: "working",
      detail: "running"
    };
  }
  return {
    status: "idle"
  };
}
export function aggregateStatus(items) {
  let best = "idle";
  let detail;
  for (const item of items) {
    if (STATUS_PRIORITY[item.status] > STATUS_PRIORITY[best]) {
      best = item.status;
      detail = item.statusDetail;
    } else if (item.status === "blocked" && best === "blocked" && detail !== "permission" && item.statusDetail === "permission") {
      detail = "permission";
    }
  }
  return {
    status: best,
    detail
  };
}

/**
 * Computes the status rolled up onto a parent worktree row from child sessions
 * that are NOT currently rendered underneath it. When child sessions are unfolded,
 * their `!` / `●` glyphs and `perm` / `ask` / `busy` badges appear only on the
 * session rows instead of duplicating onto the parent worktree row.
 */
export function rollupHiddenWorktreeStatus(worktree, visibleSessions) {
  if (worktree.sessions.length === 0) return {
    status: "idle"
  };
  if (visibleSessions.length === 0) {
    return aggregateStatus(worktree.sessions);
  }
  const visibleIDs = new Set(visibleSessions.map(s => s.id));
  const hidden = worktree.sessions.filter(s => !visibleIDs.has(s.id));
  return aggregateStatus(hidden);
}
export function matchSessionWorktree(sessionDir, knownWorktreeDirs, canonicalDir) {
  const normSession = normalizeDir(sessionDir);
  if (!normSession) return normalizeDir(canonicalDir);
  let bestMatch;
  for (const rawCandidate of knownWorktreeDirs) {
    const candidate = normalizeDir(rawCandidate);
    if (!candidate || candidate === "/") continue;
    if (isSubpathOrSame(normSession, candidate)) {
      if (!bestMatch || candidate.length > bestMatch.length) {
        bestMatch = candidate;
      }
    }
  }
  return bestMatch ?? normSession;
}

/**
 * Parses `git status --porcelain=v1 -b` output into branch, ahead/behind, and dirty file count.
 */
export function parseGitPorcelainBranchStatus(output) {
  const lines = output.split(/\r?\n/);
  let branch;
  let ahead = 0;
  let behind = 0;
  let dirtyCount = 0;
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith("## ")) {
      const header = line.slice(3).trim();
      const bracketMatch = header.match(/\[([^\]]+)\]$/);
      const branchPart = bracketMatch ? header.slice(0, bracketMatch.index).trim() : header;
      if (bracketMatch?.[1]) {
        const aheadMatch = bracketMatch[1].match(/ahead\s+(\d+)/);
        const behindMatch = bracketMatch[1].match(/behind\s+(\d+)/);
        if (aheadMatch?.[1]) ahead = Number.parseInt(aheadMatch[1], 10) || 0;
        if (behindMatch?.[1]) behind = Number.parseInt(behindMatch[1], 10) || 0;
      }
      if (branchPart.startsWith("HEAD (") || branchPart === "HEAD" || branchPart.includes("(no branch)")) {
        branch = "detached";
      } else if (branchPart.startsWith("No commits yet on ")) {
        branch = branchPart.slice("No commits yet on ".length).trim() || undefined;
      } else if (branchPart.startsWith("Initial commit on ")) {
        branch = branchPart.slice("Initial commit on ".length).trim() || undefined;
      } else {
        const dotsIdx = branchPart.indexOf("...");
        branch = (dotsIdx === -1 ? branchPart : branchPart.slice(0, dotsIdx)).trim() || undefined;
      }
    } else {
      dirtyCount += 1;
    }
  }
  return {
    ...(branch !== undefined ? {
      branch
    } : {}),
    dirtyCount,
    ahead,
    behind
  };
}

/**
 * Parses `git worktree list --porcelain` into real active Git worktrees (excluding bare/prunable).
 */
export function parseGitWorktreePorcelain(output) {
  const entries = [];
  const blocks = output.trim().split(/\r?\n\r?\n+/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    const lines = block.split(/\r?\n/);
    let directory;
    let branch;
    let head;
    let isBare = false;
    let isPrunable = false;
    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        directory = normalizeDir(line.slice("worktree ".length));
      } else if (line.startsWith("HEAD ")) {
        head = line.slice("HEAD ".length).trim();
      } else if (line.startsWith("branch ")) {
        const ref = line.slice("branch ".length).trim();
        branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
      } else if (line === "detached") {
        branch = head ? head.slice(0, 7) : "detached";
      } else if (line === "bare") {
        isBare = true;
      } else if (line.startsWith("prunable ")) {
        isPrunable = true;
      }
    }
    if (directory && !isBare && !isPrunable) {
      entries.push({
        directory,
        ...(branch !== undefined ? {
          branch
        } : {}),
        ...(head !== undefined ? {
          head
        } : {})
      });
    }
  }
  return entries;
}
export function formatSessionTitle(session) {
  const cleaned = session.title?.replace(/\s+/g, " ").trim();
  if (cleaned) return cleaned;
  return `Session ${session.id.slice(-6)}`;
}
export function buildWorkspaceTree(input) {
  const normCurrentDir = input.currentDirectory ? normalizeDir(input.currentDirectory) : undefined;
  const includeSessionRows = input.includeSessionRows ?? true;
  const onlyRelevant = input.onlyRelevantProjects ?? !input.prefs?.showAllGitProjects;
  const rootSessions = input.sessions.filter(s => !s.parentID && !s.time.archived);
  const currentSession = input.currentSessionID ? rootSessions.find(s => s.id === input.currentSessionID) : undefined;
  const sessionsByProject = new Map();
  for (const session of rootSessions) {
    const bucket = sessionsByProject.get(session.projectID);
    if (bucket) {
      bucket.push(session);
    } else {
      sessionsByProject.set(session.projectID, [session]);
    }
  }
  const pinnedOrder = new Map();
  (input.prefs?.pinnedProjects ?? []).forEach((key, index) => {
    pinnedOrder.set(normalizeDir(key), index);
    pinnedOrder.set(key, index);
  });
  const collapsedSet = new Set(input.prefs?.collapsedProjects ?? []);

  // Filter strictly to valid Git/worktree projects (never `/`, `$HOME`, or non-VCS random directories)
  const validProjects = input.projects.filter(p => {
    if (p.time.archived) return false;
    const canonicalDir = normalizeDir(p.canonical);
    if (isInvalidWorkspaceRoot(canonicalDir, input.homeDirectory)) return false;
    const hasVcsFlag = Boolean(p.vcs);
    const hasDiscoveredGit = Boolean(input.gitByDirectory?.[canonicalDir]);
    const hasGitWorktrees = (input.gitWorktreesByRoot?.[canonicalDir]?.length ?? 0) > 0;
    const hasRecordedWorktrees = (p.sandboxes?.length ?? 0) > 0 || (input.worktreesByProject?.[p.id]?.length ?? 0) > 0;
    return hasVcsFlag || hasDiscoveredGit || hasGitWorktrees || hasRecordedWorktrees;
  });

  // Resolve active project among valid Git projects (preferring currentSession, else longest matching path)
  const resolveProjectByDir = dir => {
    let bestProjectID;
    let bestMatchLen = -1;
    for (const p of validProjects) {
      const canonicalDir = normalizeDir(p.canonical);
      const gitWts = input.gitWorktreesByRoot?.[canonicalDir]?.map(w => w.directory) ?? [];
      const knownDirs = [canonicalDir, ...(p.sandboxes ?? []), ...(input.worktreesByProject?.[p.id] ?? []), ...gitWts];
      for (const rawDir of knownDirs) {
        const candidate = normalizeDir(rawDir);
        if (!candidate) continue;
        if (isSubpathOrSame(dir, candidate) && candidate.length > bestMatchLen) {
          bestMatchLen = candidate.length;
          bestProjectID = p.id;
        }
      }
    }
    return bestProjectID;
  };
  const activeProjectID = (currentSession && validProjects.some(p => p.id === currentSession.projectID) ? currentSession.projectID : undefined) ?? (normCurrentDir ? resolveProjectByDir(normCurrentDir) : undefined);

  // Build candidate ProjectNodes first so we know exact worktree counts for relevance filtering

  const candidates = [];
  for (const project of validProjects) {
    const canonicalDir = normalizeDir(project.canonical);
    const pinnedIndex = pinnedOrder.get(project.id) ?? pinnedOrder.get(canonicalDir);
    const isCurrentProject = project.id === activeProjectID;
    const projSessions = sessionsByProject.get(project.id) ?? [];

    // Collect real live worktrees for this project (`git worktree list` + OpenCode worktree list)
    const knownDirSet = new Set();
    knownDirSet.add(canonicalDir);
    const gitWorktreeEntries = input.gitWorktreesByRoot?.[canonicalDir];
    const projectWorktreeEntries = input.worktreesByProject?.[project.id];
    const hasLiveWorktreeSource = gitWorktreeEntries !== undefined && gitWorktreeEntries.length > 0 || projectWorktreeEntries !== undefined;
    const gitWorktreeBranchMap = new Map();
    for (const gw of gitWorktreeEntries ?? []) {
      const norm = normalizeDir(gw.directory);
      if (norm && !isInvalidWorkspaceRoot(norm, input.homeDirectory)) {
        knownDirSet.add(norm);
        if (gw.branch) gitWorktreeBranchMap.set(norm, gw.branch);
      }
    }
    for (const wt of projectWorktreeEntries ?? []) {
      const norm = normalizeDir(wt);
      if (norm && !isInvalidWorkspaceRoot(norm, input.homeDirectory)) {
        knownDirSet.add(norm);
      }
    }
    // Only fall back to static `project.sandboxes` before live worktree sources have loaded
    if (!hasLiveWorktreeSource) {
      for (const sb of project.sandboxes ?? []) {
        const norm = normalizeDir(sb);
        if (norm && !isInvalidWorkspaceRoot(norm, input.homeDirectory)) {
          knownDirSet.add(norm);
        }
      }
    }
    const hasStaticSandboxes = (project.sandboxes?.length ?? 0) > 0;
    const registerDistinctActiveDir = rawDir => {
      if (!rawDir) return;
      const norm = normalizeDir(rawDir);
      if (!norm || norm === canonicalDir || isInvalidWorkspaceRoot(norm, input.homeDirectory) || knownDirSet.has(norm)) {
        return;
      }
      const coveredByNonCanonicalWorktree = Array.from(knownDirSet).some(known => known !== canonicalDir && isSubpathOrSame(norm, known));
      if (!coveredByNonCanonicalWorktree) {
        knownDirSet.add(norm);
      }
    };

    // Preserve nested worktrees (e.g. `<repo>/test-workspaces/wt-1` or `<repo>/.worktrees/feat`)
    // for the active session/location and during initial OpenCode v2 startup (`sandboxes: []`)
    // so `matchSessionWorktree` never collapses them onto `canonicalDir` (`main`).
    for (const s of projSessions) {
      if (s.id === input.currentSessionID) {
        registerDistinctActiveDir(s.location.directory);
      } else if (!hasLiveWorktreeSource && !hasStaticSandboxes) {
        registerDistinctActiveDir(s.location.directory);
      }
    }
    if (!currentSession && isCurrentProject && normCurrentDir && isSubpathOrSame(normCurrentDir, canonicalDir) && !hasLiveWorktreeSource && !hasStaticSandboxes) {
      registerDistinctActiveDir(normCurrentDir);
    }
    const baseKnownDirs = Array.from(knownDirSet);
    const sessionsByWorktree = new Map();
    let latestSessionTime = 0;
    let projectActiveCount = 0;
    for (const s of projSessions) {
      if (s.time.updated > latestSessionTime) latestSessionTime = s.time.updated;
      const targetDir = matchSessionWorktree(s.location.directory, baseKnownDirs, canonicalDir);
      const isCurrentSess = s.id === input.currentSessionID;
      // Never resurrect deleted worktrees from old idle session history; only keep live worktrees (or active current session)
      if (!knownDirSet.has(targetDir)) {
        if (isCurrentSess && !isInvalidWorkspaceRoot(targetDir, input.homeDirectory)) {
          knownDirSet.add(targetDir);
        } else {
          continue;
        }
      }
      const runtime = computeSessionStatus(input.sessionRuntime[s.id]);
      if (runtime.status !== "idle") projectActiveCount += 1;
      const sessionNode = {
        id: s.id,
        projectID: project.id,
        title: formatSessionTitle(s),
        directory: normalizeDir(s.location.directory),
        status: runtime.status,
        statusDetail: runtime.detail,
        outcome: s.outcome,
        isCurrent: isCurrentSess,
        updatedAt: s.time.updated
      };
      const list = sessionsByWorktree.get(targetDir);
      if (list) {
        list.push(sessionNode);
      } else {
        sessionsByWorktree.set(targetDir, [sessionNode]);
      }
    }
    const sortedWorktreeDirs = Array.from(knownDirSet).sort((a, b) => {
      if (a === canonicalDir) return -1;
      if (b === canonicalDir) return 1;
      const baseCmp = dirBasename(a).localeCompare(dirBasename(b));
      return baseCmp !== 0 ? baseCmp : a.localeCompare(b);
    });
    const collapsed = collapsedSet.has(project.id) || collapsedSet.has(canonicalDir);
    const projectName = project.name?.trim() || dirBasename(canonicalDir) || project.id;
    const worktreeNodes = sortedWorktreeDirs.map(wtDir => {
      const wtSessions = (sessionsByWorktree.get(wtDir) ?? []).sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
      const agg = aggregateStatus(wtSessions);
      const git = input.gitByDirectory?.[wtDir];
      const branch = git?.branch ?? gitWorktreeBranchMap.get(wtDir);
      const isCanonical = wtDir === canonicalDir;
      const containsCurrentSession = wtSessions.some(s => s.isCurrent);
      const matchesCurrentLocation = !currentSession && normCurrentDir !== undefined && isSubpathOrSame(normCurrentDir, wtDir) && matchSessionWorktree(normCurrentDir, sortedWorktreeDirs, canonicalDir) === wtDir;
      const isCurrentWorktree = containsCurrentSession || matchesCurrentLocation;
      const currentInWt = wtSessions.find(s => s.isCurrent);
      const primarySessionID = currentInWt?.id ?? wtSessions[0]?.id;
      const folderName = dirBasename(wtDir);
      const displayBranch = branch && (isCanonical || branch !== "detached") ? branch : undefined;
      // Prefer clean branch name (`main`, `feat/auth`); fall back to folder basename (never "root")
      const label = displayBranch || folderName || projectName;
      const sublabel = !isCanonical && displayBranch && folderName && folderName !== displayBranch ? folderName : undefined;
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
        primarySessionID
      };
    });
    const projAgg = aggregateStatus(worktreeNodes);
    const updatedAt = Math.max(project.time.active ?? 0, project.time.updated ?? 0, latestSessionTime);
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
        worktrees: worktreeNodes
      },
      pinnedIndex,
      hasMultipleWorktrees: worktreeNodes.length > 1,
      hasActiveRuntime: projectActiveCount > 0
    });
  }

  // Filter & order projects
  let ordered;
  if (input.currentProjectOnly) {
    ordered = candidates.filter(c => c.node.isCurrent).map(c => c.node.collapsed ? {
      ...c,
      node: {
        ...c.node,
        collapsed: false
      }
    } : c);
  } else {
    const pinnedList = candidates.filter(c => c.pinnedIndex !== undefined).sort((a, b) => (a.pinnedIndex ?? 0) - (b.pinnedIndex ?? 0));
    const unpinnedPool = candidates.filter(c => c.pinnedIndex === undefined).filter(c => {
      if (c.node.isCurrent) return true;
      if (c.hasMultipleWorktrees) return true;
      if (c.hasActiveRuntime) return true;
      return !onlyRelevant;
    }).sort((a, b) => {
      // Current project first among unpinned, then multi-worktree / active runtime, then recency
      if (a.node.isCurrent !== b.node.isCurrent) {
        return a.node.isCurrent ? -1 : 1;
      }
      if (a.hasActiveRuntime !== b.hasActiveRuntime) {
        return a.hasActiveRuntime ? -1 : 1;
      }
      if (a.hasMultipleWorktrees !== b.hasMultipleWorktrees) {
        return a.hasMultipleWorktrees ? -1 : 1;
      }
      if (b.node.updatedAt !== a.node.updatedAt) {
        return b.node.updatedAt - a.node.updatedAt;
      }
      return a.node.canonical.localeCompare(b.node.canonical);
    });
    const maxRecent = Math.max(1, input.prefs?.maxRecentProjects ?? DEFAULT_PREFERENCES.maxRecentProjects);
    const selectedUnpinned = unpinnedPool.filter((c, idx) => idx < maxRecent || c.node.isCurrent || c.hasMultipleWorktrees || c.hasActiveRuntime);
    ordered = [...pinnedList, ...selectedUnpinned];
  }

  // Assign quick slots 1..9 and compute totals
  let nextQuickSlot = 1;
  let totalWorktrees = 0;
  let workingSessions = 0;
  let blockedSessions = 0;
  const quickSlots = new Map();
  const finalProjects = [];
  for (const item of ordered) {
    const updatedWorktrees = item.node.worktrees.map(wt => {
      for (const s of wt.sessions) {
        if (s.status === "working") workingSessions += 1;
        if (s.status === "blocked") blockedSessions += 1;
      }
      let quickSlot;
      if (nextQuickSlot <= 9 && (!item.node.collapsed || wt.isCanonical)) {
        quickSlot = nextQuickSlot;
        nextQuickSlot += 1;
      }
      const withSlot = quickSlot !== undefined ? {
        ...wt,
        quickSlot
      } : wt;
      if (quickSlot !== undefined) {
        quickSlots.set(quickSlot, withSlot);
      }
      return withSlot;
    });
    totalWorktrees += updatedWorktrees.length;
    finalProjects.push({
      ...item.node,
      worktrees: updatedWorktrees
    });
  }
  const rows = [];
  for (const project of finalProjects) {
    rows.push({
      kind: "project",
      key: `project:${project.id}`,
      project
    });
    if (!project.collapsed) {
      for (const worktree of project.worktrees) {
        rows.push({
          kind: "worktree",
          key: `worktree:${project.id}:${worktree.directory}`,
          project,
          worktree
        });
        if (includeSessionRows) {
          for (const session of worktree.sessions) {
            rows.push({
              kind: "session",
              key: `session:${session.id}`,
              project,
              worktree,
              session
            });
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
      blockedSessions
    }
  };
}
/**
 * Formats worktree row titles in `/ws`: labels the canonical repository folder
 * as `Project sessions` with its currently checked-out branch shown as a muted
 * `⎇ <branch>` tag (since OpenCode scopes sessions by folder rather than branch),
 * while secondary Git worktrees keep their dedicated branch/worktree label.
 */
export function formatSwitcherWorktreeLabel(wt) {
  if (wt.isCanonical) {
    const branchTag = wt.branch ? `⎇ ${wt.branch}` : undefined;
    return {
      title: "Project sessions",
      ...(branchTag !== undefined ? {
        subtitle: branchTag
      } : {})
    };
  }
  return {
    title: wt.label,
    ...(wt.sublabel !== undefined ? {
      subtitle: wt.sublabel
    } : {})
  };
}

/**
 * Filters a `ProjectNode[]` hierarchy by query while preserving Project → Worktree → Session
 * tree grouping so matching sessions always retain their parent worktree context.
 */
export function filterWorkspaceTreeForSwitcher(projects, rawQuery) {
  const query = rawQuery.trim().toLowerCase();
  const tokens = query ? query.split(/\s+/).filter(Boolean) : [];
  const filteredProjects = [];
  const selectableRows = [];
  for (const project of projects) {
    const filteredWorktrees = [];
    for (const wt of project.worktrees) {
      const wtKey = `worktree:${project.id}:${wt.directory}`;
      if (tokens.length === 0) {
        filteredWorktrees.push({
          key: wtKey,
          worktree: wt,
          sessions: wt.sessions,
          directlyMatched: false
        });
        selectableRows.push({
          kind: "worktree",
          key: wtKey,
          project,
          worktree: wt,
          directlyMatched: false
        });
        wt.sessions.forEach((session, idx) => {
          selectableRows.push({
            kind: "session",
            key: `session:${session.id}`,
            project,
            worktree: wt,
            session,
            isLastSession: idx === wt.sessions.length - 1,
            directlyMatched: false
          });
        });
        continue;
      }
      const switcherDisplay = formatSwitcherWorktreeLabel(wt);
      const wtSearchText = [project.name, switcherDisplay.title, switcherDisplay.subtitle ?? "", wt.label, wt.sublabel ?? "", wt.branch ?? "", wt.directory].join(" ").toLowerCase();
      const wtMatches = tokens.every(token => wtSearchText.includes(token));
      const matchingSessions = wt.sessions.filter(session => {
        const combined = `${wtSearchText} ${session.title} ${session.id} ${session.status} ${session.statusDetail ?? ""}`.toLowerCase();
        return tokens.every(token => combined.includes(token));
      });
      if (!wtMatches && matchingSessions.length === 0) continue;
      const sessionsToShow = wtMatches ? (() => {
        const narrowerSessions = wt.sessions.filter(session => {
          const sessOnly = `${session.title} ${session.id} ${session.status} ${session.statusDetail ?? ""}`.toLowerCase();
          return tokens.every(token => sessOnly.includes(token));
        });
        return narrowerSessions.length > 0 && narrowerSessions.length < wt.sessions.length ? wt.sessions : matchingSessions;
      })() : matchingSessions;
      filteredWorktrees.push({
        key: wtKey,
        worktree: wt,
        sessions: sessionsToShow,
        directlyMatched: wtMatches
      });
      selectableRows.push({
        kind: "worktree",
        key: wtKey,
        project,
        worktree: wt,
        directlyMatched: wtMatches
      });
      sessionsToShow.forEach((session, idx) => {
        const sessOnly = `${session.title} ${session.id} ${session.status} ${session.statusDetail ?? ""}`.toLowerCase();
        const sessDirectlyMatched = !wtMatches || tokens.every(token => sessOnly.includes(token));
        selectableRows.push({
          kind: "session",
          key: `session:${session.id}`,
          project,
          worktree: wt,
          session,
          isLastSession: idx === sessionsToShow.length - 1,
          directlyMatched: sessDirectlyMatched
        });
      });
    }
    if (filteredWorktrees.length > 0) {
      filteredProjects.push({
        project,
        worktrees: filteredWorktrees
      });
    }
  }
  return {
    projects: filteredProjects,
    selectableRows
  };
}
/**
 * Resolves the target directory when the user clicks the plugin's explicit
 * "+ session" / "new session" action to spawn a session in a workspace.
 */
export function resolveWorkspaceNewSessionDirectory(input) {
  const candidates = [input.explicitWorktreeDirectory, input.currentWorktreeDirectory, input.activeSessionDirectory, input.selectedWorkspaceDirectory, input.launchDirectory];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const norm = normalizeDir(candidate);
    if (norm && !isInvalidWorkspaceRoot(norm)) {
      return norm;
    }
  }
  return undefined;
}
export const MARQUEE_GAP = "     ";
/**
 * Computes one-directional horizontal column scroll offset (`0 .. periodCols - 1`)
 * for a seamless ticker marquee (`"${text}${MARQUEE_GAP}${text}"`).
 *
 * Cycle:
 * 1. Brief initial settle pause at column 0 (`holdStartMs`) when first hovered/focused
 * 2. Continuous one-way advance (`stepMs` per column) wrapping modulo `periodCols`
 *    so the repeated copy glides into column 0 seamlessly without ever reversing
 */
export function computeMarqueeScrollX(elapsedMs, periodCols, options) {
  const period = Math.max(0, Math.trunc(periodCols));
  if (period <= 1 || !Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return 0;
  }
  const holdStartMs = Math.max(0, options?.holdStartMs ?? 280);
  const stepMs = Math.max(16, options?.stepMs ?? 65);
  if (elapsedMs < holdStartMs) {
    return 0;
  }
  const steps = 1 + Math.floor((elapsedMs - holdStartMs) / stepMs);
  return steps % period;
}
export const EDITOR_PRESETS = [{
  id: "zed",
  title: "Zed",
  command: "zed",
  description: "Open worktree window in Zed",
  kind: "gui",
  macAppName: "Zed"
}, {
  id: "cursor",
  title: "Cursor",
  command: "cursor",
  description: "Open worktree window in Cursor",
  kind: "gui",
  macAppName: "Cursor"
}, {
  id: "code",
  title: "VS Code",
  command: "code",
  description: "Open worktree window in Visual Studio Code",
  kind: "gui",
  macAppName: "Visual Studio Code"
}, {
  id: "windsurf",
  title: "Windsurf",
  command: "windsurf",
  description: "Open worktree window in Windsurf",
  kind: "gui",
  macAppName: "Windsurf"
}, {
  id: "nvim",
  title: "Neovim",
  command: "nvim",
  description: "Suspend TUI and open worktree in Neovim",
  kind: "terminal"
}, {
  id: "hx",
  title: "Helix",
  command: "hx",
  description: "Suspend TUI and open worktree in Helix",
  kind: "terminal"
}, {
  id: "vim",
  title: "Vim",
  command: "vim",
  description: "Suspend TUI and open worktree in Vim",
  kind: "terminal"
}, {
  id: "lazygit",
  title: "Lazygit",
  command: "lazygit",
  description: "Suspend TUI and inspect worktree in Lazygit",
  kind: "terminal"
}, {
  id: "open",
  title: "System File Manager",
  command: "open",
  description: "Reveal worktree folder in Finder / file manager",
  kind: "gui"
}];
const TERMINAL_EDITOR_BINARIES = new Set(["nvim", "vim", "vi", "view", "nano", "hx", "helix", "kak", "micro", "ne", "joe", "mg", "yazi", "ranger", "nnn", "lf", "lazygit", "tig"]);
const MAC_GUI_APP_NAMES = {
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
  goland: "GoLand"
};
function splitCommandTokens(raw) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

/**
 * Parses an editor command string (e.g. `zed`, `code --wait`, `/opt/homebrew/bin/nvim`)
 * into executable + sanitized arguments + GUI vs terminal TTY classification.
 */
export function parseEditorCommand(rawCommand) {
  const trimmed = rawCommand?.trim();
  if (!trimmed) return undefined;
  const tokens = splitCommandTokens(trimmed);
  if (tokens.length === 0) return undefined;
  const binary = tokens[0];
  const rawArgs = tokens.slice(1);
  const baseName = dirBasename(binary).toLowerCase().replace(/\.exe$/, "");
  const isTerminalEmacs = baseName === "emacs" && rawArgs.some(arg => arg === "-nw" || arg === "--no-window-system");
  const kind = TERMINAL_EDITOR_BINARIES.has(baseName) || isTerminalEmacs ? "terminal" : "gui";

  // Strip `--wait` / `-w` when launching GUI editors on a workspace folder so OpenCode never blocks
  const args = kind === "gui" ? rawArgs.filter(arg => arg !== "--wait" && arg !== "-w") : rawArgs;
  return {
    binary,
    args,
    kind,
    macAppName: MAC_GUI_APP_NAMES[baseName]
  };
}
/**
 * Formats a concise, uncapped workspace/branch badge for `session.composer.top`
 * so long repo names never clip the active worktree/branch in OpenCode's 22-col left bar.
 */
export function formatComposerWorkspaceBadge(worktree) {
  const branch = worktree.branch || (!worktree.isCanonical ? worktree.label : undefined);
  let primaryText;
  if (worktree.isCanonical) {
    primaryText = branch ? `⎇ ${branch} · Project sessions` : "Project sessions";
  } else if (worktree.sublabel && worktree.sublabel !== branch) {
    primaryText = `⎇ ${branch ?? worktree.label} · ${worktree.sublabel}`;
  } else {
    primaryText = `⎇ ${branch ?? worktree.label}`;
  }
  const gitParts = [];
  if (worktree.dirtyCount > 0) gitParts.push(`•${worktree.dirtyCount}`);
  if (worktree.ahead > 0) gitParts.push(`↑${worktree.ahead}`);
  if (worktree.behind > 0) gitParts.push(`↓${worktree.behind}`);
  return {
    primaryText,
    ...(gitParts.length > 0 ? {
      gitBadge: gitParts.join(" ")
    } : {})
  };
}
export const MAX_SCOPED_WORKTREE_TABS = 12;
export const MAX_RESTORED_GROUPED_TABS = 24;
/**
 * Computes minimal sequential `tabs.move(sessionID, index)` operations to transform
 * `currentOrder` into `desiredOrder`. Returns `[]` when already ordered.
 */
export function computeMinimalTabMoves(currentOrder, desiredOrder) {
  const desiredSet = new Set(desiredOrder);
  const sim = currentOrder.filter(id => desiredSet.has(id));
  const target = desiredOrder.filter(id => sim.includes(id));
  if (sim.length === target.length && sim.every((id, idx) => id === target[idx])) {
    return [];
  }
  const moves = [];
  for (let i = 0; i < target.length; i++) {
    const id = target[i];
    const curIdx = sim.indexOf(id);
    if (curIdx >= 0 && curIdx !== i) {
      moves.push({
        sessionID: id,
        index: i
      });
      sim.splice(curIdx, 1);
      sim.splice(i, 0, id);
    }
  }
  return moves;
}
function dedupeStrings(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (item && !seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

/**
 * Pure planner for organizing OpenCode's left session tabs (`context.ui.tabs`) in either:
 * - `"scoped"` mode: swaps the left tab bar to show only the active worktree's sessions,
 *   remembering open tabs & tab order per worktree without deleting any session history.
 * - `"grouped"` mode: keeps tabs across worktrees open simultaneously, stably clustered
 *   by repository and worktree without cursor-jumping on tab clicks.
 */
export function planLeftTabsReconciliation(input) {
  const deleted = input.deletedSessionIDs;
  const nextSavedTabsByWorktree = {};
  for (const [rawDir, ids] of Object.entries(input.savedTabsByWorktree ?? {})) {
    const normDir = normalizeDir(rawDir);
    if (!normDir || !Array.isArray(ids)) continue;
    nextSavedTabsByWorktree[normDir] = dedupeStrings(ids.filter(id => {
      if (!id || deleted?.has(id)) return false;
      const meta = input.knownSessions.get(id);
      if (!meta) return true; // Keep while session list may still be hydrating
      return meta.worktreeDirectory === normDir;
    }));
  }
  const openByWorktree = new Map();
  let hasPendingUnknownOpenTab = false;
  for (const tab of input.openTabs) {
    if (!tab.sessionID || deleted?.has(tab.sessionID)) continue;
    const meta = input.knownSessions.get(tab.sessionID);
    if (!meta) {
      hasPendingUnknownOpenTab = true;
      continue;
    }
    const list = openByWorktree.get(meta.worktreeDirectory);
    if (list) {
      if (!list.includes(tab.sessionID)) list.push(tab.sessionID);
    } else {
      openByWorktree.set(meta.worktreeDirectory, [tab.sessionID]);
    }
  }
  if (input.mode === "scoped") {
    const activeWt = normalizeDir(input.activeWorktreeDirectory ?? "");
    const activeRoot = input.activeRootSessionID;
    if (!activeWt || !activeRoot || deleted?.has(activeRoot)) {
      for (const [wtDir, ids] of openByWorktree.entries()) {
        nextSavedTabsByWorktree[wtDir] = [...ids];
      }
      return {
        toOpen: [],
        toClose: [],
        moves: [],
        nextScopedWorktreeDirectory: input.previousScopedWorktreeDirectory,
        nextSavedTabsByWorktree
      };
    }
    const prevScopedWt = input.previousScopedWorktreeDirectory ? normalizeDir(input.previousScopedWorktreeDirectory) : undefined;
    const stayInSameScopedWorktree = input.previousMode === "scoped" && prevScopedWt === activeWt;
    for (const [wtDir, ids] of openByWorktree.entries()) {
      if (wtDir === activeWt) continue;
      if (input.previousMode !== "scoped" || prevScopedWt === wtDir) {
        nextSavedTabsByWorktree[wtDir] = [...ids];
      } else {
        nextSavedTabsByWorktree[wtDir] = dedupeStrings([...(nextSavedTabsByWorktree[wtDir] ?? []), ...ids]);
      }
    }
    let desiredActiveTabs;
    const currentlyOpenInActive = openByWorktree.get(activeWt) ?? [];
    if (stayInSameScopedWorktree && input.openTabs.length > 0) {
      desiredActiveTabs = dedupeStrings([...currentlyOpenInActive, activeRoot]);
    } else {
      const previouslySaved = nextSavedTabsByWorktree[activeWt];
      if (previouslySaved !== undefined) {
        const validSaved = previouslySaved.filter(id => {
          const meta = input.knownSessions.get(id);
          return meta !== undefined && meta.worktreeDirectory === activeWt;
        });
        desiredActiveTabs = dedupeStrings([...validSaved, ...currentlyOpenInActive, activeRoot]);
      } else {
        const seededFromWorktree = Array.from(input.knownSessions.values()).filter(meta => meta.worktreeDirectory === activeWt).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SCOPED_WORKTREE_TABS).map(meta => meta.id);
        desiredActiveTabs = dedupeStrings([...currentlyOpenInActive, ...seededFromWorktree, activeRoot]).slice(0, MAX_SCOPED_WORKTREE_TABS);
        if (!desiredActiveTabs.includes(activeRoot)) {
          desiredActiveTabs = [activeRoot, ...desiredActiveTabs.slice(0, MAX_SCOPED_WORKTREE_TABS - 1)];
        }
      }
    }
    nextSavedTabsByWorktree[activeWt] = [...desiredActiveTabs];
    const openSet = new Set(input.openTabs.map(t => t.sessionID));
    const toOpen = desiredActiveTabs.filter(id => !openSet.has(id));
    const currentlyActiveTab = input.openTabs.find(t => t.active)?.sessionID;
    const toFocus = currentlyActiveTab !== activeRoot ? activeRoot : undefined;
    const desiredSet = new Set(desiredActiveTabs);
    const toClose = [];
    for (const tab of input.openTabs) {
      const id = tab.sessionID;
      if (!id || id === activeRoot || desiredSet.has(id)) continue;
      const meta = input.knownSessions.get(id);
      // Only close tabs known to belong to another worktree; never touch unhydrated or deleted tabs
      if (meta && meta.worktreeDirectory !== activeWt) {
        toClose.push(id);
      }
    }
    let moves = [];
    if (!hasPendingUnknownOpenTab) {
      const closedSet = new Set(toClose);
      const simAfterOpenClose = [...input.openTabs.map(t => t.sessionID).filter(id => Boolean(id) && !closedSet.has(id) && !deleted?.has(id)), ...toOpen];
      moves = computeMinimalTabMoves(simAfterOpenClose, desiredActiveTabs);
    }
    return {
      toOpen,
      ...(toFocus ? {
        toFocus
      } : {}),
      toClose,
      moves,
      nextScopedWorktreeDirectory: activeWt,
      nextSavedTabsByWorktree
    };
  }

  // `mode === "grouped"`
  const openSet = new Set(input.openTabs.map(t => t.sessionID));
  const toOpen = [];
  if (input.previousMode === "scoped") {
    const candidates = [];
    for (const ids of Object.values(nextSavedTabsByWorktree)) {
      for (const id of ids) {
        const meta = input.knownSessions.get(id);
        if (!meta) continue;
        if (!input.showAllGitProjects && input.activeProjectID && meta.projectID !== input.activeProjectID) {
          continue;
        }
        candidates.push(id);
      }
    }
    for (const id of dedupeStrings(candidates)) {
      if (openSet.size + toOpen.length >= MAX_RESTORED_GROUPED_TABS) break;
      if (!openSet.has(id)) {
        toOpen.push(id);
      }
    }
  }
  const effectiveOpenIDs = dedupeStrings([...input.openTabs.map(t => t.sessionID).filter(id => Boolean(id) && !deleted?.has(id)), ...toOpen]);
  const effectiveByWorktree = new Map();
  for (const id of effectiveOpenIDs) {
    const meta = input.knownSessions.get(id);
    if (!meta) continue;
    const list = effectiveByWorktree.get(meta.worktreeDirectory);
    if (list) {
      list.push(id);
    } else {
      effectiveByWorktree.set(meta.worktreeDirectory, [id]);
    }
  }
  if (input.previousMode === "grouped" && effectiveOpenIDs.length > 0) {
    for (const wtDir of Object.keys(nextSavedTabsByWorktree)) {
      if (!effectiveByWorktree.has(wtDir)) {
        nextSavedTabsByWorktree[wtDir] = [];
      }
    }
  }
  for (const [wtDir, ids] of effectiveByWorktree.entries()) {
    nextSavedTabsByWorktree[wtDir] = [...ids];
  }
  let moves = [];
  if (!hasPendingUnknownOpenTab && effectiveOpenIDs.length > 1) {
    const buckets = new Map();
    for (const id of effectiveOpenIDs) {
      const meta = input.knownSessions.get(id);
      if (!meta) continue;
      const key = `${meta.projectID}::${meta.worktreeDirectory}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.sessionIDs.push(id);
      } else {
        buckets.set(key, {
          projectID: meta.projectID,
          projectCanonical: meta.projectCanonical,
          projectPinned: meta.projectPinned,
          worktreeDirectory: meta.worktreeDirectory,
          isCanonicalWorktree: meta.isCanonicalWorktree,
          sessionIDs: [id]
        });
      }
    }
    const sortedBuckets = Array.from(buckets.values()).sort((a, b) => {
      if (a.projectPinned !== b.projectPinned) {
        return a.projectPinned ? -1 : 1;
      }
      if (a.projectCanonical !== b.projectCanonical) {
        return a.projectCanonical.localeCompare(b.projectCanonical);
      }
      if (a.projectID !== b.projectID) {
        return a.projectID.localeCompare(b.projectID);
      }
      if (a.isCanonicalWorktree !== b.isCanonicalWorktree) {
        return a.isCanonicalWorktree ? -1 : 1;
      }
      return a.worktreeDirectory.localeCompare(b.worktreeDirectory);
    });
    const desiredOrder = sortedBuckets.flatMap(b => b.sessionIDs);
    moves = computeMinimalTabMoves(effectiveOpenIDs, desiredOrder);
  }
  return {
    toOpen,
    toClose: [],
    moves,
    nextScopedWorktreeDirectory: undefined,
    nextSavedTabsByWorktree
  };
}

import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import {
  DEFAULT_PREFERENCES,
  aggregateStatus,
  buildWorkspaceTree,
  computeMarqueeScrollX,
  computeMinimalTabMoves,
  computeSessionStatus,
  filterWorkspaceTreeForSwitcher,
  formatComposerWorkspaceBadge,
  formatSwitcherWorktreeLabel,
  isInvalidWorkspaceRoot,
  matchSessionWorktree,
  parseEditorCommand,
  parseGitPorcelainBranchStatus,
  parseGitWorktreePorcelain,
  planLeftTabsReconciliation,
  resolveWorkspaceNewSessionDirectory,
  rollupHiddenWorktreeStatus,
  type LeftTabSessionMeta,
} from "../src/model.js"
import { WorkspacesRpc } from "../src/rpc.js"

describe("parseGitPorcelainBranchStatus", () => {
  test("parses tracking branch, ahead/behind, and dirty file count", () => {
    const output = [
      "## feat/right-pane...origin/feat/right-pane [ahead 3, behind 1]",
      " M src/tui.tsx",
      "A  src/model.ts",
      "?? test/model.test.ts",
      "",
    ].join("\n")

    expect(parseGitPorcelainBranchStatus(output)).toEqual({
      branch: "feat/right-pane",
      ahead: 3,
      behind: 1,
      dirtyCount: 3,
    })
  })

  test("parses fresh repo and detached HEAD cleanly", () => {
    expect(
      parseGitPorcelainBranchStatus("## No commits yet on main\n?? README.md\n"),
    ).toEqual({
      branch: "main",
      ahead: 0,
      behind: 0,
      dirtyCount: 1,
    })

    expect(parseGitPorcelainBranchStatus("## HEAD (no branch)\n")).toEqual({
      branch: "detached",
      ahead: 0,
      behind: 0,
      dirtyCount: 0,
    })
  })
})

describe("parseGitWorktreePorcelain", () => {
  test("discovers active worktrees and skips bare or prunable entries", () => {
    const porcelain = [
      "worktree /code/alpha",
      "HEAD 1111111111111111111111111111111111111111",
      "branch refs/heads/main",
      "",
      "worktree /code/alpha-wt-feat",
      "HEAD 2222222222222222222222222222222222222222",
      "branch refs/heads/feat/login",
      "",
      "worktree /code/alpha-wt-stale",
      "HEAD 3333333333333333333333333333333333333333",
      "branch refs/heads/old",
      "prunable gitdir file points to non-existent location",
      "",
      "worktree /code/bare.git",
      "bare",
      "",
    ].join("\n")

    expect(parseGitWorktreePorcelain(porcelain)).toEqual([
      {
        directory: "/code/alpha",
        branch: "main",
        head: "1111111111111111111111111111111111111111",
      },
      {
        directory: "/code/alpha-wt-feat",
        branch: "feat/login",
        head: "2222222222222222222222222222222222222222",
      },
    ])
  })
})

describe("isInvalidWorkspaceRoot", () => {
  test("rejects root filesystem, home directories, and /tmp", () => {
    expect(isInvalidWorkspaceRoot("/")).toBe(true)
    expect(isInvalidWorkspaceRoot("/Users/dev")).toBe(true)
    expect(isInvalidWorkspaceRoot("/home/alice")).toBe(true)
    expect(isInvalidWorkspaceRoot("/tmp")).toBe(true)
    expect(isInvalidWorkspaceRoot("/Users/dev/code/projects/app")).toBe(
      false,
    )
  })
})

describe("status computation & matchSessionWorktree", () => {
  test("prioritizes permission > form > working > idle", () => {
    expect(
      computeSessionStatus({ running: true, permissionsCount: 1, formsCount: 1 }),
    ).toEqual({ status: "blocked", detail: "permission" })

    expect(
      aggregateStatus([
        { status: "idle" },
        { status: "working", statusDetail: "running" },
        { status: "blocked", statusDetail: "form" },
      ]),
    ).toEqual({ status: "blocked", detail: "form" })
  })

  test("rollupHiddenWorktreeStatus omits status already visible on unfolded child sessions", () => {
    const sessions = [
      {
        id: "s-ask",
        projectID: "p1",
        title: "Needs answer",
        directory: "/code/repo",
        status: "blocked" as const,
        statusDetail: "form" as const,
        isCurrent: true,
        updatedAt: 20,
      },
      {
        id: "s-busy",
        projectID: "p1",
        title: "Background build",
        directory: "/code/repo",
        status: "working" as const,
        statusDetail: "running" as const,
        isCurrent: false,
        updatedAt: 10,
      },
    ]

    // Folded (no child sessions rendered): rolls up full worktree status
    expect(rollupHiddenWorktreeStatus({ sessions }, [])).toEqual({
      status: "blocked",
      detail: "form",
    })

    // Unfolded (all child sessions rendered): parent row stays idle so ! / ask is not duplicated
    expect(rollupHiddenWorktreeStatus({ sessions }, sessions)).toEqual({
      status: "idle",
      detail: undefined,
    })

    // Partially surfaced: rolls up only the still-hidden session
    expect(rollupHiddenWorktreeStatus({ sessions }, [sessions[0]!])).toEqual({
      status: "working",
      detail: "running",
    })
  })

  test("picks longest matching worktree prefix", () => {
    const canonical = "/code/repo"
    const known = ["/code/repo", "/code/repo/.worktrees/feat-auth"]
    expect(matchSessionWorktree("/code/repo/packages/api", known, canonical)).toBe(
      "/code/repo",
    )
    expect(
      matchSessionWorktree(
        "/code/repo/.worktrees/feat-auth/packages/api",
        known,
        canonical,
      ),
    ).toBe("/code/repo/.worktrees/feat-auth")
  })
})

describe("buildWorkspaceTree", () => {
  test("excludes non-git / home / root folders and idle single-branch repos by default", () => {
    const tree = buildWorkspaceTree({
      projects: [
        {
          id: "global-root",
          canonical: "/",
          time: { created: 1, updated: 9999 },
        },
        {
          id: "home-dir",
          canonical: "/Users/dev",
          time: { created: 1, updated: 9998 },
        },
        {
          id: "non-git-parent",
          canonical: "/Users/dev/code/projects",
          time: { created: 1, updated: 9997 },
        },
        {
          id: "dusty-vault",
          canonical: "/Users/dev/notes",
          vcs: "git",
          time: { created: 1, updated: 9996 },
        },
        {
          id: "multi-wt-repo",
          canonical: "/Users/dev/code/projects/terminal",
          vcs: "git",
          time: { created: 1, updated: 500 },
        },
      ],
      sessions: [],
      sessionRuntime: {},
      worktreesByProject: {},
      gitWorktreesByRoot: {
        "/Users/dev/code/projects/terminal": [
          {
            directory: "/Users/dev/code/projects/terminal",
            branch: "main",
          },
          {
            directory: "/Users/dev/code/projects/terminal-profile",
            branch: "user-profile-page",
          },
        ],
      },
      gitByDirectory: {
        "/Users/dev/notes": {
          branch: "main",
          dirtyCount: 94,
          ahead: 0,
          behind: 0,
        },
        "/Users/dev/code/projects/terminal": {
          branch: "main",
          dirtyCount: 0,
          ahead: 0,
          behind: 0,
        },
        "/Users/dev/code/projects/terminal-profile": {
          branch: "user-profile-page",
          dirtyCount: 3,
          ahead: 0,
          behind: 0,
        },
      },
      prefs: DEFAULT_PREFERENCES,
      currentDirectory: "/Users/dev/code/projects",
    })

    // Only `terminal` (which actually has 2 Git worktrees) appears!
    // `/`, `/Users/dev`, non-git `projects`, and idle single-branch `notes` are all excluded!
    expect(tree.projects.map((p) => p.id)).toEqual(["multi-wt-repo"])
    expect(tree.projects[0]!.worktrees.map((w) => w.label)).toEqual([
      "main",
      "user-profile-page",
    ])
  })

  test("includes current Git repo even with a single checkout and never labels it 'root'", () => {
    const tree = buildWorkspaceTree({
      projects: [
        {
          id: "current-repo",
          canonical: "/code/opencode-workspaces",
          vcs: "git",
          time: { created: 1, updated: 500 },
        },
      ],
      sessions: [],
      sessionRuntime: {},
      worktreesByProject: {},
      gitByDirectory: {
        "/code/opencode-workspaces": {
          branch: "main",
          dirtyCount: 0,
          ahead: 0,
          behind: 0,
        },
      },
      prefs: DEFAULT_PREFERENCES,
      currentDirectory: "/code/opencode-workspaces",
    })

    expect(tree.projects).toHaveLength(1)
    expect(tree.projects[0]!.worktrees[0]!.label).toBe("main")
    expect(tree.projects[0]!.worktrees[0]!.isCurrent).toBe(true)
  })

  test("currentProjectOnly strictly shows only the active repository and ignores other multi-worktree or pinned repos", () => {
    const tree = buildWorkspaceTree({
      projects: [
        {
          id: "opencode-workspaces",
          canonical: "/code/opencode-workspaces",
          vcs: "git",
          time: { created: 1, updated: 500 },
        },
        {
          id: "opencode-setup",
          canonical: "/code/opencode-setup",
          vcs: "git",
          time: { created: 1, updated: 900 },
        },
      ],
      sessions: [
        {
          id: "sess-active",
          projectID: "opencode-workspaces",
          title: "Testing sidebar",
          time: { created: 10, updated: 20 },
          location: { directory: "/code/opencode-workspaces/test-workspaces/workspace-1" },
        },
        {
          id: "sess-deleted-wt",
          projectID: "opencode-workspaces",
          time: { created: 1, updated: 5 },
          location: { directory: "/Users/dev/.local/share/opencode/worktree/6d16733/deleted-wt" },
        },
      ],
      sessionRuntime: {},
      worktreesByProject: {
        "opencode-workspaces": [
          "/code/opencode-workspaces/test-workspaces/workspace-1",
          "/code/opencode-workspaces/test-workspaces/workspace-2",
        ],
        "opencode-setup": [
          "/code/opencode-setup-wt1",
          "/code/opencode-setup-wt2",
        ],
      },
      gitByDirectory: {
        "/code/opencode-workspaces": { branch: "main", dirtyCount: 1, ahead: 0, behind: 0 },
        "/code/opencode-workspaces/test-workspaces/workspace-1": {
          branch: "test/workspace-1",
          dirtyCount: 0,
          ahead: 0,
          behind: 0,
        },
        "/code/opencode-workspaces/test-workspaces/workspace-2": {
          branch: "test/workspace-2",
          dirtyCount: 0,
          ahead: 0,
          behind: 0,
        },
        "/code/opencode-setup": { branch: "main", dirtyCount: 0, ahead: 0, behind: 0 },
      },
      prefs: {
        ...DEFAULT_PREFERENCES,
        pinnedProjects: ["/code/opencode-setup"],
        collapsedProjects: ["opencode-workspaces"],
      },
      currentSessionID: "sess-active",
      currentDirectory: "/code/opencode-workspaces/test-workspaces/workspace-1",
      currentProjectOnly: true,
    })

    // Strictly only `opencode-workspaces` (and forced uncollapsed), excluding `opencode-setup` and deleted ghost worktree
    expect(tree.projects.map((p) => p.id)).toEqual(["opencode-workspaces"])
    expect(tree.projects[0]!.collapsed).toBe(false)
    expect(tree.projects[0]!.worktrees.map((w) => w.label)).toEqual([
      "main",
      "test/workspace-1",
      "test/workspace-2",
    ])
    expect(tree.projects[0]!.worktrees[1]!.isCurrent).toBe(true)
  })

  test("preserves nested worktree sessions on OpenCode v2 startup before async worktree discovery completes", () => {
    const tree = buildWorkspaceTree({
      projects: [
        {
          id: "opencode-workspaces",
          canonical: "/code/opencode-workspaces",
          vcs: "git",
          sandboxes: [],
          time: { created: 1, updated: 500 },
        },
      ],
      sessions: [
        {
          id: "sess-main",
          projectID: "opencode-workspaces",
          title: "Main session",
          time: { created: 1, updated: 10 },
          location: { directory: "/code/opencode-workspaces" },
        },
        {
          id: "sess-nested-wt",
          projectID: "opencode-workspaces",
          title: "Nested worktree session",
          time: { created: 2, updated: 20 },
          location: {
            directory: "/code/opencode-workspaces/test-workspaces/workspace-1",
          },
        },
      ],
      sessionRuntime: {},
      worktreesByProject: {},
      gitWorktreesByRoot: {},
      gitByDirectory: {},
      prefs: DEFAULT_PREFERENCES,
      currentSessionID: "sess-nested-wt",
      currentDirectory: "/code/opencode-workspaces/test-workspaces/workspace-1",
      currentProjectOnly: true,
    })

    expect(tree.projects).toHaveLength(1)
    const wts = tree.projects[0]!.worktrees
    expect(wts.map((w) => w.directory)).toEqual([
      "/code/opencode-workspaces",
      "/code/opencode-workspaces/test-workspaces/workspace-1",
    ])
    expect(wts[0]!.isCurrent).toBe(false)
    expect(wts[1]!.isCurrent).toBe(true)
    expect(wts[1]!.label).toBe("workspace-1")
  })
})

describe("WorkspacesRpc schema validation", () => {
  test("validates input and output via StandardSchemaV1 and encodes cleanly as Effect Schema.Json", () => {
    const encodeJson = Schema.encodeUnknownSync(Schema.Json)
    const emptySummary = parseGitPorcelainBranchStatus("")
    const normalSummary = parseGitPorcelainBranchStatus("## main\n M file.ts\n")
    const wtList = parseGitWorktreePorcelain("worktree /code/alpha\ndetached\n")

    expect(() => encodeJson(emptySummary as any)).not.toThrow()
    expect(() => encodeJson(normalSummary as any)).not.toThrow()
    expect(() => encodeJson(wtList as any)).not.toThrow()

    const outSchema = WorkspacesRpc.methods.inspectLocations.output
    const valid = outSchema["~standard"].validate({
      summaries: {
        "/code/alpha": normalSummary,
        "/code/empty": emptySummary,
      },
      worktreesByRoot: {
        "/code/alpha": [{ directory: "/code/alpha", branch: "main" }, ...wtList],
      },
    })
    expect("value" in valid).toBe(true)
    if ("value" in valid) {
      expect(valid.value.worktreesByRoot["/code/alpha"]).toHaveLength(2)
      expect(() => encodeJson(valid.value as any)).not.toThrow()
    }
  })
})

describe("filterWorkspaceTreeForSwitcher", () => {
  const sampleTree = buildWorkspaceTree({
    projects: [
      {
        id: "repo-1",
        canonical: "/code/opencode-workspaces",
        vcs: "git",
        time: { created: 1, updated: 500 },
      },
    ],
    sessions: [
      {
        id: "sess-main",
        projectID: "repo-1",
        title: "Session E4NBPM",
        time: { created: 10, updated: 30 },
        location: { directory: "/code/opencode-workspaces" },
      },
      {
        id: "sess-wt1-a",
        projectID: "repo-1",
        title: "Session HER0cM",
        time: { created: 11, updated: 40 },
        location: { directory: "/code/opencode-workspaces-wt1" },
      },
      {
        id: "sess-wt1-b",
        projectID: "repo-1",
        title: "Refactor switcher spacing",
        time: { created: 12, updated: 50 },
        location: { directory: "/code/opencode-workspaces-wt1" },
      },
    ],
    sessionRuntime: {},
    worktreesByProject: {
      "repo-1": ["/code/opencode-workspaces-wt1"],
    },
    gitByDirectory: {
      "/code/opencode-workspaces": { branch: "main", dirtyCount: 7, ahead: 0, behind: 0 },
      "/code/opencode-workspaces-wt1": {
        branch: "test/workspace-1",
        dirtyCount: 0,
        ahead: 0,
        behind: 0,
      },
    },
    prefs: DEFAULT_PREFERENCES,
    currentSessionID: "sess-main",
    currentDirectory: "/code/opencode-workspaces",
  })

  test("preserves full hierarchy and marks last session connectors when query is empty", () => {
    const res = filterWorkspaceTreeForSwitcher(sampleTree.projects, "")
    expect(res.projects).toHaveLength(1)
    expect(res.projects[0]!.worktrees).toHaveLength(2)
    const sessionRows = res.selectableRows.filter((r) => r.kind === "session")
    expect(sessionRows.map((r) => [r.session.id, r.isLastSession])).toEqual([
      ["sess-main", true],
      ["sess-wt1-b", false],
      ["sess-wt1-a", true],
    ])
  })

  test("matching a branch keeps child sessions and marks worktree as directlyMatched", () => {
    const res = filterWorkspaceTreeForSwitcher(sampleTree.projects, "workspace-1")
    expect(res.projects[0]!.worktrees).toHaveLength(1)
    expect(res.projects[0]!.worktrees[0]!.worktree.label).toBe("test/workspace-1")
    expect(res.projects[0]!.worktrees[0]!.sessions).toHaveLength(2)

    const firstDirect = res.selectableRows.find((r) => r.directlyMatched)
    expect(firstDirect?.kind).toBe("worktree")
    if (firstDirect?.kind === "worktree") {
      expect(firstDirect.worktree.label).toBe("test/workspace-1")
    }
  })

  test("matching a session keeps parent worktree header and marks session as directlyMatched", () => {
    const res = filterWorkspaceTreeForSwitcher(sampleTree.projects, "HER0cM")
    expect(res.projects[0]!.worktrees).toHaveLength(1)
    expect(res.projects[0]!.worktrees[0]!.worktree.label).toBe("test/workspace-1")
    expect(res.projects[0]!.worktrees[0]!.sessions.map((s) => s.title)).toEqual([
      "Session HER0cM",
    ])

    const firstDirect = res.selectableRows.find((r) => r.directlyMatched)
    expect(firstDirect?.kind).toBe("session")
    if (firstDirect?.kind === "session") {
      expect(firstDirect.session.title).toBe("Session HER0cM")
    }
  })

  test("labels canonical repo folder as 'Project sessions' with muted branch tag while preserving secondary worktree labels", () => {
    const [canonicalWt, secondaryWt] = sampleTree.projects[0]!.worktrees
    expect(
      formatSwitcherWorktreeLabel({
        ...canonicalWt!,
        branch: "feat/hover-fix",
        label: "feat/hover-fix",
      }),
    ).toEqual({
      title: "Project sessions",
      subtitle: "⎇ feat/hover-fix",
    })

    expect(formatSwitcherWorktreeLabel(secondaryWt!)).toEqual({
      title: "test/workspace-1",
      subtitle: "opencode-workspaces-wt1",
    })

    // Querying "project" in /ws matches the canonical "Project sessions" group
    const byProjectSessions = filterWorkspaceTreeForSwitcher(
      sampleTree.projects,
      "project sessions",
    )
    expect(byProjectSessions.projects[0]!.worktrees).toHaveLength(1)
    expect(byProjectSessions.projects[0]!.worktrees[0]!.worktree.isCanonical).toBe(
      true,
    )
  })
})

describe("resolveWorkspaceNewSessionDirectory", () => {
  test("prefers explicit worktree > current worktree > active session > selected workspace > launch directory", () => {
    expect(
      resolveWorkspaceNewSessionDirectory({
        explicitWorktreeDirectory:
          "/Users/dev/opencode-workspaces/test-workspaces/workspace-2/",
        currentWorktreeDirectory:
          "/Users/dev/opencode-workspaces/test-workspaces/workspace-1",
        activeSessionDirectory: "/Users/dev/opencode-workspaces",
        selectedWorkspaceDirectory: "/Users/dev/opencode-workspaces",
        launchDirectory: "/Users/dev/opencode-workspaces",
      }),
    ).toBe("/Users/dev/opencode-workspaces/test-workspaces/workspace-2")

    expect(
      resolveWorkspaceNewSessionDirectory({
        currentWorktreeDirectory:
          "/Users/dev/opencode-workspaces/test-workspaces/workspace-1/",
        activeSessionDirectory: "/Users/dev/opencode-workspaces",
        launchDirectory: "/Users/dev/opencode-workspaces",
      }),
    ).toBe("/Users/dev/opencode-workspaces/test-workspaces/workspace-1")
  })

  test("falls back to remembered selectedWorkspaceDirectory when on Home screen (no active session)", () => {
    expect(
      resolveWorkspaceNewSessionDirectory({
        activeSessionDirectory: undefined,
        selectedWorkspaceDirectory:
          "/Users/dev/opencode-workspaces/test-workspaces/workspace-1",
        launchDirectory: "/Users/dev/opencode-workspaces",
      }),
    ).toBe("/Users/dev/opencode-workspaces/test-workspaces/workspace-1")
  })

  test("skips invalid workspace roots such as / or /tmp", () => {
    expect(
      resolveWorkspaceNewSessionDirectory({
        currentWorktreeDirectory: "/",
        activeSessionDirectory: "/tmp",
        selectedWorkspaceDirectory:
          "/Users/dev/opencode-workspaces/test-workspaces/workspace-1",
      }),
    ).toBe("/Users/dev/opencode-workspaces/test-workspaces/workspace-1")

    expect(
      resolveWorkspaceNewSessionDirectory({
        currentWorktreeDirectory: "/",
        launchDirectory: "/tmp",
      }),
    ).toBeUndefined()
  })
})

describe("computeMarqueeScrollX", () => {
  test("returns 0 when period <= 1 or during initial start hold", () => {
    expect(computeMarqueeScrollX(500, 0)).toBe(0)
    expect(computeMarqueeScrollX(500, 1)).toBe(0)
    expect(computeMarqueeScrollX(0, 12)).toBe(0)
    expect(computeMarqueeScrollX(279, 12)).toBe(0)
  })

  test("scrolls continuously in one direction and wraps modulo periodCols without reversing", () => {
    const opts = {
      holdStartMs: 250,
      stepMs: 50,
    }
    // periodCols = 6 (e.g. text + gap): steps 1, 2, 3, 4, 5, 0, 1, 2...
    expect(computeMarqueeScrollX(249, 6, opts)).toBe(0)
    expect(computeMarqueeScrollX(250, 6, opts)).toBe(1)
    expect(computeMarqueeScrollX(300, 6, opts)).toBe(2)
    expect(computeMarqueeScrollX(350, 6, opts)).toBe(3)
    expect(computeMarqueeScrollX(400, 6, opts)).toBe(4)
    expect(computeMarqueeScrollX(450, 6, opts)).toBe(5)
    // Seamless wrap directly from 5 -> 0 -> 1 (never glides backward 5 -> 4 -> 3)
    expect(computeMarqueeScrollX(500, 6, opts)).toBe(0)
    expect(computeMarqueeScrollX(550, 6, opts)).toBe(1)
    expect(computeMarqueeScrollX(600, 6, opts)).toBe(2)
  })
})

describe("parseEditorCommand", () => {
  test("classifies GUI editors, strips blocking --wait/-w flags, and resolves macOS app names", () => {
    expect(parseEditorCommand("zed")).toEqual({
      binary: "zed",
      args: [],
      kind: "gui",
      macAppName: "Zed",
    })

    expect(parseEditorCommand("code --new-window --wait")).toEqual({
      binary: "code",
      args: ["--new-window"],
      kind: "gui",
      macAppName: "Visual Studio Code",
    })

    expect(
      parseEditorCommand(
        '"/Applications/Cursor.app/Contents/Resources/app/bin/cursor" -w -r',
      ),
    ).toEqual({
      binary: "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
      args: ["-r"],
      kind: "gui",
      macAppName: "Cursor",
    })
  })

  test("classifies terminal TTY editors and preserves arguments", () => {
    expect(parseEditorCommand("/opt/homebrew/bin/nvim -u NONE")).toEqual({
      binary: "/opt/homebrew/bin/nvim",
      args: ["-u", "NONE"],
      kind: "terminal",
      macAppName: undefined,
    })

    expect(parseEditorCommand("hx")).toEqual({
      binary: "hx",
      args: [],
      kind: "terminal",
      macAppName: undefined,
    })

    expect(parseEditorCommand("emacs -nw")).toEqual({
      binary: "emacs",
      args: ["-nw"],
      kind: "terminal",
      macAppName: undefined,
    })

    expect(parseEditorCommand("   ")).toBeUndefined()
  })

  test("WorkspacesRpc accepts optional rootDirectories alongside directories", () => {
    const validated = WorkspacesRpc.methods.inspectLocations.input[
      "~standard"
    ].validate({
      directories: ["/repo", "/repo/wt-1"],
      rootDirectories: ["/repo"],
    })
    expect("value" in validated && validated.value).toEqual({
      directories: ["/repo", "/repo/wt-1"],
      rootDirectories: ["/repo"],
    })
  })
})

describe("formatComposerWorkspaceBadge", () => {
  test("formats canonical checkout, secondary worktrees, and git status badges cleanly", () => {
    expect(
      formatComposerWorkspaceBadge({
        label: "Project sessions",
        sublabel: "⎇ main",
        branch: "main",
        isCanonical: true,
        dirtyCount: 3,
        ahead: 1,
        behind: 2,
      }),
    ).toEqual({
      primaryText: "⎇ main · Project sessions",
      gitBadge: "•3 ↑1 ↓2",
    })

    expect(
      formatComposerWorkspaceBadge({
        label: "test/workspace-1",
        sublabel: "workspace-1",
        branch: "test/workspace-1",
        isCanonical: false,
        dirtyCount: 0,
        ahead: 0,
        behind: 0,
      }),
    ).toEqual({
      primaryText: "⎇ test/workspace-1 · workspace-1",
    })

    expect(
      formatComposerWorkspaceBadge({
        label: "feat-auth",
        branch: "feat-auth",
        isCanonical: false,
        dirtyCount: 0,
        ahead: 0,
        behind: 0,
      }),
    ).toEqual({
      primaryText: "⎇ feat-auth",
    })
  })
})

describe("planLeftTabsReconciliation & computeMinimalTabMoves", () => {
  const repoCanon = "/repo/opencode-workspaces"
  const wt1 = "/repo/opencode-workspaces/test-workspaces/workspace-1"
  const wt2 = "/repo/opencode-workspaces/test-workspaces/workspace-2"

  const makeKnown = (): Map<string, LeftTabSessionMeta> =>
    new Map([
      [
        "main-1",
        {
          id: "main-1",
          projectID: "proj-1",
          worktreeDirectory: repoCanon,
          isCanonicalWorktree: true,
          projectPinned: false,
          projectCanonical: repoCanon,
          updatedAt: 100,
        },
      ],
      [
        "main-2",
        {
          id: "main-2",
          projectID: "proj-1",
          worktreeDirectory: repoCanon,
          isCanonicalWorktree: true,
          projectPinned: false,
          projectCanonical: repoCanon,
          updatedAt: 90,
        },
      ],
      [
        "wt1-1",
        {
          id: "wt1-1",
          projectID: "proj-1",
          worktreeDirectory: wt1,
          isCanonicalWorktree: false,
          projectPinned: false,
          projectCanonical: repoCanon,
          updatedAt: 200,
        },
      ],
      [
        "wt1-2",
        {
          id: "wt1-2",
          projectID: "proj-1",
          worktreeDirectory: wt1,
          isCanonicalWorktree: false,
          projectPinned: false,
          projectCanonical: repoCanon,
          updatedAt: 150,
        },
      ],
      [
        "wt2-1",
        {
          id: "wt2-1",
          projectID: "proj-1",
          worktreeDirectory: wt2,
          isCanonicalWorktree: false,
          projectPinned: false,
          projectCanonical: repoCanon,
          updatedAt: 180,
        },
      ],
    ])

  test("computeMinimalTabMoves transforms shuffled tabs into desired order with zero moves when already ordered", () => {
    expect(computeMinimalTabMoves(["a", "b", "c"], ["a", "b", "c"])).toEqual([])

    const current = ["wt1-1", "main-1", "wt1-2", "main-2"]
    const desired = ["main-1", "main-2", "wt1-1", "wt1-2"]
    const moves = computeMinimalTabMoves(current, desired)
    expect(moves.length).toBeGreaterThan(0)

    const sim = [...current]
    for (const mv of moves) {
      const idx = sim.indexOf(mv.sessionID)
      sim.splice(idx, 1)
      sim.splice(mv.index, 0, mv.sessionID)
    }
    expect(sim).toEqual(desired)
  })

  test("scoped mode swaps tabs per worktree, remembers closed tabs, and preserves unhydrated tabs", () => {
    const known = makeKnown()

    // 1. Entering wt1 from mixed open tabs [main-1, main-2, wt1-1, unhydrated-tab]:
    //    saves main's tabs, seeds wt1's [wt1-1, wt1-2], closes main's tabs, and leaves unhydrated-tab untouched!
    const step1 = planLeftTabsReconciliation({
      mode: "scoped",
      openTabs: [
        { sessionID: "main-1", active: false },
        { sessionID: "main-2", active: false },
        { sessionID: "wt1-1", active: true },
        { sessionID: "unhydrated-tab", active: false },
      ],
      knownSessions: known,
      activeRootSessionID: "wt1-1",
      activeWorktreeDirectory: wt1,
      activeProjectID: "proj-1",
      savedTabsByWorktree: {},
    })

    expect(step1.toOpen).toEqual(["wt1-2"])
    expect(step1.toClose).toEqual(["main-1", "main-2"])
    expect(step1.toFocus).toBeUndefined()
    expect(step1.nextSavedTabsByWorktree[repoCanon]).toEqual([
      "main-1",
      "main-2",
    ])
    expect(step1.nextSavedTabsByWorktree[wt1]).toEqual(["wt1-1", "wt1-2"])

    // 2. User closes 'wt1-2' while staying inside wt1 -> does NOT resurrect 'wt1-2'
    const step2 = planLeftTabsReconciliation({
      mode: "scoped",
      openTabs: [{ sessionID: "wt1-1", active: true }],
      knownSessions: known,
      activeRootSessionID: "wt1-1",
      activeWorktreeDirectory: wt1,
      activeProjectID: "proj-1",
      previousMode: "scoped",
      previousScopedWorktreeDirectory: step1.nextScopedWorktreeDirectory,
      savedTabsByWorktree: step1.nextSavedTabsByWorktree,
    })

    expect(step2.toOpen).toEqual([])
    expect(step2.toClose).toEqual([])
    expect(step2.nextSavedTabsByWorktree[wt1]).toEqual(["wt1-1"])

    // 3. Switch to main -> restores [main-1, main-2] and closes [wt1-1]
    const step3 = planLeftTabsReconciliation({
      mode: "scoped",
      openTabs: [
        { sessionID: "wt1-1", active: false },
        { sessionID: "main-1", active: true },
      ],
      knownSessions: known,
      activeRootSessionID: "main-1",
      activeWorktreeDirectory: repoCanon,
      activeProjectID: "proj-1",
      previousMode: "scoped",
      previousScopedWorktreeDirectory: step2.nextScopedWorktreeDirectory,
      savedTabsByWorktree: step2.nextSavedTabsByWorktree,
    })

    expect(step3.toOpen).toEqual(["main-2"])
    expect(step3.toClose).toEqual(["wt1-1"])

    // 4. Switch back to wt1 -> restores only ['wt1-1'] (respects user closing 'wt1-2')
    const step4 = planLeftTabsReconciliation({
      mode: "scoped",
      openTabs: [
        { sessionID: "main-1", active: false },
        { sessionID: "main-2", active: false },
        { sessionID: "wt1-1", active: true },
      ],
      knownSessions: known,
      activeRootSessionID: "wt1-1",
      activeWorktreeDirectory: wt1,
      activeProjectID: "proj-1",
      previousMode: "scoped",
      previousScopedWorktreeDirectory: step3.nextScopedWorktreeDirectory,
      savedTabsByWorktree: step3.nextSavedTabsByWorktree,
    })

    expect(step4.toOpen).toEqual([])
    expect(step4.toClose).toEqual(["main-1", "main-2"])
  })

  test("grouped mode restores saved tabs when toggled from scoped and clusters stably by worktree without cursor-jumping", () => {
    const known = makeKnown()

    const grouped = planLeftTabsReconciliation({
      mode: "grouped",
      openTabs: [{ sessionID: "wt2-1", active: true }],
      knownSessions: known,
      activeRootSessionID: "wt2-1",
      activeWorktreeDirectory: wt2,
      activeProjectID: "proj-1",
      previousMode: "scoped",
      previousScopedWorktreeDirectory: wt2,
      savedTabsByWorktree: {
        [wt2]: ["wt2-1"],
        [repoCanon]: ["main-2", "main-1"],
        [wt1]: ["wt1-1"],
      },
    })

    expect(grouped.toClose).toEqual([])
    expect(grouped.toOpen).toEqual(["main-2", "main-1", "wt1-1"])

    // Simulate applying `toOpen` + `moves`
    const sim = ["wt2-1", ...grouped.toOpen]
    for (const mv of grouped.moves) {
      const idx = sim.indexOf(mv.sessionID)
      sim.splice(idx, 1)
      sim.splice(mv.index, 0, mv.sessionID)
    }
    // Canonical first (preserving [main-2, main-1] relative order), then wt1, then wt2!
    expect(sim).toEqual(["main-2", "main-1", "wt1-1", "wt2-1"])

    // Clicking another tab (e.g. main-2) in grouped mode produces ZERO moves (no cursor jumping!)
    const afterClick = planLeftTabsReconciliation({
      mode: "grouped",
      openTabs: sim.map((id) => ({ sessionID: id, active: id === "main-2" })),
      knownSessions: known,
      activeRootSessionID: "main-2",
      activeWorktreeDirectory: repoCanon,
      activeProjectID: "proj-1",
      previousMode: "grouped",
      savedTabsByWorktree: grouped.nextSavedTabsByWorktree,
    })
    expect(afterClick.toOpen).toEqual([])
    expect(afterClick.moves).toEqual([])
  })
})

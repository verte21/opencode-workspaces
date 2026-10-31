import { describe, expect, test } from "bun:test"
import {
  DEFAULT_PREFERENCES,
  aggregateStatus,
  buildWorkspaceTree,
  computeSessionStatus,
  matchSessionWorktree,
  parseGitPorcelainBranchStatus,
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

  test("parses fresh repo with no commits yet", () => {
    expect(parseGitPorcelainBranchStatus("## No commits yet on main\n?? README.md\n")).toEqual({
      branch: "main",
      ahead: 0,
      behind: 0,
      dirtyCount: 1,
    })
  })

  test("parses detached HEAD cleanly", () => {
    expect(parseGitPorcelainBranchStatus("## HEAD (no branch)\n")).toEqual({
      branch: "HEAD",
      ahead: 0,
      behind: 0,
      dirtyCount: 0,
    })
  })
})

describe("status computation & precedence", () => {
  test("prioritizes permission > form > working > idle", () => {
    const perm = computeSessionStatus({
      running: true,
      permissionsCount: 1,
      formsCount: 1,
    })
    expect(perm).toEqual({ status: "blocked", detail: "permission" })

    const form = computeSessionStatus({
      running: true,
      permissionsCount: 0,
      formsCount: 2,
    })
    expect(form).toEqual({ status: "blocked", detail: "form" })

    const working = computeSessionStatus({
      running: true,
      permissionsCount: 0,
      formsCount: 0,
    })
    expect(working).toEqual({ status: "working", detail: "running" })

    const idle = computeSessionStatus({
      running: false,
      permissionsCount: 0,
      formsCount: 0,
    })
    expect(idle).toEqual({ status: "idle" })

    expect(
      aggregateStatus([
        { status: "idle" },
        { status: "working", statusDetail: "running" },
        { status: "blocked", statusDetail: "form" },
      ]),
    ).toEqual({ status: "blocked", detail: "form" })
  })
})

describe("matchSessionWorktree", () => {
  test("picks longest matching worktree prefix and preserves external worktree paths", () => {
    const canonical = "/Users/dev/repo"
    const known = ["/Users/dev/repo", "/Users/dev/repo/.worktrees/feat-auth"]

    expect(
      matchSessionWorktree("/Users/dev/repo/packages/api", known, canonical),
    ).toBe("/Users/dev/repo")

    expect(
      matchSessionWorktree(
        "/Users/dev/repo/.worktrees/feat-auth/packages/api",
        known,
        canonical,
      ),
    ).toBe("/Users/dev/repo/.worktrees/feat-auth")

    expect(
      matchSessionWorktree("/Users/dev/repo-wt-external", known, canonical),
    ).toBe("/Users/dev/repo-wt-external")
  })
})

describe("buildWorkspaceTree", () => {
  const projects = [
    {
      id: "proj-alpha",
      canonical: "/code/alpha",
      name: "alpha",
      time: { created: 100, updated: 500, active: 500 },
    },
    {
      id: "proj-beta",
      canonical: "/code/beta",
      name: "beta",
      time: { created: 100, updated: 1000, active: 1000 },
    },
    {
      id: "proj-gamma",
      canonical: "/code/gamma",
      name: "gamma",
      time: { created: 100, updated: 200, active: 200 },
    },
  ]

  test("preserves pinned order, groups worktrees & root sessions, and assigns quick slots 1..9", () => {
    const tree = buildWorkspaceTree({
      projects,
      sessions: [
        {
          id: "sess-1",
          projectID: "proj-alpha",
          title: "Implement auth",
          time: { created: 100, updated: 600 },
          location: { directory: "/code/alpha-wt-auth" },
        },
        {
          id: "sess-subagent",
          parentID: "sess-1",
          projectID: "proj-alpha",
          title: "Subagent task",
          time: { created: 110, updated: 610 },
          location: { directory: "/code/alpha-wt-auth" },
        },
        {
          id: "sess-archived",
          projectID: "proj-alpha",
          title: "Old session",
          time: { created: 50, updated: 90, archived: 95 },
          location: { directory: "/code/alpha" },
        },
        {
          id: "sess-2",
          projectID: "proj-beta",
          title: "Fix bug",
          time: { created: 200, updated: 900 },
          location: { directory: "/code/beta/packages/ui" },
        },
      ],
      sessionRuntime: {
        "sess-1": { running: true, permissionsCount: 0, formsCount: 0 },
        "sess-2": { running: false, permissionsCount: 1, formsCount: 0 },
      },
      worktreesByProject: {
        "proj-alpha": ["/code/alpha-wt-auth"],
      },
      gitByDirectory: {
        "/code/alpha": { branch: "main", dirtyCount: 0, ahead: 0, behind: 0 },
        "/code/alpha-wt-auth": {
          branch: "feat/auth",
          dirtyCount: 4,
          ahead: 1,
          behind: 0,
        },
        "/code/beta": { branch: "main", dirtyCount: 2, ahead: 0, behind: 0 },
      },
      prefs: {
        ...DEFAULT_PREFERENCES,
        pinnedProjects: ["/code/alpha"],
      },
      currentSessionID: "sess-1",
    })

    // Pinned alpha stays ahead of newer unpinned beta
    expect(tree.projects.map((p) => p.id)).toEqual([
      "proj-alpha",
      "proj-beta",
      "proj-gamma",
    ])

    const alpha = tree.projects[0]!
    expect(alpha.pinned).toBe(true)
    expect(alpha.isCurrent).toBe(true)
    expect(alpha.totalSessions).toBe(1) // excludes subagent & archived
    expect(alpha.status).toBe("working")
    expect(alpha.worktrees.map((w) => w.directory)).toEqual([
      "/code/alpha",
      "/code/alpha-wt-auth",
    ])

    // Subfolder session in beta grouped under canonical /code/beta
    const beta = tree.projects[1]!
    expect(beta.status).toBe("blocked")
    expect(beta.worktrees).toHaveLength(1)
    expect(beta.worktrees[0]!.sessions[0]!.id).toBe("sess-2")

    // Quick slots 1..4 map deterministically to visible worktrees
    expect(tree.quickSlots.get(1)?.directory).toBe("/code/alpha")
    expect(tree.quickSlots.get(2)?.directory).toBe("/code/alpha-wt-auth")
    expect(tree.quickSlots.get(3)?.directory).toBe("/code/beta")
    expect(tree.quickSlots.get(4)?.directory).toBe("/code/gamma")

    expect(tree.summary).toEqual({
      totalProjects: 3,
      totalWorktrees: 4,
      workingSessions: 1,
      blockedSessions: 1,
    })
  })

  test("hides unpinned idle projects when showIdleProjects is false while keeping active ones", () => {
    const tree = buildWorkspaceTree({
      projects,
      sessions: [
        {
          id: "sess-beta",
          projectID: "proj-beta",
          title: "Running build",
          time: { created: 100, updated: 900 },
          location: { directory: "/code/beta" },
        },
      ],
      sessionRuntime: {
        "sess-beta": { running: true, permissionsCount: 0, formsCount: 0 },
      },
      worktreesByProject: {},
      gitByDirectory: {},
      prefs: {
        ...DEFAULT_PREFERENCES,
        pinnedProjects: ["/code/alpha"],
        showIdleProjects: false,
      },
    })

    // alpha (pinned) + beta (working) remain; idle unpinned gamma is hidden
    expect(tree.projects.map((p) => p.id)).toEqual(["proj-alpha", "proj-beta"])
  })
})

describe("WorkspacesRpc schema validation", () => {
  test("validates input and output via StandardSchemaV1", () => {
    const inputSchema = WorkspacesRpc.methods.inspectLocations.input
    const valid = inputSchema["~standard"].validate({
      directories: ["/code/alpha", "/code/beta"],
    })
    expect("value" in valid && valid.value).toEqual({
      directories: ["/code/alpha", "/code/beta"],
    })

    const invalid = inputSchema["~standard"].validate("nope")
    expect("issues" in invalid && invalid.issues?.length).toBe(1)
  })
})

import { describe, expect, test } from "bun:test"
import { ensureSolidTransformPlugin } from "@opentui/solid/bun-plugin"

ensureSolidTransformPlugin()

describe("TuiPlugin UI & hot-reload integration", () => {
  test("survives legacy hot-reload cache, renders '+ New session' row, clicks to spawn in current worktree, and marquees long branch names on hover", async () => {
    const { ensureRuntimePluginSupport } = await import(
      "@opentui/solid/runtime-plugin-support/configure"
    )
    const { ensurePluginRuntime } = await import("@opencode/plugin/runtime")
    const { testRender } = await import("@opentui/solid")
    const { createStore, produce } = await import("solid-js/store")

    const runtimeMods = ensurePluginRuntime()
    ensureRuntimePluginSupport({
      additional: Object.fromEntries(
        Object.entries(runtimeMods).map(([k, loader]) => [
          k,
          (loader as () => any)(),
        ]),
      ) as Record<string, any>,
    })

    const { default: TuiPlugin } = await import("../src/tui.js")

    const makeThemeToken = (): any =>
      new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === Symbol.toPrimitive) return () => "#ffffff"
            if (
              prop === "base" ||
              prop === "muted" ||
              prop === "faint" ||
              prop === "selected" ||
              prop === "focused" ||
              prop === "hovered" ||
              prop === "disabled" ||
              prop === "low" ||
              prop === "high" ||
              typeof prop === "number" ||
              /^\d+$/.test(String(prop))
            ) {
              return "#aabbcc"
            }
            if (prop === "surface") return () => makeThemeToken()
            return makeThemeToken()
          },
        },
      )

    const slots: any[] = []
    const createdLocations: string[] = []
    const navigatedSessions: string[] = []

    const repoRoot = "/Users/dev/opencode-workspaces"
    const wt1Dir = "/Users/dev/opencode-workspaces/test-workspaces/workspace-1"
    const wtLongDir =
      "/Users/dev/opencode-workspaces/test-workspaces/workspace-long"
    const longBranch = "feat/very-long-workspace-branch-name-that-scrolls"

    const projects = [
      {
        id: "proj-1",
        canonical: repoRoot,
        vcs: "git",
        name: "opencode-workspaces",
        sandboxes: [wt1Dir, wtLongDir],
        time: { created: 1, updated: 2, active: 3 },
      },
    ]

    const sessions = [
      {
        id: "sess-main",
        projectID: "proj-1",
        title: "Main Greeting",
        time: { created: 1, updated: 3 },
        location: { directory: repoRoot },
      },
      {
        id: "sess-wt1",
        projectID: "proj-1",
        title: "Workspace 1 Session",
        time: { created: 1, updated: 4 },
        location: { directory: wt1Dir },
      },
      {
        id: "sess-wt1-old",
        projectID: "proj-1",
        title: "Secondary WT1 Session",
        time: { created: 1, updated: 2 },
        location: { directory: wt1Dir },
      },
    ]

    const renderSetup = await testRender(() => null as any, {
      width: 32,
      height: 24,
    })

    // Simulate hot-reloading over a pre-existing v1 store missing newer fields (`gitWorktreesByRoot`, `showAllGitProjects`)
    const [legacyPrefs, setLegacyPrefs] = createStore<any>({
      pinnedProjects: [],
      collapsedProjects: [],
      maxRecentProjects: 8,
    })
    const [legacyCache, setLegacyCache] = createStore<any>({
      worktreesByProject: {},
      gitByDirectory: {},
      lastSyncedAt: 0,
    })

    const mockContext: any = {
      options: {},
      location: { directory: repoRoot },
      app: { version: "2.2.5", channel: "latest" },
      renderer: renderSetup.renderer,
      client: {
        rpc: () => ({
          inspectLocations: async () => ({
            summaries: {
              [repoRoot]: {
                branch: "main",
                dirtyCount: 8,
                ahead: 0,
                behind: 0,
              },
              [wt1Dir]: {
                branch: "test/workspace-1",
                dirtyCount: 0,
                ahead: 0,
                behind: 0,
              },
              [wtLongDir]: {
                branch: longBranch,
                dirtyCount: 0,
                ahead: 0,
                behind: 0,
              },
            },
            worktreesByRoot: {},
          }),
          events: { on: () => () => {} },
        }),
        worktree: {
          refresh: async () => {},
          list: async () => [{ directory: wt1Dir }, { directory: wtLongDir }],
        },
        vcs: {
          get: async () => ({ data: { branch: { current: "main" } } }),
          status: async () => ({ data: [] }),
        },
        session: {
          create: async ({ location }: any) => {
            createdLocations.push(location.directory)
            return {
              id: "sess-spawned",
              projectID: "proj-1",
              location,
            }
          },
          move: async () => {},
        },
      },
      data: {
        on: () => () => {},
        listen: () => () => {},
        session: {
          list: () => sessions,
          get: (id: string) => sessions.find((s) => s.id === id),
          root: (id: string) => id,
          family: (id: string) => [id],
          cost: () => 0,
          status: () => "idle",
          pending: { list: () => [], sync: async () => {}, invalidate: () => {} },
          sync: async () => {},
          invalidate: () => {},
          message: {
            list: () => [],
            get: () => undefined,
            sync: async () => {},
            invalidate: () => {},
          },
          permission: {
            list: () => [],
            sync: async () => {},
            invalidate: () => {},
          },
          form: {
            list: () => [],
            sync: async () => {},
            invalidate: () => {},
            reply: async () => {},
            cancel: async () => {},
          },
        },
        project: {
          list: () => projects,
          get: (id: string) => projects.find((p) => p.id === id),
          sync: async () => {},
          invalidate: () => {},
          permission: {
            list: () => [],
            sync: async () => {},
            invalidate: () => {},
          },
        },
        shell: {
          list: () => [],
          get: () => undefined,
          sync: async () => {},
          invalidate: () => {},
        },
        location: {
          default: () => ({ directory: repoRoot }),
          sync: async () => {},
          invalidate: () => {},
          vcs: {
            info: () => undefined,
            sync: async () => {},
            invalidate: () => {},
          },
        },
      },
      theme: makeThemeToken(),
      themeMode: "dark",
      keymap: {
        layer: (fn: any) => {
          fn()
        },
      },
      storage: {
        store: () => [
          legacyPrefs,
          async (mut: any) => setLegacyPrefs(produce(mut)),
        ],
        memory: () => [legacyCache, (mut: any) => setLegacyCache(produce(mut))],
      },
      ui: {
        dialog: { show: () => {}, set: () => {}, clear: () => {} },
        toast: { show: () => {} },
        format: { path: (p: string) => p },
        router: {
          register: () => () => {},
          navigate: (dest: any) => {
            if (dest.type === "session") navigatedSessions.push(dest.sessionID)
          },
          current: () => ({ type: "session", sessionID: "sess-wt1" }),
        },
        panel: { open: () => true, close: () => {}, current: () => undefined },
        tabs: {
          enabled: () => true,
          list: () => [],
          open: () => true,
          focus: () => true,
          move: () => true,
          close: () => true,
        },
        slot: (claim: any) => {
          slots.push(claim)
          return () => {}
        },
      },
    }

    const cleanup = await TuiPlugin.setup(mockContext)
    expect(legacyCache.gitWorktreesByRoot).toBeDefined()
    expect(Array.isArray(legacyPrefs.expandedSidebarWorktrees)).toBe(true)

    await new Promise((r) => setTimeout(r, 100))
    renderSetup.renderer.destroy()

    const sidebarClaim = slots.find((s) => s.before === "sidebar.footer")
    expect(sidebarClaim).toBeDefined()

    const uiSetup = await testRender(
      () => sidebarClaim.render({ sessionID: "sess-wt1" }),
      { width: 34, height: 28 },
    )
    mockContext.renderer = uiSetup.renderer
    await uiSetup.renderOnce()

    const frame = uiSetup.captureCharFrame()
    const lines = frame.split("\n")
    expect(frame).toContain("Worktrees")
    // Worktrees with sessions render a collapsed '▸' disclosure; empty worktrees render '·'
    expect(frame).toContain("▸ main")
    expect(frame).toContain("▸ test/workspace-1")
    expect(frame).toContain("· feat/very-long")
    expect(frame).not.toContain("Main Greeting")
    expect(frame).not.toContain("Secondary WT1 Session")
    expect(frame).toContain("+ New session")

    // 1. Clicking the '▸' chevron on non-current 'main' expands its session tree without navigating away
    const mainRowIndex = lines.findIndex((line) => line.includes("▸ main"))
    expect(mainRowIndex).toBeGreaterThan(0)
    await uiSetup.mockMouse.click(0, mainRowIndex)
    await uiSetup.renderOnce()

    const afterMainExpand = uiSetup.captureCharFrame()
    expect(afterMainExpand).toContain("▾ main")
    expect(afterMainExpand).toContain("└─ · Main Greeting")
    expect(navigatedSessions).toEqual([])

    // Collapse 'main' back via its '▾' chevron
    await uiSetup.mockMouse.click(0, mainRowIndex)
    await uiSetup.renderOnce()
    expect(uiSetup.captureCharFrame()).not.toContain("Main Greeting")

    // 2. Clicking anywhere on the current worktree row ('test/workspace-1') expands its session tree
    const wt1RowIndex = uiSetup
      .captureCharFrame()
      .split("\n")
      .findIndex((line) => line.includes("▸ test/workspace-1"))
    expect(wt1RowIndex).toBeGreaterThan(0)
    await uiSetup.mockMouse.click(8, wt1RowIndex)
    await uiSetup.renderOnce()

    const afterWt1Expand = uiSetup.captureCharFrame()
    expect(afterWt1Expand).toContain("▾ test/workspace-1")
    expect(afterWt1Expand).toContain("├─ ▸ Workspace 1 Session")
    expect(afterWt1Expand).toContain("└─ · Secondary WT1 Session")

    // 3. Clicking a nested session in the expanded sidebar tree navigates to that session
    const secondarySessRowIndex = afterWt1Expand
      .split("\n")
      .findIndex((line) => line.includes("Secondary WT1 Session"))
    expect(secondarySessRowIndex).toBeGreaterThan(0)
    await uiSetup.mockMouse.click(10, secondarySessRowIndex)
    await uiSetup.renderOnce()
    expect(navigatedSessions).toContain("sess-wt1-old")

    // 4. Find the "+ New session" row and click it -> must spawn in wt1Dir (not launch repoRoot!)
    const expandedLines = uiSetup.captureCharFrame().split("\n")
    const buttonRowIndex = expandedLines.findIndex((line) =>
      line.includes("+ New session"),
    )
    expect(buttonRowIndex).toBeGreaterThan(secondarySessRowIndex)

    await uiSetup.mockMouse.click(4, buttonRowIndex)
    await new Promise((r) => setTimeout(r, 40))

    expect(createdLocations).toEqual([wt1Dir])
    expect(navigatedSessions).toContain("sess-spawned")

    // 5. Collapse 'test/workspace-1' back by clicking its row again
    await uiSetup.mockMouse.click(8, wt1RowIndex)
    await uiSetup.renderOnce()
    const afterCollapse = uiSetup.captureCharFrame()
    expect(afterCollapse).toContain("▸ test/workspace-1")
    expect(afterCollapse).not.toContain("Secondary WT1 Session")

    // 6. Hover over the long branch row and verify horizontal marquee advances to reveal the suffix
    const collapsedLines = afterCollapse.split("\n")
    const longRowIndex = collapsedLines.findIndex((line) =>
      line.includes("feat/very-long"),
    )
    expect(longRowIndex).toBeGreaterThan(0)
    await uiSetup.mockMouse.moveTo(6, longRowIndex)
    await uiSetup.renderOnce()
    await new Promise((r) => setTimeout(r, 900))
    await uiSetup.renderOnce()
    const scrolledLine = uiSetup.captureCharFrame().split("\n")[longRowIndex]
    expect(scrolledLine).not.toContain("feat/very-long")

    // 7. Regression test: hovering 'main' and moving directly onto '+' never shifts '~8' or blinks '+'
    const unhoveredMainLine = uiSetup.captureCharFrame().split("\n")[mainRowIndex]!
    const initialDirtyCol = unhoveredMainLine.indexOf("~8")
    expect(initialDirtyCol).toBeGreaterThan(10)
    expect(unhoveredMainLine).not.toContain("+")

    await uiSetup.mockMouse.moveTo(4, mainRowIndex)
    await uiSetup.renderOnce()
    const hoveredMainLine = uiSetup.captureCharFrame().split("\n")[mainRowIndex]!
    expect(hoveredMainLine.indexOf("~8")).toBe(initialDirtyCol)
    const plusCol = hoveredMainLine.indexOf("+")
    expect(plusCol).toBeGreaterThan(5)
    expect(plusCol).toBeLessThan(initialDirtyCol)

    // Move directly onto '+' and render multiple frames -> '+' must stay solid and '~8' must never jump
    await uiSetup.mockMouse.moveTo(plusCol, mainRowIndex)
    for (let i = 0; i < 5; i++) {
      await uiSetup.renderOnce()
      await new Promise((r) => setTimeout(r, 5))
      const lineOnPlus = uiSetup.captureCharFrame().split("\n")[mainRowIndex]!
      expect(lineOnPlus.indexOf("+")).toBe(plusCol)
      expect(lineOnPlus.indexOf("~8")).toBe(initialDirtyCol)
    }

    // Clicking '+' on 'main' spawns a new session in 'repoRoot'
    await uiSetup.mockMouse.click(plusCol, mainRowIndex)
    await new Promise((r) => setTimeout(r, 40))
    expect(createdLocations).toEqual([wt1Dir, repoRoot])

    if (cleanup) await cleanup()
    uiSetup.renderer.destroy()
  })

  test("handles live filesystem.changed refreshes, detached HEAD fallback + cache pruning, ↓behind badges, and GUI/terminal editor launching", async () => {
    const { ensureRuntimePluginSupport } = await import(
      "@opentui/solid/runtime-plugin-support/configure"
    )
    const { ensurePluginRuntime } = await import("@opencode/plugin/runtime")
    const { testRender } = await import("@opentui/solid")
    const { createStore, produce } = await import("solid-js/store")
    const { launchParsedEditor } = await import("../src/tui/editor.js")
    const { parseEditorCommand } = await import("../src/model.js")

    const runtimeMods = ensurePluginRuntime()
    ensureRuntimePluginSupport({
      additional: Object.fromEntries(
        Object.entries(runtimeMods).map(([k, loader]) => [
          k,
          (loader as () => any)(),
        ]),
      ) as Record<string, any>,
    })

    const { default: TuiPlugin } = await import("../src/tui.js")

    const makeThemeToken = (): any =>
      new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === Symbol.toPrimitive) return () => "#ffffff"
            if (
              prop === "base" ||
              prop === "muted" ||
              prop === "faint" ||
              prop === "selected" ||
              prop === "focused" ||
              prop === "hovered" ||
              prop === "disabled" ||
              prop === "low" ||
              prop === "high" ||
              typeof prop === "number" ||
              /^\d+$/.test(String(prop))
            ) {
              return "#aabbcc"
            }
            if (prop === "surface") return () => makeThemeToken()
            return makeThemeToken()
          },
        },
      )

    const repoRoot = "/Users/dev/repo-a"
    const wtDetachedDir = "/Users/dev/repo-a/wt-detached"
    const wtRemovedDir = "/Users/dev/repo-a/wt-removed"

    const projects = [
      {
        id: "proj-a",
        canonical: repoRoot,
        vcs: "git",
        name: "repo-a",
        sandboxes: [wtDetachedDir],
        time: { created: 1, updated: 5, active: 5 },
      },
      {
        id: "proj-other",
        canonical: "/Users/dev/repo-other",
        vcs: "git",
        name: "repo-other",
        sandboxes: [],
        time: { created: 1, updated: 2, active: 2 },
      },
    ]

    const sessions = [
      {
        id: "sess-a",
        projectID: "proj-a",
        title: "Active Repo A",
        time: { created: 1, updated: 5 },
        location: { directory: wtDetachedDir },
      },
      {
        id: "sess-other",
        projectID: "proj-other",
        title: "Unrelated Repo Session",
        time: { created: 1, updated: 2 },
        location: { directory: "/Users/dev/repo-other" },
      },
    ]

    const eventHandlers = new Map<string, Array<(ev: any) => void>>()
    const statusChecks: string[] = []
    let locationSyncCalls = 0
    let detachedDirtyFiles = ["a.ts", "b.ts"]
    let rpcMode: "fallback" | "rpc" = "fallback"
    let worktreeInventory = [{ directory: wtDetachedDir }, { directory: wtRemovedDir }]
    const spawnedEditors: any[] = []
    const lifecycleOrder: string[] = []
    const registeredCommands: any[] = []
    const slots: any[] = []

    const [prefs, setPrefs] = createStore<any>({
      pinnedProjects: [],
      collapsedProjects: [],
      expandedSidebarWorktrees: [],
      showAllGitProjects: false,
      maxRecentProjects: 8,
    })
    const [cache, setCache] = createStore<any>({
      worktreesByProject: { "proj-a": [wtDetachedDir, wtRemovedDir] },
      gitWorktreesByRoot: {},
      gitByDirectory: {
        [wtRemovedDir]: {
          branch: "old/stale",
          dirtyCount: 99,
          ahead: 0,
          behind: 0,
        },
      },
      lastSyncedAt: 0,
    })

    const bootRender = await testRender(() => null as any, {
      width: 40,
      height: 28,
    })

    const mockContext: any = {
      options: {
        editorSpawner: async (req: any) => {
          lifecycleOrder.push(`spawn:${req.binary}`)
          spawnedEditors.push(req)
        },
      },
      location: { directory: repoRoot },
      app: { version: "2.2.5", channel: "latest" },
      renderer: bootRender.renderer,
      client: {
        rpc: () => ({
          inspectLocations: async (input: any) => {
            if (rpcMode === "fallback") {
              throw new Error("RPC unavailable in TUI-only mode")
            }
            // Verify TUI sends rootDirectories with only canonical repo root
            expect(input.rootDirectories).toEqual([repoRoot])
            return {
              summaries: {
                [repoRoot]: {
                  branch: "main",
                  dirtyCount: 1,
                  ahead: 2,
                  behind: 3,
                },
                [wtDetachedDir]: {
                  branch: "feat/synced",
                  dirtyCount: detachedDirtyFiles.length,
                  ahead: 1,
                  behind: 2,
                },
              },
              worktreesByRoot: {
                [repoRoot]: [
                  { directory: repoRoot, branch: "main" },
                  { directory: wtDetachedDir, branch: "feat/synced" },
                ],
              },
            }
          },
          events: { on: () => () => {} },
        }),
        worktree: {
          refresh: async () => {},
          list: async () => worktreeInventory,
        },
        vcs: {
          get: async ({ location }: any) => {
            if (location.directory === wtDetachedDir) {
              // Detached HEAD: provider is "git", branch.current is undefined!
              return {
                data: {
                  provider: "git",
                  branch: { current: undefined, default: "main" },
                },
              }
            }
            if (location.directory === repoRoot) {
              return {
                data: {
                  provider: "git",
                  branch: { current: "main", default: "main" },
                },
              }
            }
            throw new Error("ENOENT")
          },
          status: async ({ location }: any) => {
            if (location.directory === wtDetachedDir) {
              return { data: detachedDirtyFiles.map((f) => ({ file: f })) }
            }
            return { data: [] }
          },
        },
        session: {
          create: async ({ location }: any) => ({
            id: "sess-new",
            projectID: "proj-a",
            location,
          }),
          move: async () => {},
        },
      },
      data: {
        on: (type: string, fn: (ev: any) => void) => {
          const list = eventHandlers.get(type) ?? []
          list.push(fn)
          eventHandlers.set(type, list)
          return () => {}
        },
        listen: () => () => {},
        session: {
          list: () => sessions,
          get: (id: string) => sessions.find((s) => s.id === id),
          root: (id: string) => id,
          family: (id: string) => [id],
          cost: () => 0,
          status: (id: string) => {
            statusChecks.push(id)
            return "idle"
          },
          pending: { list: () => [], sync: async () => {}, invalidate: () => {} },
          sync: async () => {},
          invalidate: () => {},
          message: {
            list: () => [],
            get: () => undefined,
            sync: async () => {},
            invalidate: () => {},
          },
          permission: { list: () => [], sync: async () => {}, invalidate: () => {} },
          form: {
            list: () => [],
            sync: async () => {},
            invalidate: () => {},
            reply: async () => {},
            cancel: async () => {},
          },
        },
        project: {
          list: () => projects,
          get: (id: string) => projects.find((p) => p.id === id),
          sync: async () => {},
          invalidate: () => {},
          permission: { list: () => [], sync: async () => {}, invalidate: () => {} },
        },
        shell: { list: () => [], get: () => undefined, sync: async () => {}, invalidate: () => {} },
        location: {
          default: () => ({ directory: repoRoot }),
          sync: async () => {
            locationSyncCalls += 1
          },
          invalidate: () => {},
          vcs: { info: () => undefined, sync: async () => {}, invalidate: () => {} },
        },
      },
      theme: makeThemeToken(),
      themeMode: "dark",
      keymap: {
        layer: (fn: any) => {
          const layer = fn()
          if (layer.commands) registeredCommands.push(...layer.commands)
        },
      },
      storage: {
        store: () => [prefs, async (mut: any) => setPrefs(produce(mut))],
        memory: () => [cache, (mut: any) => setCache(produce(mut))],
      },
      ui: {
        dialog: { show: () => {}, set: () => {}, clear: () => {} },
        toast: { show: () => {} },
        format: { path: (p: string) => p },
        router: {
          register: () => () => {},
          navigate: () => {},
          current: () => ({ type: "session", sessionID: "sess-a" }),
        },
        panel: { open: () => true, close: () => {}, current: () => undefined },
        tabs: {
          enabled: () => true,
          list: () => [],
          open: () => true,
          focus: () => true,
          move: () => true,
          close: () => true,
        },
        slot: (claim: any) => {
          slots.push(claim)
          return () => {}
        },
      },
    }

    const cleanup = await TuiPlugin.setup(mockContext)
    await new Promise((r) => setTimeout(r, 120))
    bootRender.renderer.destroy()

    // 1. Detached HEAD fallback kept `dirtyCount: 2` on `wtDetachedDir` AND pruned stale `wtRemovedDir` (which threw ENOENT)
    expect(cache.gitByDirectory[wtDetachedDir]?.dirtyCount).toBe(2)
    expect(cache.gitByDirectory[wtRemovedDir]).toBeUndefined()

    // 2. Remove `wtRemovedDir` from inventory and switch RPC online -> `filesystem.changed` triggers live refresh + `↓behind` badges!
    worktreeInventory = [{ directory: wtDetachedDir }]
    detachedDirtyFiles = ["a.ts", "b.ts", "c.ts", "d.ts"]
    rpcMode = "rpc"
    for (const fn of eventHandlers.get("filesystem.changed") ?? []) {
      fn({ type: "filesystem.changed" })
    }
    await new Promise((r) => setTimeout(r, 500))

    const sidebarClaim = slots.find((s) => s.before === "sidebar.footer")
    const panelClaim = slots.find((s) => s.append === "session.panel")
    statusChecks.length = 0

    const sidebarUi = await testRender(
      () => sidebarClaim.render({ sessionID: "sess-a" }),
      { width: 42, height: 28 },
    )
    mockContext.renderer = sidebarUi.renderer
    await sidebarUi.renderOnce()

    const sidebarFrame = sidebarUi.captureCharFrame()
    // Sidebar renders ~dirty, ↑ahead, AND ↓behind!
    expect(sidebarFrame).toContain("↑2")
    expect(sidebarFrame).toContain("↓3")
    expect(sidebarFrame).toContain("~4")
    // Scoped `collectSessionRuntime` never queried `sess-other` from unrelated `proj-other`!
    expect(statusChecks).toContain("sess-a")
    expect(statusChecks).not.toContain("sess-other")
    // Re-rendering with same session directory does not spam `location.sync`
    const syncCallsBefore = locationSyncCalls
    await sidebarUi.renderOnce()
    expect(locationSyncCalls).toBe(syncCallsBefore)
    sidebarUi.renderer.destroy()

    // 3. Render `WorkspacesPanel` (`Ctrl+G`) -> shows `↓3` and `o` keybind launches editor
    const panelUi = await testRender(
      () =>
        panelClaim.render({
          name: "opencode-workspaces.panel",
          sessionID: "sess-a",
          width: 44,
          presentation: "panel",
          focused: true,
          focus: () => {},
          close: () => {},
          toggleFullscreen: () => {},
        }),
      { width: 44, height: 28 },
    )
    mockContext.renderer = panelUi.renderer
    await panelUi.renderOnce()
    const panelFrame = panelUi.captureCharFrame()
    expect(panelFrame).toContain("↓3")
    expect(panelFrame).toContain("o editor")

    // Run `/ws open zed` -> persists preferredEditor and launches Zed in `wtDetachedDir`
    const switcherCmd = registeredCommands.find(
      (c) => c.id === "workspaces.switcher",
    )
    await switcherCmd.run("/ws open zed")
    expect(prefs.preferredEditor).toBe("zed")
    expect(spawnedEditors[0]).toEqual({
      binary: "zed",
      args: [wtDetachedDir],
      cwd: wtDetachedDir,
      kind: "gui",
    })

    // Run `/ws open nvim` -> suspends renderer before spawning `nvim .` and resumes after
    panelUi.renderer.suspend = async () => {
      lifecycleOrder.push("suspend")
    }
    panelUi.renderer.resume = async () => {
      lifecycleOrder.push("resume")
    }
    lifecycleOrder.length = 0
    await switcherCmd.run("/ws open nvim")
    expect(lifecycleOrder).toEqual(["suspend", "spawn:nvim", "resume"])
    expect(spawnedEditors[1]).toEqual({
      binary: "nvim",
      args: ["."],
      cwd: wtDetachedDir,
      kind: "terminal",
    })

    // 4. Verify macOS `open -a Zed` fallback when `zed` CLI shim returns ENOENT
    const fallbackCalls: any[] = []
    await launchParsedEditor({
      context: mockContext,
      directory: wtDetachedDir,
      parsed: parseEditorCommand("zed")!,
      platform: "darwin",
      spawner: async (req) => {
        fallbackCalls.push(req)
        if (req.binary === "zed") {
          const err: NodeJS.ErrnoException = new Error("spawn zed ENOENT")
          err.code = "ENOENT"
          throw err
        }
      },
    })
    expect(fallbackCalls).toEqual([
      { binary: "zed", args: [wtDetachedDir], cwd: wtDetachedDir, kind: "gui" },
      {
        binary: "open",
        args: ["-a", "Zed", wtDetachedDir],
        cwd: wtDetachedDir,
        kind: "gui",
      },
    ])

    if (cleanup) await cleanup()
    panelUi.renderer.destroy()
  })

  test("highlights hovered worktree, session, header, and '+ New session' rows distinctly above raised sidebar and panel surfaces", async () => {
    const { ensureRuntimePluginSupport } = await import(
      "@opentui/solid/runtime-plugin-support/configure"
    )
    const { ensurePluginRuntime } = await import("@opencode/plugin/runtime")
    const { testRender } = await import("@opentui/solid")
    const { createStore, produce } = await import("solid-js/store")
    const { migrateV1NewDesigns, resolveThemeDocument } = await import(
      "@opencode/theme/tui"
    )
    const { isVisiblyDistinctOnSurface, resolveSidebarHoverBg } = await import(
      "../src/tui/types.js"
    )

    const runtimeMods = ensurePluginRuntime()
    ensureRuntimePluginSupport({
      additional: Object.fromEntries(
        Object.entries(runtimeMods).map(([k, loader]) => [
          k,
          (loader as () => any)(),
        ]),
      ) as Record<string, any>,
    })

    const { default: TuiPlugin } = await import("../src/tui.js")

    const sampleV1 = {
      theme: {
        primary: "#7aa2f7",
        secondary: "#bb9af7",
        accent: "#ff9e64",
        error: "#f7768e",
        warning: "#e0af68",
        success: "#9ece6a",
        info: "#7dcfff",
        text: "#c0caf5",
        textMuted: "#565f89",
        background: "#1a1b26",
        backgroundPanel: "#16161e",
        backgroundElement: "#292e42",
        border: "#3b4261",
        borderActive: "#7aa2f7",
        borderSubtle: "#292e42",
        diffAdded: "#9ece6a",
        diffRemoved: "#f7768e",
        diffContext: "#565f89",
        diffHunkHeader: "#7aa2f7",
        diffHighlightAdded: "#9ece6a",
        diffHighlightRemoved: "#f7768e",
        diffAddedBg: "#20303b",
        diffRemovedBg: "#37222c",
        diffContextBg: "#1a1b26",
        diffLineNumber: "#565f89",
        diffAddedLineNumberBg: "#20303b",
        diffRemovedLineNumberBg: "#37222c",
        markdownText: "#c0caf5",
        markdownHeading: "#bb9af7",
        markdownLink: "#7aa2f7",
        markdownLinkText: "#7dcfff",
        markdownCode: "#9ece6a",
        markdownBlockQuote: "#e0af68",
        markdownEmph: "#e0af68",
        markdownStrong: "#ff9e64",
        markdownHorizontalRule: "#565f89",
        markdownListItem: "#2e7de9",
        markdownListEnumeration: "#7dcfff",
        markdownImage: "#7aa2f7",
        markdownImageText: "#7dcfff",
        markdownCodeBlock: "#c0caf5",
        syntaxComment: "#565f89",
        syntaxKeyword: "#bb9af7",
        syntaxFunction: "#7aa2f7",
        syntaxVariable: "#c0caf5",
        syntaxString: "#9ece6a",
        syntaxNumber: "#ff9e64",
        syntaxType: "#2ac3de",
        syntaxOperator: "#89ddff",
        syntaxPunctuation: "#c0caf5",
      },
    }

    const darkTheme = resolveThemeDocument(
      migrateV1NewDesigns(sampleV1 as any),
      "dark",
    )
    const transparentTheme = resolveThemeDocument(
      migrateV1NewDesigns({
        theme: {
          ...sampleV1.theme,
          background: "#00000000",
          backgroundPanel: "#00000000",
          backgroundElement: "#00000000",
        },
      } as any),
      "dark",
    )

    // Transparent themes must still resolve an opaque hover highlight color
    expect(
      isVisiblyDistinctOnSurface(
        resolveSidebarHoverBg(transparentTheme as any),
        transparentTheme.background.raised.base,
      ),
    ).toBe(true)

    const repoRoot = "/Users/dev/hover-repo"
    const wtActiveDir = "/Users/dev/hover-repo/wt-active"
    const slots: any[] = []

    const [prefs, setPrefs] = createStore<any>({
      pinnedProjects: [],
      collapsedProjects: [],
      expandedSidebarWorktrees: [wtActiveDir],
      showAllGitProjects: false,
      maxRecentProjects: 8,
    })
    const [cache, setCache] = createStore<any>({
      worktreesByProject: { "proj-h": [wtActiveDir] },
      gitWorktreesByRoot: {},
      gitByDirectory: {
        [repoRoot]: { branch: "main", dirtyCount: 2, ahead: 0, behind: 0 },
        [wtActiveDir]: {
          branch: "feat/selected",
          dirtyCount: 0,
          ahead: 1,
          behind: 0,
        },
      },
      lastSyncedAt: Date.now(),
    })

    const sessions = [
      {
        id: "sess-main",
        projectID: "proj-h",
        title: "Main Session",
        time: { created: 1, updated: 3 },
        location: { directory: repoRoot },
      },
      {
        id: "sess-cur",
        projectID: "proj-h",
        title: "Current Session",
        time: { created: 1, updated: 5 },
        location: { directory: wtActiveDir },
      },
      {
        id: "sess-bg",
        projectID: "proj-h",
        title: "Older Session",
        time: { created: 1, updated: 2 },
        location: { directory: wtActiveDir },
      },
    ]

    const boot = await testRender(() => null as any, { width: 38, height: 30 })
    const mockContext: any = {
      options: {},
      location: { directory: repoRoot },
      app: { version: "2.2.5", channel: "latest" },
      renderer: boot.renderer,
      client: {
        rpc: () => ({
          inspectLocations: async () => ({
            summaries: cache.gitByDirectory,
            worktreesByRoot: {},
          }),
          events: { on: () => () => {} },
        }),
        worktree: {
          refresh: async () => {},
          list: async () => [{ directory: wtActiveDir }],
        },
        vcs: {
          get: async () => ({ data: { branch: { current: "main" } } }),
          status: async () => ({ data: [] }),
        },
        session: { create: async () => ({}), move: async () => {} },
      },
      data: {
        on: () => () => {},
        listen: () => () => {},
        session: {
          list: () => sessions,
          get: (id: string) => sessions.find((s) => s.id === id),
          root: (id: string) => id,
          family: (id: string) => [id],
          cost: () => 0,
          status: () => "idle",
          pending: { list: () => [], sync: async () => {}, invalidate: () => {} },
          sync: async () => {},
          invalidate: () => {},
          message: {
            list: () => [],
            get: () => undefined,
            sync: async () => {},
            invalidate: () => {},
          },
          permission: { list: () => [], sync: async () => {}, invalidate: () => {} },
          form: {
            list: () => [],
            sync: async () => {},
            invalidate: () => {},
            reply: async () => {},
            cancel: async () => {},
          },
        },
        project: {
          list: () => [
            {
              id: "proj-h",
              canonical: repoRoot,
              vcs: "git",
              name: "hover-repo",
              sandboxes: [wtActiveDir],
              time: { created: 1, updated: 5, active: 5 },
            },
          ],
          get: () => undefined,
          sync: async () => {},
          invalidate: () => {},
          permission: { list: () => [], sync: async () => {}, invalidate: () => {} },
        },
        shell: { list: () => [], get: () => undefined, sync: async () => {}, invalidate: () => {} },
        location: {
          default: () => ({ directory: repoRoot }),
          sync: async () => {},
          invalidate: () => {},
          vcs: { info: () => undefined, sync: async () => {}, invalidate: () => {} },
        },
      },
      theme: darkTheme,
      themeMode: "dark",
      keymap: { layer: () => {} },
      storage: {
        store: () => [prefs, async (m: any) => setPrefs(produce(m))],
        memory: () => [cache, (m: any) => setCache(produce(m))],
      },
      ui: {
        dialog: { show: () => {}, set: () => {}, clear: () => {} },
        toast: { show: () => {} },
        format: { path: (p: string) => p },
        router: {
          register: () => () => {},
          navigate: () => {},
          current: () => ({ type: "session", sessionID: "sess-cur" }),
        },
        panel: { open: () => true, close: () => {}, current: () => undefined },
        tabs: {
          enabled: () => true,
          list: () => [],
          open: () => true,
          focus: () => true,
          move: () => true,
          close: () => true,
        },
        slot: (c: any) => {
          slots.push(c)
          return () => {}
        },
      },
    }

    const cleanup = await TuiPlugin.setup(mockContext)
    boot.renderer.destroy()

    const sidebarSurfaceBg = darkTheme.background.raised.base
    const sidebarClaim = slots.find((s) => s.before === "sidebar.footer")
    const sidebarUi = await testRender(
      () => sidebarClaim.render({ sessionID: "sess-cur" }),
      {
        width: 36,
        height: 30,
        backgroundColor: sidebarSurfaceBg,
      },
    )
    mockContext.renderer = sidebarUi.renderer
    await sidebarUi.renderOnce()

    const lines = sidebarUi.captureCharFrame().split("\n")
    const headerIdx = lines.findIndex((l) => l.includes("Worktrees"))
    const mainIdx = lines.findIndex((l) => l.includes("▸ main"))
    const selectedWtIdx = lines.findIndex((l) => l.includes("▾ feat/selected"))
    const olderSessIdx = lines.findIndex((l) => l.includes("Older Session"))
    const newSessIdx = lines.findIndex((l) => l.includes("+ New session"))
    const newSessBranchIdx = newSessIdx + 1

    // Target workspace renders on its own indented newline underneath '+ New session'
    expect(lines[newSessIdx]).not.toContain("feat/selected")
    expect(lines[newSessBranchIdx]).toContain("  feat/selected")

    const rowFirstBg = (ui: typeof sidebarUi, rowIdx: number) =>
      ui.captureSpans().lines[rowIdx]!.spans[0]!.bg

    // At rest, rows sit cleanly on the raised sidebar background
    expect(
      isVisiblyDistinctOnSurface(rowFirstBg(sidebarUi, mainIdx), sidebarSurfaceBg),
    ).toBe(false)

    // Hovering non-selected worktree row visibly highlights its background above raised.base
    await sidebarUi.mockMouse.moveTo(6, mainIdx)
    await sidebarUi.renderOnce()
    expect(
      isVisiblyDistinctOnSurface(rowFirstBg(sidebarUi, mainIdx), sidebarSurfaceBg),
    ).toBe(true)

    // Moving to the selected worktree row clears 'main' and visibly highlights 'feat/selected'
    await sidebarUi.mockMouse.moveTo(6, selectedWtIdx)
    await sidebarUi.renderOnce()
    expect(
      isVisiblyDistinctOnSurface(rowFirstBg(sidebarUi, mainIdx), sidebarSurfaceBg),
    ).toBe(false)
    expect(
      isVisiblyDistinctOnSurface(
        rowFirstBg(sidebarUi, selectedWtIdx),
        sidebarSurfaceBg,
      ),
    ).toBe(true)

    // Hovering nested session row highlights the session row
    await sidebarUi.mockMouse.moveTo(8, olderSessIdx)
    await sidebarUi.renderOnce()
    expect(
      isVisiblyDistinctOnSurface(
        rowFirstBg(sidebarUi, olderSessIdx),
        sidebarSurfaceBg,
      ),
    ).toBe(true)

    // Hovering 'Worktrees' header and '+ New session' / workspace newline highlights both lines' bg and fg
    await sidebarUi.mockMouse.moveTo(4, headerIdx)
    await sidebarUi.renderOnce()
    expect(
      isVisiblyDistinctOnSurface(rowFirstBg(sidebarUi, headerIdx), sidebarSurfaceBg),
    ).toBe(true)

    const restNewSessFg = sidebarUi
      .captureSpans()
      .lines[newSessIdx]!.spans.find((s) => s.text.includes("+ New session"))!
      .fg.toString()
    const restBranchFg = sidebarUi
      .captureSpans()
      .lines[newSessBranchIdx]!.spans.find((s) =>
        s.text.includes("feat/selected"),
      )!
      .fg.toString()

    // Hover directly on the '<workspace>' second line -> both lines highlight together
    await sidebarUi.mockMouse.moveTo(4, newSessBranchIdx)
    await sidebarUi.renderOnce()
    const hoveredNewSessSpan = sidebarUi
      .captureSpans()
      .lines[newSessIdx]!.spans.find((s) => s.text.includes("+ New session"))!
    const hoveredBranchSpan = sidebarUi
      .captureSpans()
      .lines[newSessBranchIdx]!.spans.find((s) =>
        s.text.includes("feat/selected"),
      )!
    expect(
      isVisiblyDistinctOnSurface(hoveredNewSessSpan.bg, sidebarSurfaceBg),
    ).toBe(true)
    expect(
      isVisiblyDistinctOnSurface(
        rowFirstBg(sidebarUi, newSessBranchIdx),
        sidebarSurfaceBg,
      ),
    ).toBe(true)
    expect(
      isVisiblyDistinctOnSurface(hoveredBranchSpan.bg, sidebarSurfaceBg),
    ).toBe(true)
    expect(hoveredNewSessSpan.fg.toString()).not.toBe(restNewSessFg)
    expect(hoveredBranchSpan.fg.toString()).not.toBe(restBranchFg)

    sidebarUi.renderer.destroy()

    // Verify WorkspacesPanel (Ctrl+G) also highlights hovered rows distinctly from both raised.base and selected row
    const panelClaim = slots.find((s) => s.append === "session.panel")
    const panelUi = await testRender(
      () =>
        panelClaim.render({
          name: "opencode-workspaces.panel",
          sessionID: "sess-cur",
          width: 40,
          presentation: "panel",
          focused: true,
          focus: () => {},
          close: () => {},
          toggleFullscreen: () => {},
        }),
      {
        width: 40,
        height: 22,
        backgroundColor: sidebarSurfaceBg,
      },
    )
    mockContext.renderer = panelUi.renderer
    await panelUi.renderOnce()

    const panelLines = panelUi.captureCharFrame().split("\n")
    const panelMainIdx = panelLines.findIndex((l) => l.includes("main"))
    const panelCurSessIdx = panelLines.findIndex((l) =>
      l.includes("Current Session"),
    )

    // Current Session is keyboard-selected; 'main' is unselected at rest
    const selectedPanelBg = rowFirstBg(panelUi, panelCurSessIdx)
    expect(isVisiblyDistinctOnSurface(selectedPanelBg, sidebarSurfaceBg)).toBe(
      true,
    )
    expect(
      isVisiblyDistinctOnSurface(
        rowFirstBg(panelUi, panelMainIdx),
        sidebarSurfaceBg,
      ),
    ).toBe(false)

    // Hovering unselected 'main' row in panel highlights it distinctly above raised.base AND distinct from selected row
    await panelUi.mockMouse.moveTo(6, panelMainIdx)
    await panelUi.renderOnce()
    const hoveredPanelBg = rowFirstBg(panelUi, panelMainIdx)
    expect(isVisiblyDistinctOnSurface(hoveredPanelBg, sidebarSurfaceBg)).toBe(
      true,
    )
    expect(hoveredPanelBg.toString()).not.toBe(selectedPanelBg.toString())

    if (cleanup) await cleanup()
    panelUi.renderer.destroy()
  })

  test("prints '!' and 'ask' only next to unfolded session rows without duplicating onto the parent worktree row", async () => {
    const { ensureRuntimePluginSupport } = await import(
      "@opentui/solid/runtime-plugin-support/configure"
    )
    const { ensurePluginRuntime } = await import("@opencode/plugin/runtime")
    const { testRender } = await import("@opentui/solid")
    const { createStore, produce } = await import("solid-js/store")

    const runtimeMods = ensurePluginRuntime()
    ensureRuntimePluginSupport({
      additional: Object.fromEntries(
        Object.entries(runtimeMods).map(([k, loader]) => [
          k,
          (loader as () => any)(),
        ]),
      ) as Record<string, any>,
    })

    const { default: TuiPlugin } = await import("../src/tui.js")

    const makeThemeToken = (): any =>
      new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === Symbol.toPrimitive) return () => "#ffffff"
            if (
              prop === "base" ||
              prop === "muted" ||
              prop === "faint" ||
              prop === "selected" ||
              prop === "focused" ||
              prop === "hovered" ||
              prop === "disabled" ||
              prop === "low" ||
              prop === "high" ||
              prop === "max" ||
              typeof prop === "number" ||
              /^\d+$/.test(String(prop))
            ) {
              return "#aabbcc"
            }
            if (prop === "surface") return () => makeThemeToken()
            return makeThemeToken()
          },
        },
      )

    const repoRoot = "/Users/dev/repo-ask"
    const wtAskDir = "/Users/dev/repo-ask/wt-ask"
    const slots: any[] = []

    const projects = [
      {
        id: "proj-ask",
        canonical: repoRoot,
        vcs: "git",
        name: "repo-ask",
        sandboxes: [wtAskDir],
        time: { created: 1, updated: 10, active: 10 },
      },
    ]

    const sessions = [
      {
        id: "sess-cur-ask",
        projectID: "proj-ask",
        title: "Asking Session",
        time: { created: 1, updated: 10 },
        location: { directory: wtAskDir },
      },
      {
        id: "sess-bg-ask",
        projectID: "proj-ask",
        title: "Bg Ask Session",
        time: { created: 1, updated: 8 },
        location: { directory: repoRoot },
      },
    ]

    const [prefs, setPrefs] = createStore<any>({
      pinnedProjects: [],
      collapsedProjects: [],
      expandedSidebarWorktrees: [],
      showAllGitProjects: false,
      maxRecentProjects: 8,
    })
    const [cache, setCache] = createStore<any>({
      worktreesByProject: { "proj-ask": [wtAskDir] },
      gitWorktreesByRoot: {
        [repoRoot]: [
          { directory: repoRoot, branch: "main" },
          { directory: wtAskDir, branch: "feat/dialog" },
        ],
      },
      gitByDirectory: {
        [repoRoot]: { branch: "main", dirtyCount: 0, ahead: 0, behind: 0 },
        [wtAskDir]: {
          branch: "feat/dialog",
          dirtyCount: 0,
          ahead: 0,
          behind: 0,
        },
      },
      lastSyncedAt: Date.now(),
    })

    const boot = await testRender(() => null as any, { width: 38, height: 28 })

    const mockContext: any = {
      options: {},
      location: { directory: wtAskDir },
      app: { version: "2.2.5", channel: "latest" },
      renderer: boot.renderer,
      client: {
        rpc: () => ({
          inspectLocations: async () => ({
            summaries: cache.gitByDirectory,
            worktreesByRoot: cache.gitWorktreesByRoot,
          }),
          events: { on: () => () => {} },
        }),
        worktree: {
          refresh: async () => {},
          list: async () => [{ directory: wtAskDir }],
        },
        vcs: {
          get: async () => ({ data: { branch: { current: "feat/dialog" } } }),
          status: async () => ({ data: [] }),
        },
        session: {
          create: async ({ location }: any) => ({
            id: "sess-new",
            projectID: "proj-ask",
            location,
          }),
          move: async () => {},
        },
      },
      data: {
        on: () => () => {},
        listen: () => () => {},
        session: {
          list: () => sessions,
          get: (id: string) => sessions.find((s) => s.id === id),
          root: (id: string) => id,
          family: (id: string) => [id],
          cost: () => 0,
          status: () => "idle",
          pending: { list: () => [], sync: async () => {}, invalidate: () => {} },
          sync: async () => {},
          invalidate: () => {},
          message: {
            list: () => [],
            get: () => undefined,
            sync: async () => {},
            invalidate: () => {},
          },
          permission: { list: () => [], sync: async () => {}, invalidate: () => {} },
          form: {
            // Both sessions are waiting on user questions ('ask')
            list: (id: string) =>
              id === "sess-cur-ask" || id === "sess-bg-ask" ? [{ id: `f-${id}` }] : [],
            sync: async () => {},
            invalidate: () => {},
            reply: async () => {},
            cancel: async () => {},
          },
        },
        project: {
          list: () => projects,
          get: (id: string) => projects.find((p) => p.id === id),
          sync: async () => {},
          invalidate: () => {},
          permission: { list: () => [], sync: async () => {}, invalidate: () => {} },
        },
        shell: { list: () => [], get: () => undefined, sync: async () => {}, invalidate: () => {} },
        location: {
          default: () => ({ directory: wtAskDir }),
          sync: async () => {},
          invalidate: () => {},
          vcs: { info: () => undefined, sync: async () => {}, invalidate: () => {} },
        },
      },
      theme: makeThemeToken(),
      themeMode: "dark",
      keymap: { layer: (fn: any) => fn() },
      storage: {
        store: () => [prefs, async (mut: any) => setPrefs(produce(mut))],
        memory: () => [cache, (mut: any) => setCache(produce(mut))],
      },
      ui: {
        dialog: { show: () => {}, set: () => {}, clear: () => {} },
        toast: { show: () => {} },
        format: { path: (p: string) => p },
        router: {
          register: () => () => {},
          navigate: () => {},
          current: () => ({ type: "session", sessionID: "sess-cur-ask" }),
        },
        panel: { open: () => true, close: () => {}, current: () => undefined },
        tabs: {
          enabled: () => true,
          list: () => [],
          open: () => true,
          focus: () => true,
          move: () => true,
          close: () => true,
        },
        slot: (claim: any) => {
          slots.push(claim)
          return () => {}
        },
      },
    }

    const cleanup = await TuiPlugin.setup(mockContext)
    await new Promise((r) => setTimeout(r, 80))
    boot.renderer.destroy()

    const sidebarClaim = slots.find((s) => s.before === "sidebar.footer")
    const sidebarUi = await testRender(
      () => sidebarClaim.render({ sessionID: "sess-cur-ask" }),
      { width: 38, height: 28 },
    )
    mockContext.renderer = sidebarUi.renderer
    await sidebarUi.renderOnce()

    // Initially:
    // - 'feat/dialog' is folded with no child rows visible -> 'ask' rolls up onto 'feat/dialog'
    // - 'main' auto-surfaces 'Bg Ask Session' below -> 'ask' & '!' appear ONLY on 'Bg Ask Session', NOT on 'main'
    const foldedLines = sidebarUi.captureCharFrame().split("\n")
    const foldedFeatLine = foldedLines.find((l) => l.includes("▸ feat/dialog"))!
    const foldedMainLine = foldedLines.find((l) => l.includes("▸ main"))!
    const surfacedBgSessLine = foldedLines.find((l) =>
      l.includes("Bg Ask Session"),
    )!
    expect(foldedFeatLine).toMatch(/\bask\b/)
    expect(foldedMainLine).not.toMatch(/\bask\b/)
    expect(surfacedBgSessLine).toContain("! Bg Ask Session")
    expect(surfacedBgSessLine).toMatch(/\bask\b/)

    // Unfold 'feat/dialog' -> '!' and 'ask' move exclusively to 'Asking Session' (never 2x 'ask')
    const featIdx = foldedLines.findIndex((l) => l.includes("▸ feat/dialog"))
    await sidebarUi.mockMouse.click(6, featIdx)
    await sidebarUi.renderOnce()

    const unfoldedLines = sidebarUi.captureCharFrame().split("\n")
    const unfoldedFeatLine = unfoldedLines.find((l) =>
      l.includes("▾ feat/dialog"),
    )!
    const unfoldedAskSessLine = unfoldedLines.find((l) =>
      l.includes("Asking Session"),
    )!
    expect(unfoldedFeatLine).not.toContain("!")
    expect(unfoldedFeatLine).not.toMatch(/\bask\b/)
    expect(unfoldedAskSessLine).toContain("└─ ! Asking Session")
    expect(unfoldedAskSessLine).toMatch(/\bask\b/)

    sidebarUi.renderer.destroy()

    // WorkspacesPanel (Ctrl+G): unfolded worktree rows show '▸'/'○' without '!' or 'ask'; session rows show '!' + 'ask'
    const panelClaim = slots.find((s) => s.append === "session.panel")
    const panelUi = await testRender(
      () =>
        panelClaim.render({
          name: "opencode-workspaces.panel",
          sessionID: "sess-cur-ask",
          width: 44,
          presentation: "panel",
          focused: true,
          focus: () => {},
          close: () => {},
          toggleFullscreen: () => {},
        }),
      { width: 44, height: 24 },
    )
    mockContext.renderer = panelUi.renderer
    await panelUi.renderOnce()

    const panelLines = panelUi.captureCharFrame().split("\n")
    const panelMainWtLine = panelLines.find((l) => l.includes("○ main"))!
    const panelFeatWtLine = panelLines.find((l) => l.includes("▸ feat/dialog"))!
    const panelBgSessLine = panelLines.find((l) =>
      l.includes("Bg Ask Session"),
    )!
    const panelCurSessLine = panelLines.find((l) =>
      l.includes("Asking Session"),
    )!

    expect(panelMainWtLine).toBeDefined()
    expect(panelFeatWtLine).toBeDefined()
    expect(panelMainWtLine).not.toMatch(/\bask\b/)
    expect(panelFeatWtLine).not.toMatch(/\bask\b/)
    expect(panelBgSessLine).toContain("! Bg Ask Session")
    expect(panelBgSessLine).toMatch(/\bask\b/)
    expect(panelCurSessLine).toContain("! Asking Session")
    expect(panelCurSessLine).toMatch(/\bask\b/)

    if (cleanup) await cleanup()
    panelUi.renderer.destroy()
  })

  test("preserves reactive hover highlights when loaded from node_modules/dist/tui.js (where bun-plugin-solid skips transformation)", async () => {
    const { cp, mkdir, rm } = await import("node:fs/promises")
    const path = await import("node:path")
    const { pathToFileURL } = await import("node:url")
    const { isNodeModulesPath } = await import(
      "../node_modules/@opentui/solid/scripts/solid-transform.js"
    )
    const { ensureRuntimePluginSupport } = await import(
      "@opentui/solid/runtime-plugin-support/configure"
    )
    const { ensurePluginRuntime } = await import("@opencode/plugin/runtime")
    const { testRender } = await import("@opentui/solid")
    const { createStore, produce } = await import("solid-js/store")
    const { isVisiblyDistinctOnSurface } = await import("../src/tui/types.js")

    const runtimeMods = ensurePluginRuntime()
    ensureRuntimePluginSupport({
      additional: Object.fromEntries(
        Object.entries(runtimeMods).map(([k, loader]) => [
          k,
          (loader as () => any)(),
        ]),
      ) as Record<string, any>,
    })

    const repoDir = path.resolve(import.meta.dir, "..")
    const distSrc = path.join(repoDir, "dist")
    const tmpPkgRoot = path.join(repoDir, "node_modules", ".tmp-pkg-hover-test")
    const tmpDist = path.join(tmpPkgRoot, "opencode-workspaces", "dist")

    await rm(tmpPkgRoot, { recursive: true, force: true })
    await mkdir(tmpDist, { recursive: true })
    await cp(distSrc, tmpDist, { recursive: true })

    try {
      const distEntryPath = path.join(tmpDist, "tui.js")
      expect(isNodeModulesPath(distEntryPath)).toBe(true)

      const { default: DistTuiPlugin } = await import(
        `${pathToFileURL(distEntryPath).href}?t=${Date.now()}`
      )

      // Even on a flat theme where raised.base === raised.high === raised.max, hover synthesizes a distinct highlight
      const flatSurface = "#18181b"
      const flatTheme: any = {
        text: {
          base: "#e4e4e7",
          muted: "#a1a1aa",
          faint: "#71717a",
          action: {
            primary: { base: "#e4e4e7", hovered: "#ffffff", selected: "#60a5fa" },
          },
          feedback: {
            info: { base: "#38bdf8" },
            warning: { base: "#fbbf24" },
            danger: { base: "#f87171" },
            success: { base: "#4ade80" },
          },
        },
        background: {
          base: "#121215",
          raised: {
            base: flatSurface,
            low: flatSurface,
            high: flatSurface,
            max: flatSurface,
          },
          action: {
            primary: { base: flatSurface, hovered: flatSurface, selected: flatSurface },
          },
        },
        border: { base: "#27272a", subtle: "#27272a", selected: "#60a5fa" },
        surface: () => flatTheme,
      }

      const repoRoot = "/Users/dev/pkg-repo"
      const wtDir = "/Users/dev/pkg-repo/test-workspaces/workspace-1"
      const slots: any[] = []
      const [prefs, setPrefs] = createStore<any>({
        pinnedProjects: [],
        collapsedProjects: [],
        expandedSidebarWorktrees: [wtDir],
        showAllGitProjects: false,
        maxRecentProjects: 8,
      })
      const [cache, setCache] = createStore<any>({
        worktreesByProject: { "proj-pkg": [wtDir] },
        gitWorktreesByRoot: {},
        gitByDirectory: {
          [repoRoot]: { branch: "main", dirtyCount: 0, ahead: 0, behind: 0 },
          [wtDir]: {
            branch: "feat/pkg-hover",
            dirtyCount: 1,
            ahead: 0,
            behind: 0,
          },
        },
        lastSyncedAt: Date.now(),
      })

      const sessions = [
        {
          id: "sess-pkg",
          projectID: "proj-pkg",
          title: "Pkg Session",
          time: { created: 1, updated: 5 },
          location: { directory: wtDir },
        },
      ]

      const boot = await testRender(() => null as any, { width: 36, height: 28 })
      const mockContext: any = {
        options: {},
        location: { directory: wtDir },
        app: { version: "2.2.5", channel: "latest" },
        renderer: boot.renderer,
        client: {
          rpc: () => ({
            inspectLocations: async () => ({
              summaries: cache.gitByDirectory,
              worktreesByRoot: {},
            }),
            events: { on: () => () => {} },
          }),
          worktree: {
            refresh: async () => {},
            list: async () => [{ directory: wtDir }],
          },
          vcs: {
            get: async () => ({ data: { branch: { current: "feat/pkg-hover" } } }),
            status: async () => ({ data: [] }),
          },
          session: { create: async () => ({}), move: async () => {} },
        },
        data: {
          on: () => () => {},
          listen: () => () => {},
          session: {
            list: () => sessions,
            get: (id: string) => sessions.find((s) => s.id === id),
            root: (id: string) => id,
            family: (id: string) => [id],
            cost: () => 0,
            status: () => "idle",
            pending: { list: () => [], sync: async () => {}, invalidate: () => {} },
            sync: async () => {},
            invalidate: () => {},
            message: {
              list: () => [],
              get: () => undefined,
              sync: async () => {},
              invalidate: () => {},
            },
            permission: { list: () => [], sync: async () => {}, invalidate: () => {} },
            form: {
              list: () => [],
              sync: async () => {},
              invalidate: () => {},
              reply: async () => {},
              cancel: async () => {},
            },
          },
          project: {
            list: () => [
              {
                id: "proj-pkg",
                canonical: repoRoot,
                vcs: "git",
                name: "pkg-repo",
                sandboxes: [],
                time: { created: 1, updated: 5, active: 5 },
              },
            ],
            get: () => undefined,
            sync: async () => {},
            invalidate: () => {},
            permission: { list: () => [], sync: async () => {}, invalidate: () => {} },
          },
          shell: { list: () => [], get: () => undefined, sync: async () => {}, invalidate: () => {} },
          location: {
            default: () => ({ directory: wtDir }),
            sync: async () => {},
            invalidate: () => {},
            vcs: { info: () => undefined, sync: async () => {}, invalidate: () => {} },
          },
        },
        theme: flatTheme,
        themeMode: "dark",
        keymap: { layer: () => {} },
        storage: {
          store: () => [prefs, async (m: any) => setPrefs(produce(m))],
          memory: () => [cache, (m: any) => setCache(produce(m))],
        },
        ui: {
          dialog: { show: () => {}, set: () => {}, clear: () => {} },
          toast: { show: () => {} },
          format: { path: (p: string) => p },
          router: {
            register: () => () => {},
            navigate: () => {},
            current: () => ({ type: "session", sessionID: "sess-pkg" }),
          },
          panel: { open: () => true, close: () => {}, current: () => undefined },
          tabs: {
            enabled: () => true,
            list: () => [],
            open: () => true,
            focus: () => true,
            move: () => true,
            close: () => true,
          },
          slot: (c: any) => {
            slots.push(c)
            return () => {}
          },
        },
      }

      const cleanup = await DistTuiPlugin.setup(mockContext)
      boot.renderer.destroy()

      const sidebarClaim = slots.find((s) => s.before === "sidebar.footer")
      const ui = await testRender(
        () => sidebarClaim.render({ sessionID: "sess-pkg" }),
        { width: 36, height: 28, backgroundColor: flatSurface },
      )
      mockContext.renderer = ui.renderer
      await ui.renderOnce()

      const lines = ui.captureCharFrame().split("\n")
      const wtIdx = lines.findIndex((l) => l.includes("▾ feat/pkg-hover"))
      const sessIdx = lines.findIndex((l) => l.includes("Pkg Session"))
      const newSessIdx = lines.findIndex((l) => l.includes("+ New session"))
      const newSessBranchIdx = newSessIdx + 1

      const rowBg = (rowIdx: number) =>
        ui.captureSpans().lines[rowIdx]!.spans[0]!.bg

      expect(isVisiblyDistinctOnSurface(rowBg(wtIdx), flatSurface, 0.12)).toBe(
        false,
      )

      // Hover worktree row -> highlights distinctly
      await ui.mockMouse.moveTo(6, wtIdx)
      await ui.renderOnce()
      expect(isVisiblyDistinctOnSurface(rowBg(wtIdx), flatSurface, 0.12)).toBe(
        true,
      )

      // Hover unfolded session row -> clears worktree row and highlights session row
      await ui.mockMouse.moveTo(8, sessIdx)
      await new Promise((r) => setTimeout(r, 5))
      await ui.renderOnce()
      expect(isVisiblyDistinctOnSurface(rowBg(wtIdx), flatSurface, 0.12)).toBe(
        false,
      )
      expect(
        isVisiblyDistinctOnSurface(rowBg(sessIdx), flatSurface, 0.12),
      ).toBe(true)

      // Hover '+ New session' workspace second line -> highlights both lines together
      await ui.mockMouse.moveTo(5, newSessBranchIdx)
      await new Promise((r) => setTimeout(r, 5))
      await ui.renderOnce()
      expect(
        isVisiblyDistinctOnSurface(rowBg(newSessIdx), flatSurface, 0.12),
      ).toBe(true)
      expect(
        isVisiblyDistinctOnSurface(rowBg(newSessBranchIdx), flatSurface, 0.12),
      ).toBe(true)

      if (cleanup) await cleanup()
      ui.renderer.destroy()
    } finally {
      await rm(tmpPkgRoot, { recursive: true, force: true })
    }
  })

  test("syncs left session tab location/VCS info, retries transient startup sync errors, and spawns in nested worktrees before discovery", async () => {
    const { ensureRuntimePluginSupport } = await import(
      "@opentui/solid/runtime-plugin-support/configure"
    )
    const { ensurePluginRuntime } = await import("@opencode/plugin/runtime")
    const { testRender } = await import("@opentui/solid")
    const { createStore, produce } = await import("solid-js/store")

    const runtimeMods = ensurePluginRuntime()
    ensureRuntimePluginSupport({
      additional: Object.fromEntries(
        Object.entries(runtimeMods).map(([k, loader]) => [
          k,
          (loader as () => any)(),
        ]),
      ) as Record<string, any>,
    })

    const { default: TuiPlugin } = await import("../src/tui.js")

    const makeThemeToken = (): any =>
      new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === Symbol.toPrimitive) return () => "#ffffff"
            if (
              prop === "base" ||
              prop === "muted" ||
              prop === "faint" ||
              prop === "selected" ||
              prop === "focused" ||
              prop === "hovered" ||
              prop === "disabled" ||
              prop === "low" ||
              prop === "high" ||
              prop === "max" ||
              typeof prop === "number" ||
              /^\d+$/.test(String(prop))
            ) {
              return "#aabbcc"
            }
            if (prop === "surface") return () => makeThemeToken()
            return makeThemeToken()
          },
        },
      )

    const repoRoot = "/Users/dev/opencode-workspaces"
    const nestedWt = "/Users/dev/opencode-workspaces/test-workspaces/workspace-1"
    const siblingWt = "/Users/dev/opencode-workspaces-wt2"

    const sessions: any[] = [
      {
        id: "sess-nested",
        projectID: "proj-v2",
        title: "Nested WT Session",
        time: { created: 1, updated: 10 },
        location: { directory: nestedWt },
      },
      {
        id: "sess-tab-2",
        projectID: "proj-v2",
        title: "Open Tab 2",
        time: { created: 1, updated: 8 },
        location: { directory: siblingWt },
      },
    ]

    const syncedLocations = new Set<string>()
    const syncedVcsLocations = new Set<string>()
    const openedTabs: string[] = []
    const focusedTabs: string[] = []
    const createdDirs: string[] = []
    let failNextLocationSync = true
    const slots: any[] = []

    const [prefs, setPrefs] = createStore<any>({
      pinnedProjects: [],
      collapsedProjects: [],
      expandedSidebarWorktrees: [],
      showAllGitProjects: false,
      maxRecentProjects: 8,
    })
    const [cache, setCache] = createStore<any>({
      worktreesByProject: {},
      gitWorktreesByRoot: {},
      gitByDirectory: {},
      lastSyncedAt: 0,
    })

    const boot = await testRender(() => null as any, { width: 38, height: 28 })
    const mockContext: any = {
      options: {},
      location: { directory: repoRoot },
      app: { version: "2.2.5", channel: "latest" },
      renderer: boot.renderer,
      client: {
        rpc: () => ({
          inspectLocations: async () => {
            throw new Error("RPC pending")
          },
          events: { on: () => () => {} },
        }),
        worktree: {
          refresh: async () => {},
          list: async () => [],
        },
        vcs: {
          get: async () => ({
            data: {
              provider: "git",
              branch: { current: "test/workspace-1", default: "main" },
            },
          }),
          status: async () => ({ data: [] }),
        },
        session: {
          create: async ({ location }: any) => {
            createdDirs.push(location.directory)
            const created = {
              id: "sess-spawned-nested",
              projectID: "proj-v2",
              title: "Spawned Nested",
              time: { created: 10, updated: 20 },
              location,
            }
            sessions.push(created)
            return created
          },
          move: async () => {},
        },
      },
      data: {
        on: () => () => {},
        listen: () => () => {},
        session: {
          list: () => sessions,
          get: (id: string) => sessions.find((s) => s.id === id),
          root: (id: string) => id,
          family: (id: string) => [id],
          cost: () => 0,
          status: () => "idle",
          pending: { list: () => [], sync: async () => {}, invalidate: () => {} },
          sync: async () => {},
          invalidate: () => {},
          message: {
            list: () => [],
            get: () => undefined,
            sync: async () => {},
            invalidate: () => {},
          },
          permission: { list: () => [], sync: async () => {}, invalidate: () => {} },
          form: {
            list: () => [],
            sync: async () => {},
            invalidate: () => {},
            reply: async () => {},
            cancel: async () => {},
          },
        },
        project: {
          list: () => [
            {
              id: "proj-v2",
              canonical: repoRoot,
              vcs: "git",
              name: "opencode-workspaces",
              sandboxes: [], // OpenCode v2 always has empty sandboxes[]
              time: { created: 1, updated: 10, active: 10 },
            },
          ],
          get: () => ({
            id: "proj-v2",
            canonical: repoRoot,
            vcs: "git",
            name: "opencode-workspaces",
            sandboxes: [],
            time: { created: 1, updated: 10, active: 10 },
          }),
          sync: async () => {},
          invalidate: () => {},
          permission: { list: () => [], sync: async () => {}, invalidate: () => {} },
        },
        shell: { list: () => [], get: () => undefined, sync: async () => {}, invalidate: () => {} },
        location: {
          default: () => ({ directory: repoRoot }),
          sync: async (loc?: { directory: string }) => {
            if (failNextLocationSync) {
              failNextLocationSync = false
              throw new Error("Transient startup connection not ready")
            }
            if (loc?.directory) syncedLocations.add(loc.directory)
          },
          invalidate: () => {},
          vcs: {
            info: (loc?: { directory: string }) =>
              loc?.directory && syncedVcsLocations.has(loc.directory)
                ? { branch: { current: "test/workspace-1", default: "main" } }
                : undefined,
            sync: async (loc?: { directory: string }) => {
              if (loc?.directory) syncedVcsLocations.add(loc.directory)
            },
            invalidate: () => {},
          },
        },
      },
      theme: makeThemeToken(),
      themeMode: "dark",
      keymap: { layer: () => {} },
      storage: {
        store: () => [prefs, async (m: any) => setPrefs(produce(m))],
        memory: () => [cache, (m: any) => setCache(produce(m))],
      },
      ui: {
        dialog: { show: () => {}, set: () => {}, clear: () => {} },
        toast: { show: () => {} },
        format: { path: (p: string) => p },
        router: {
          register: () => () => {},
          navigate: () => {},
          current: () => ({ type: "session", sessionID: "sess-nested" }),
        },
        panel: { open: () => true, close: () => {}, current: () => undefined },
        tabs: {
          enabled: () => true,
          list: () => [
            {
              sessionID: "sess-nested",
              active: true,
              busy: false,
              attention: false,
            },
            {
              sessionID: "sess-tab-2",
              active: false,
              busy: false,
              attention: false,
            },
          ],
          open: (id: string) => {
            openedTabs.push(id)
            return true
          },
          focus: (id: string) => {
            focusedTabs.push(id)
            return true
          },
          move: () => true,
          close: () => true,
        },
        slot: (c: any) => {
          slots.push(c)
          return () => {}
        },
      },
    }

    const cleanup = await TuiPlugin.setup(mockContext)
    boot.renderer.destroy()

    const sidebarClaim = slots.find((s) => s.before === "sidebar.footer")
    const ui = await testRender(
      () => sidebarClaim.render({ sessionID: "sess-nested" }),
      { width: 38, height: 28 },
    )
    mockContext.renderer = ui.renderer
    await ui.renderOnce()

    // Immediately on first frame (before async refresh), '+ New session' targets nested worktree, NOT canonical 'main'
    const initialLines = ui.captureCharFrame().split("\n")
    const newSessIdx = initialLines.findIndex((l) => l.includes("+ New session"))
    expect(initialLines[newSessIdx + 1]).toContain("workspace-1")

    // Wait for initial refresh cycle -> retries failed initial location.sync AND syncs all open left session tabs!
    await new Promise((r) => setTimeout(r, 150))
    await ui.renderOnce()
    expect(syncedLocations.has(nestedWt)).toBe(true)
    expect(syncedVcsLocations.has(nestedWt)).toBe(true)
    expect(syncedLocations.has(siblingWt)).toBe(true)
    expect(syncedVcsLocations.has(siblingWt)).toBe(true)

    // Clicking '+ New session' spawns inside `nestedWt` (not `repoRoot`!), opens & focuses left tab, and syncs location
    const refreshedLines = ui.captureCharFrame().split("\n")
    const btnIdx = refreshedLines.findIndex((l) => l.includes("+ New session"))
    await ui.mockMouse.click(4, btnIdx)
    await new Promise((r) => setTimeout(r, 50))

    expect(createdDirs).toEqual([nestedWt])
    expect(openedTabs).toContain("sess-spawned-nested")
    expect(focusedTabs).toContain("sess-spawned-nested")

    if (cleanup) await cleanup()
    ui.renderer.destroy()
  })

  test("renders /ws switcher primary checkout as 'Project sessions  ⎇ <branch>' while keeping secondary worktree branch labels", async () => {
    const { ensureRuntimePluginSupport } = await import(
      "@opentui/solid/runtime-plugin-support/configure"
    )
    const { ensurePluginRuntime } = await import("@opencode/plugin/runtime")
    const { testRender } = await import("@opentui/solid")
    const { createStore, produce } = await import("solid-js/store")
    const { migrateV1NewDesigns, resolveThemeDocument } = await import(
      "@opencode/theme/tui"
    )

    const runtimeMods = ensurePluginRuntime()
    ensureRuntimePluginSupport({
      additional: Object.fromEntries(
        Object.entries(runtimeMods).map(([k, loader]) => [
          k,
          (loader as () => any)(),
        ]),
      ) as Record<string, any>,
    })

    const { default: TuiPlugin } = await import("../src/tui.js")

    const darkTheme = resolveThemeDocument(
      migrateV1NewDesigns({
        theme: {
          primary: "#7aa2f7",
          secondary: "#bb9af7",
          accent: "#ff9e64",
          error: "#f7768e",
          warning: "#e0af68",
          success: "#9ece6a",
          info: "#7dcfff",
          text: "#c0caf5",
          textMuted: "#565f89",
          background: "#1a1b26",
          backgroundPanel: "#16161e",
          backgroundElement: "#292e42",
          border: "#3b4261",
          borderActive: "#7aa2f7",
          borderSubtle: "#292e42",
          diffAdded: "#9ece6a",
          diffRemoved: "#f7768e",
          diffContext: "#565f89",
          diffHunkHeader: "#7aa2f7",
          diffHighlightAdded: "#9ece6a",
          diffHighlightRemoved: "#f7768e",
          diffAddedBg: "#20303b",
          diffRemovedBg: "#37222c",
          diffContextBg: "#1a1b26",
          diffLineNumber: "#565f89",
          diffAddedLineNumberBg: "#20303b",
          diffRemovedLineNumberBg: "#37222c",
          markdownText: "#c0caf5",
          markdownHeading: "#bb9af7",
          markdownLink: "#7aa2f7",
          markdownLinkText: "#7dcfff",
          markdownCode: "#9ece6a",
          markdownBlockQuote: "#e0af68",
          markdownEmph: "#e0af68",
          markdownStrong: "#ff9e64",
          markdownHorizontalRule: "#565f89",
          markdownListItem: "#2e7de9",
          markdownListEnumeration: "#7dcfff",
          markdownImage: "#7aa2f7",
          markdownImageText: "#7dcfff",
          markdownCodeBlock: "#c0caf5",
          syntaxComment: "#565f89",
          syntaxKeyword: "#bb9af7",
          syntaxFunction: "#7aa2f7",
          syntaxVariable: "#c0caf5",
          syntaxString: "#9ece6a",
          syntaxNumber: "#ff9e64",
          syntaxType: "#2ac3de",
          syntaxOperator: "#89ddff",
          syntaxPunctuation: "#c0caf5",
        },
      } as any),
      "dark",
    )

    const repoRoot = "/Users/dev/opencode-workspaces"
    const wt1Dir = "/Users/dev/opencode-workspaces/test-workspaces/workspace-1"
    let dialogRenderFn: (() => any) | undefined
    const commands: any[] = []

    const [prefs, setPrefs] = createStore<any>({
      pinnedProjects: [],
      collapsedProjects: [],
      expandedSidebarWorktrees: [],
      showAllGitProjects: false,
      maxRecentProjects: 8,
    })
    const [cache, setCache] = createStore<any>({
      worktreesByProject: { "proj-ws": [wt1Dir] },
      gitWorktreesByRoot: {},
      gitByDirectory: {
        [repoRoot]: {
          branch: "feat/in-place-branch",
          dirtyCount: 2,
          ahead: 0,
          behind: 0,
        },
        [wt1Dir]: {
          branch: "test/workspace-1",
          dirtyCount: 0,
          ahead: 0,
          behind: 0,
        },
      },
      lastSyncedAt: Date.now(),
    })

    const sessions = [
      {
        id: "sess-root-1",
        projectID: "proj-ws",
        title: "Root Session A",
        time: { created: 1, updated: 10 },
        location: { directory: repoRoot },
      },
      {
        id: "sess-wt-1",
        projectID: "proj-ws",
        title: "Worktree Session B",
        time: { created: 2, updated: 8 },
        location: { directory: wt1Dir },
      },
    ]

    const boot = await testRender(() => null as any, { width: 68, height: 26 })
    const mockContext: any = {
      options: {},
      location: { directory: repoRoot },
      app: { version: "2.2.5", channel: "latest" },
      renderer: boot.renderer,
      client: {
        rpc: () => ({
          inspectLocations: async () => ({
            summaries: cache.gitByDirectory,
            worktreesByRoot: {},
          }),
          events: { on: () => () => {} },
        }),
        worktree: {
          refresh: async () => {},
          list: async () => [{ directory: wt1Dir }],
        },
        vcs: {
          get: async () => ({ data: { branch: { current: "feat/in-place-branch" } } }),
          status: async () => ({ data: [] }),
        },
        session: { create: async () => ({}), move: async () => {} },
      },
      data: {
        on: () => () => {},
        listen: () => () => {},
        session: {
          list: () => sessions,
          get: (id: string) => sessions.find((s) => s.id === id),
          root: (id: string) => id,
          family: (id: string) => [id],
          cost: () => 0,
          status: () => "idle",
          pending: { list: () => [], sync: async () => {}, invalidate: () => {} },
          sync: async () => {},
          invalidate: () => {},
          message: { list: () => [], get: () => undefined, sync: async () => {}, invalidate: () => {} },
          permission: { list: () => [], sync: async () => {}, invalidate: () => {} },
          form: { list: () => [], sync: async () => {}, invalidate: () => {}, reply: async () => {}, cancel: async () => {} },
        },
        project: {
          list: () => [
            {
              id: "proj-ws",
              canonical: repoRoot,
              vcs: "git",
              name: "opencode-workspaces",
              sandboxes: [],
              time: { created: 1, updated: 10, active: 10 },
            },
          ],
          get: () => undefined,
          sync: async () => {},
          invalidate: () => {},
          permission: { list: () => [], sync: async () => {}, invalidate: () => {} },
        },
        shell: { list: () => [], get: () => undefined, sync: async () => {}, invalidate: () => {} },
        location: {
          default: () => ({ directory: repoRoot }),
          sync: async () => {},
          invalidate: () => {},
          vcs: { info: () => undefined, sync: async () => {}, invalidate: () => {} },
        },
      },
      theme: darkTheme,
      themeMode: "dark",
      keymap: {
        layer: (fn: any) => {
          const l = fn()
          if (l.commands) commands.push(...l.commands)
        },
      },
      storage: {
        store: () => [prefs, async (m: any) => setPrefs(produce(m))],
        memory: () => [cache, (m: any) => setCache(produce(m))],
      },
      ui: {
        dialog: {
          show: (renderFn: () => any) => {
            dialogRenderFn = renderFn
          },
          set: () => {},
          clear: () => {},
        },
        toast: { show: () => {} },
        format: { path: (p: string) => p },
        router: {
          register: () => () => {},
          navigate: () => {},
          current: () => ({ type: "session", sessionID: "sess-root-1" }),
        },
        panel: { open: () => true, close: () => {}, current: () => undefined },
        tabs: {
          enabled: () => true,
          list: () => [],
          open: () => true,
          focus: () => true,
          move: () => true,
          close: () => true,
        },
        slot: () => () => {},
      },
    }

    const cleanup = await TuiPlugin.setup(mockContext)
    boot.renderer.destroy()

    const wsCmd = commands.find((c) => c.id === "workspaces.switcher")
    await wsCmd.run("/ws")
    expect(dialogRenderFn).toBeDefined()

    const dialogUi = await testRender(() => dialogRenderFn!(), {
      width: 68,
      height: 26,
    })
    mockContext.renderer = dialogUi.renderer
    await dialogUi.renderOnce()

    const frame = dialogUi.captureCharFrame()
    const lines = frame.split("\n")

    const canonicalLine = lines.find((l) => l.includes("Project sessions"))!
    const secondaryLine = lines.find((l) => l.includes("test/workspace-1"))!

    expect(canonicalLine).toBeDefined()
    expect(canonicalLine).toContain("⎇ feat/in-place-branch")
    expect(frame).toContain("└─ ▸ Root Session A")
    expect(secondaryLine).toBeDefined()
    expect(secondaryLine).toContain("workspace-1")
    expect(frame).toContain("└─ · Worktree Session B")

    if (cleanup) await cleanup()
    dialogUi.renderer.destroy()
  })

  test("deletes sessions via right-click context menu, hover '×' button, and 'x' shortcut in Worktrees pane", async () => {
    const { MouseButton } = await import("@opentui/core")
    const { ensureRuntimePluginSupport } = await import(
      "@opentui/solid/runtime-plugin-support/configure"
    )
    const { ensurePluginRuntime } = await import("@opencode/plugin/runtime")
    const { testRender } = await import("@opentui/solid")
    const { createStore, produce } = await import("solid-js/store")

    const runtimeMods = ensurePluginRuntime()
    ensureRuntimePluginSupport({
      additional: Object.fromEntries(
        Object.entries(runtimeMods).map(([k, loader]) => [
          k,
          (loader as () => any)(),
        ]),
      ) as Record<string, any>,
    })

    const { default: TuiPlugin } = await import("../src/tui.js")

    const makeThemeToken = (): any =>
      new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === Symbol.toPrimitive) return () => "#ffffff"
            if (
              prop === "base" ||
              prop === "muted" ||
              prop === "faint" ||
              prop === "selected" ||
              prop === "focused" ||
              prop === "hovered" ||
              prop === "disabled" ||
              prop === "low" ||
              prop === "high" ||
              prop === "max" ||
              typeof prop === "number" ||
              /^\d+$/.test(String(prop))
            ) {
              return "#aabbcc"
            }
            if (prop === "surface") return () => makeThemeToken()
            return makeThemeToken()
          },
        },
      )

    const repoRoot = "/Users/dev/del-repo"
    const wtDir = "/Users/dev/del-repo/test-workspaces/workspace-1"
    const removedSessionIDs: string[] = []
    const closedTabs: string[] = []
    const navigatedSessions: string[] = []
    const selectCalls: any[] = []
    const confirmCalls: any[] = []
    let activeSessionID = "sess-1"
    const slots: any[] = []

    const sessions = [
      {
        id: "sess-1",
        projectID: "proj-del",
        title: "First Session",
        time: { created: 1, updated: 30 },
        location: { directory: wtDir },
      },
      {
        id: "sess-2",
        projectID: "proj-del",
        title: "Second Session",
        time: { created: 2, updated: 20 },
        location: { directory: wtDir },
      },
      {
        id: "sess-3",
        projectID: "proj-del",
        title: "Third Session",
        time: { created: 3, updated: 10 },
        location: { directory: wtDir },
      },
    ]

    const [prefs, setPrefs] = createStore<any>({
      pinnedProjects: [],
      collapsedProjects: [],
      expandedSidebarWorktrees: [wtDir],
      showAllGitProjects: false,
      maxRecentProjects: 8,
    })
    const [cache, setCache] = createStore<any>({
      worktreesByProject: { "proj-del": [wtDir] },
      gitWorktreesByRoot: {},
      gitByDirectory: {
        [repoRoot]: { branch: "main", dirtyCount: 0, ahead: 0, behind: 0 },
        [wtDir]: {
          branch: "feat/delete-session",
          dirtyCount: 0,
          ahead: 0,
          behind: 0,
        },
      },
      lastSyncedAt: Date.now(),
    })

    const boot = await testRender(() => null as any, { width: 38, height: 28 })
    const mockContext: any = {
      options: {},
      location: { directory: wtDir },
      app: { version: "2.2.5", channel: "latest" },
      renderer: boot.renderer,
      client: {
        rpc: () => ({
          inspectLocations: async () => ({
            summaries: cache.gitByDirectory,
            worktreesByRoot: {},
          }),
          events: { on: () => () => {} },
        }),
        worktree: {
          refresh: async () => {},
          list: async () => [{ directory: wtDir }],
        },
        vcs: {
          get: async () => ({ data: { branch: { current: "feat/delete-session" } } }),
          status: async () => ({ data: [] }),
        },
        session: {
          create: async () => ({}),
          move: async () => {},
          remove: async ({ sessionID }: { sessionID: string }) => {
            removedSessionIDs.push(sessionID)
          },
        },
      },
      data: {
        on: () => () => {},
        listen: () => () => {},
        session: {
          list: () => sessions,
          get: (id: string) => sessions.find((s) => s.id === id),
          root: (id: string) => id,
          family: (id: string) => [id],
          cost: () => 0,
          status: () => "idle",
          pending: { list: () => [], sync: async () => {}, invalidate: () => {} },
          sync: async () => {},
          invalidate: () => {},
          message: { list: () => [], get: () => undefined, sync: async () => {}, invalidate: () => {} },
          permission: { list: () => [], sync: async () => {}, invalidate: () => {} },
          form: { list: () => [], sync: async () => {}, invalidate: () => {}, reply: async () => {}, cancel: async () => {} },
        },
        project: {
          list: () => [
            {
              id: "proj-del",
              canonical: repoRoot,
              vcs: "git",
              name: "del-repo",
              sandboxes: [],
              time: { created: 1, updated: 30, active: 30 },
            },
          ],
          get: () => undefined,
          sync: async () => {},
          invalidate: () => {},
          permission: { list: () => [], sync: async () => {}, invalidate: () => {} },
        },
        shell: { list: () => [], get: () => undefined, sync: async () => {}, invalidate: () => {} },
        location: {
          default: () => ({ directory: wtDir }),
          sync: async () => {},
          invalidate: () => {},
          vcs: { info: () => undefined, sync: async () => {}, invalidate: () => {} },
        },
      },
      theme: makeThemeToken(),
      themeMode: "dark",
      keymap: { layer: () => {} },
      storage: {
        store: () => [prefs, async (m: any) => setPrefs(produce(m))],
        memory: () => [cache, (m: any) => setCache(produce(m))],
      },
      ui: {
        dialog: {
          show: () => {},
          set: () => {},
          clear: () => {},
          select: async (opts: any) => {
            selectCalls.push(opts)
            return "delete"
          },
          confirm: async (opts: any) => {
            confirmCalls.push(opts)
            return true
          },
        },
        toast: { show: () => {} },
        format: { path: (p: string) => p },
        router: {
          register: () => () => {},
          navigate: (dest: any) => {
            if (dest.type === "session") {
              activeSessionID = dest.sessionID
              navigatedSessions.push(dest.sessionID)
            }
          },
          current: () => ({ type: "session", sessionID: activeSessionID }),
        },
        panel: { open: () => true, close: () => {}, current: () => undefined },
        tabs: {
          enabled: () => true,
          list: () => [
            { sessionID: "sess-1", active: true, busy: false, attention: false },
            { sessionID: "sess-2", active: false, busy: false, attention: false },
          ],
          open: () => true,
          focus: () => true,
          move: () => true,
          close: (id?: string) => {
            if (id) closedTabs.push(id)
            return true
          },
        },
        slot: (c: any) => {
          slots.push(c)
          return () => {}
        },
      },
    }

    const cleanup = await TuiPlugin.setup(mockContext)
    boot.renderer.destroy()

    const sidebarClaim = slots.find((s) => s.before === "sidebar.footer")
    const sidebarUi = await testRender(
      () => sidebarClaim.render({ sessionID: activeSessionID }),
      { width: 38, height: 28 },
    )
    mockContext.renderer = sidebarUi.renderer
    await sidebarUi.renderOnce()

    // 1. Right-click on 'Second Session' -> opens context menu (without navigating!), deletes 'sess-2', closes tab, and removes row
    const initialLines = sidebarUi.captureCharFrame().split("\n")
    const secondIdx = initialLines.findIndex((l) =>
      l.includes("Second Session"),
    )
    expect(secondIdx).toBeGreaterThan(0)

    await sidebarUi.mockMouse.click(10, secondIdx, MouseButton.RIGHT)
    await new Promise((r) => setTimeout(r, 40))
    await sidebarUi.renderOnce()

    expect(selectCalls).toHaveLength(1)
    expect(selectCalls[0]!.title).toBe("Second Session")
    expect(selectCalls[0]!.options.map((o: any) => o.value)).toEqual([
      "delete",
      "open",
      "close-tab",
    ])
    expect(navigatedSessions).toEqual([])
    expect(removedSessionIDs).toEqual(["sess-2"])
    expect(closedTabs).toEqual(["sess-2"])
    expect(sidebarUi.captureCharFrame()).not.toContain("Second Session")

    // 2. Hover 'First Session' (active) -> reveals '×' delete button; clicking '×' deletes 'sess-1' and navigates to remaining 'sess-3'
    const afterRightClickLines = sidebarUi.captureCharFrame().split("\n")
    const firstIdx = afterRightClickLines.findIndex((l) =>
      l.includes("First Session"),
    )
    expect(firstIdx).toBeGreaterThan(0)

    await sidebarUi.mockMouse.moveTo(10, firstIdx)
    await sidebarUi.renderOnce()
    const hoveredFirstLine = sidebarUi.captureCharFrame().split("\n")[firstIdx]!
    const deleteCol = hoveredFirstLine.lastIndexOf("×")
    expect(deleteCol).toBeGreaterThan(15)

    await sidebarUi.mockMouse.click(deleteCol, firstIdx, MouseButton.LEFT)
    await new Promise((r) => setTimeout(r, 40))
    await sidebarUi.renderOnce()

    expect(removedSessionIDs).toEqual(["sess-2", "sess-1"])
    expect(closedTabs).toEqual(["sess-2", "sess-1"])
    expect(navigatedSessions).toContain("sess-3")
    expect(sidebarUi.captureCharFrame()).not.toContain("First Session")
    expect(sidebarUi.captureCharFrame()).toContain("Third Session")

    sidebarUi.renderer.destroy()

    // 3. Pressing 'x' on a selected session row in WorkspacesPanel (Ctrl+G) deletes that session (not the worktree)
    const panelClaim = slots.find((s) => s.append === "session.panel")
    const panelUi = await testRender(
      () =>
        panelClaim.render({
          name: "opencode-workspaces.panel",
          sessionID: "sess-3",
          width: 44,
          presentation: "panel",
          focused: true,
          focus: () => {},
          close: () => {},
          toggleFullscreen: () => {},
        }),
      { width: 44, height: 24 },
    )
    mockContext.renderer = panelUi.renderer
    await panelUi.renderOnce()
    expect(panelUi.captureCharFrame()).toContain("Third Session")

    panelUi.mockInput.pressKey("x")
    await new Promise((r) => setTimeout(r, 40))
    await panelUi.renderOnce()

    expect(removedSessionIDs).toEqual(["sess-2", "sess-1", "sess-3"])
    expect(panelUi.captureCharFrame()).not.toContain("Third Session")

    if (cleanup) await cleanup()
    panelUi.renderer.destroy()
  })
})

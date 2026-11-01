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
})

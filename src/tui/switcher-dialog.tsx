/** @jsxImportSource @opentui/solid */
import {
  TextAttributes,
  type BoxRenderable,
  type InputRenderable,
  type KeyEvent,
  type ScrollBoxRenderable,
} from "@opentui/core"
import { For, Show, createEffect, createMemo, createSignal, onMount } from "solid-js"
import {
  dirBasename,
  filterWorkspaceTreeForSwitcher,
  rollupHiddenWorktreeStatus,
  type AgentStatus,
  type SwitcherSelectableRow,
} from "../model.js"
import { createHoverKeySignal } from "./hover.js"
import { HoverMarqueeText } from "./marquee.js"
import type { WorkspacesController } from "./state.js"
import {
  resolveDialogHoverBg,
  sameStringArray,
  statusGlyph,
  statusLabel,
  worktreeGlyph,
} from "./types.js"

export const WorkspaceSwitcherDialog = (props: {
  readonly ctrl: WorkspacesController
  readonly initialShowAll?: boolean
}) => {
  const { ctrl } = props
  const { context } = ctrl
  const getRenderer = () => context.renderer

  const dialogTheme = context.theme.surface("dialog")
  const footerTheme = context.theme.surface("dialog.footer")

  const initialCurrentSnap = ctrl.buildSnapshot({
    currentProjectOnly: true,
    onlyRelevantProjects: false,
  })
  const startShowAll =
    props.initialShowAll ??
    (ctrl.prefs.showAllGitProjects || initialCurrentSnap.projects.length === 0)

  const [showAll, setShowAll] = createSignal(startShowAll)
  const [query, setQuery] = createSignal("")
  const [selectedKey, setSelectedKey] = createSignal("")
  const rowHover = createHoverKeySignal()
  const hoveredKey = rowHover.hoveredKey
  const footerHover = createHoverKeySignal()
  const hoveredFooterAction = footerHover.hoveredKey
  let userMovedSelection = false

  let inputRef: InputRenderable | undefined
  let scrollRef: ScrollBoxRenderable | undefined
  const rowRefs = new Map<string, BoxRenderable>()
  const handledEvents = new WeakSet<KeyEvent>()

  onMount(() => {
    void ctrl
      .refreshWorkspacesData({ includeAllProjects: startShowAll })
      .catch(() => {})
    queueMicrotask(() => {
      inputRef?.focus()
    })
  })

  const snap = createMemo(() => {
    const all = showAll()
    const primary = ctrl.buildSnapshot({
      currentProjectOnly: !all,
      onlyRelevantProjects: false,
    })
    if (!all && primary.projects.length === 0) {
      return ctrl.buildSnapshot({ onlyRelevantProjects: false })
    }
    return primary
  })

  const filtered = createMemo(() =>
    filterWorkspaceTreeForSwitcher(snap().projects, query()),
  )

  const projectIDs = createMemo(
    () => filtered().projects.map((p) => p.project.id),
    [],
    { equals: sameStringArray },
  )

  let closed = false

  const closeDialog = () => {
    if (closed) return false
    closed = true
    context.ui.dialog.clear()
    return true
  }

  const scrollRowIntoView = (key: string) => {
    if (closed) return
    const el = rowRefs.get(key)
    if (el && !el.isDestroyed && scrollRef && !scrollRef.isDestroyed) {
      scrollRef.scrollChildIntoView(el, { align: "nearest", inset: 1 })
    }
  }

  let prevTrimmedQuery = ""
  createEffect(() => {
    const rows = filtered().selectableRows
    const trimmed = query().trim()
    const queryChanged = trimmed !== prevTrimmedQuery
    prevTrimmedQuery = trimmed

    if (rows.length === 0) {
      setSelectedKey("")
      return
    }

    if (trimmed.length > 0) {
      const existing = rows.find((r) => r.key === selectedKey())
      if (!queryChanged && existing) return
      const bestMatch = rows.find((r) => r.directlyMatched) ?? rows[0]!
      setSelectedKey(bestMatch.key)
      queueMicrotask(() => scrollRowIntoView(bestMatch.key))
      return
    }

    const preferred =
      rows.find((r) => r.kind === "session" && r.session.isCurrent) ??
      rows.find((r) => r.kind === "worktree" && r.worktree.isCurrent)

    if (!userMovedSelection && preferred) {
      if (selectedKey() !== preferred.key) {
        setSelectedKey(preferred.key)
        queueMicrotask(() => scrollRowIntoView(preferred.key))
      }
      return
    }

    const existing = rows.find((r) => r.key === selectedKey())
    if (existing) return

    const initial = preferred ?? rows[0]!
    setSelectedKey(initial.key)
    queueMicrotask(() => scrollRowIntoView(initial.key))
  })

  const selectedRow = createMemo<SwitcherSelectableRow | undefined>(() => {
    const rows = filtered().selectableRows
    if (rows.length === 0) return undefined
    const key = selectedKey()
    return rows.find((r) => r.key === key) ?? rows[0]
  })

  const canRemoveSelected = createMemo(() => {
    const row = selectedRow()
    return Boolean(row && !row.worktree.isCanonical)
  })

  const moveSelection = (delta: number) => {
    const rows = filtered().selectableRows
    if (rows.length === 0) return
    userMovedSelection = true
    const currentKey = selectedRow()?.key
    const idx = currentKey ? rows.findIndex((r) => r.key === currentKey) : -1
    const start = idx === -1 ? 0 : idx
    const nextIdx = (((start + delta) % rows.length) + rows.length) % rows.length
    const target = rows[nextIdx]
    if (target) {
      setSelectedKey(target.key)
      scrollRowIntoView(target.key)
    }
  }

  const activateSwitcherRow = (row: SwitcherSelectableRow | undefined) => {
    if (!row || !closeDialog()) return
    if (row.kind === "session") {
      ctrl.activateSession(
        row.session.id,
        row.worktree.directory,
        row.project.id,
      )
    } else {
      void ctrl.openWorktree(
        row.worktree.directory,
        row.worktree.primarySessionID,
        row.project.id,
      )
    }
  }

  const triggerNewWorktree = () => {
    const row = selectedRow()
    const proj = row
      ? {
          id: row.project.id,
          name: row.project.name,
          canonical: row.project.canonical,
        }
      : ctrl.findCurrentProject()
    if (!proj || !closeDialog()) return
    void ctrl.createWorktreeFlow(proj)
  }

  const triggerNewSession = () => {
    const row = selectedRow()
    const dir = row?.worktree.directory ?? ctrl.resolveActiveDirectory()
    if (!dir || !closeDialog()) return
    void ctrl.createSessionInDirectory(
      dir,
      `Started session in ${dirBasename(dir)}`,
      row?.project.id,
    )
  }

  const triggerOpenEditor = () => {
    const row = selectedRow()
    const dir = row?.worktree.directory ?? ctrl.resolveActiveDirectory()
    if (!dir || !closeDialog()) return
    void ctrl.openWorktreeInEditor(dir)
  }

  const triggerRemoveWorktree = () => {
    const row = selectedRow()
    if (!row || row.worktree.isCanonical || !closeDialog()) return
    void ctrl.removeWorktreeFlow(row.project, row.worktree)
  }

  const triggerToggleAll = () => {
    if (closed) return
    const next = !showAll()
    setShowAll(next)
    if (next) {
      void ctrl.refreshWorkspacesData({ includeAllProjects: true }).catch(() => {})
    }
  }

  const consumeOnce = (event: KeyEvent | undefined, fn: () => void) => {
    if (closed) return
    if (event) {
      if (handledEvents.has(event) || event.defaultPrevented) return
      handledEvents.add(event)
      event.preventDefault()
      event.stopPropagation()
    }
    fn()
  }

  context.keymap.layer(() => ({
    mode: "global",
    priority: 50,
    commands: [
      {
        bind: "up",
        run: (_input, event) => consumeOnce(event, () => moveSelection(-1)),
      },
      {
        bind: "down",
        run: (_input, event) => consumeOnce(event, () => moveSelection(1)),
      },
      {
        bind: "ctrl+p",
        run: (_input, event) => consumeOnce(event, () => moveSelection(-1)),
      },
      {
        bind: "ctrl+k",
        run: (_input, event) => consumeOnce(event, () => moveSelection(-1)),
      },
      {
        bind: "ctrl+j",
        run: (_input, event) => consumeOnce(event, () => moveSelection(1)),
      },
      {
        bind: "pageup",
        run: (_input, event) => consumeOnce(event, () => moveSelection(-6)),
      },
      {
        bind: "pagedown",
        run: (_input, event) => consumeOnce(event, () => moveSelection(6)),
      },
      {
        bind: "return",
        run: (_input, event) =>
          consumeOnce(event, () => activateSwitcherRow(selectedRow())),
      },
      {
        bind: "escape",
        run: (_input, event) =>
          consumeOnce(event, () => {
            closeDialog()
          }),
      },
      {
        bind: "ctrl+n",
        run: (_input, event) =>
          consumeOnce(event, () => triggerNewWorktree()),
      },
      {
        bind: "ctrl+s",
        run: (_input, event) =>
          consumeOnce(event, () => triggerNewSession()),
      },
      {
        bind: "ctrl+o",
        run: (_input, event) =>
          consumeOnce(event, () => triggerOpenEditor()),
      },
      {
        bind: "ctrl+x",
        run: (_input, event) =>
          consumeOnce(event, () => triggerRemoveWorktree()),
      },
      {
        bind: "ctrl+a",
        run: (_input, event) =>
          consumeOnce(event, () => triggerToggleAll()),
      },
    ],
  }))

  const handleInputKeyDown = (event: KeyEvent) => {
    if (handledEvents.has(event) || event.defaultPrevented) return

    if (event.ctrl && !event.meta) {
      switch (event.name) {
        case "n":
          consumeOnce(event, () => triggerNewWorktree())
          return
        case "s":
          consumeOnce(event, () => triggerNewSession())
          return
        case "o":
          consumeOnce(event, () => triggerOpenEditor())
          return
        case "x":
          consumeOnce(event, () => triggerRemoveWorktree())
          return
        case "a":
          consumeOnce(event, () => triggerToggleAll())
          return
        case "p":
        case "k":
          consumeOnce(event, () => moveSelection(-1))
          return
        case "j":
          consumeOnce(event, () => moveSelection(1))
          return
      }
    }

    switch (event.name) {
      case "up":
        consumeOnce(event, () => moveSelection(-1))
        return
      case "down":
        consumeOnce(event, () => moveSelection(1))
        return
      case "pageup":
        consumeOnce(event, () => moveSelection(-6))
        return
      case "pagedown":
        consumeOnce(event, () => moveSelection(6))
        return
      case "return":
      case "enter":
        consumeOnce(event, () => activateSwitcherRow(selectedRow()))
        return
      case "escape":
        consumeOnce(event, () => {
          closeDialog()
        })
        return
    }
  }

  const dialogStatusColor = (status: AgentStatus, isCurrent: boolean) => {
    if (status === "blocked") return dialogTheme.text.feedback.warning.base
    if (status === "working") return dialogTheme.text.feedback.info.base
    if (isCurrent) return dialogTheme.text.action.primary.selected
    return dialogTheme.text.faint
  }

  const focusedRowText = dialogTheme.text.action.primary.focused

  const rowBg = (key: string) => {
    if (selectedRow()?.key === key) {
      return dialogTheme.background.action.primary.focused
    }
    if (hoveredKey() === key) {
      return resolveDialogHoverBg(context.theme, dialogTheme)
    }
    return undefined
  }

  return (
    <box
      flexDirection="column"
      width="100%"
      paddingBottom={1}
      onMouseDown={() => {
        inputRef?.focus()
      }}
    >
      {/* Header */}
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        paddingX={4}
        paddingBottom={1}
      >
        <text
          fg={dialogTheme.text.base}
          attributes={TextAttributes.BOLD}
          selectable={false}
          wrapMode="none"
        >
          {showAll() ? "All Git Repositories" : "Repository Worktrees"}
        </text>
        <text fg={dialogTheme.text.muted} selectable={false} wrapMode="none">
          esc
        </text>
      </box>

      {/* Search Filter */}
      <box paddingX={4} paddingBottom={1}>
        <input
          ref={(el) => {
            inputRef = el
          }}
          focused
          width="100%"
          placeholder="Filter branches, worktrees, or sessions..."
          value={query()}
          textColor={dialogTheme.text.base}
          focusedTextColor={dialogTheme.text.base}
          placeholderColor={dialogTheme.text.faint}
          backgroundColor="transparent"
          focusedBackgroundColor="transparent"
          cursorColor={dialogTheme.text.formfield.focused}
          onInput={(val) => {
            if (val.trim().length > 0) userMovedSelection = true
            setQuery(val)
          }}
          onKeyDown={handleInputKeyDown}
        />
      </box>

      {/* Spaced Project -> Worktree -> Session Tree (keyed by stable IDs so syncs never reset marquees) */}
      <scrollbox
        ref={(el) => {
          scrollRef = el
        }}
        maxHeight={18}
        width="100%"
      >
        <box flexDirection="column" width="100%" paddingX={1}>
          <Show
            when={projectIDs().length > 0}
            fallback={
              <box paddingX={3} paddingY={1}>
                <text fg={dialogTheme.text.muted} selectable={false} wrapMode="word">
                  {query().trim()
                    ? "No matching branches, worktrees, or sessions."
                    : "No Git worktrees found. Press ctrl+a to browse all repositories or ctrl+n to create a worktree."}
                </text>
              </box>
            }
          >
            <For each={projectIDs()}>
              {(projID, projIdx) => {
                const projGroupAccessor = createMemo(() =>
                  filtered().projects.find((p) => p.project.id === projID),
                )
                return (
                  <Show when={projGroupAccessor()}>
                    {(projGroup) => {
                      const wtKeys = createMemo(
                        () => projGroup().worktrees.map((w) => w.key),
                        [],
                        { equals: sameStringArray },
                      )
                      return (
                        <box
                          flexDirection="column"
                          width="100%"
                          marginTop={projIdx() > 0 ? 1 : 0}
                        >
                          {/* Repository Header */}
                          <box
                            flexDirection="row"
                            justifyContent="space-between"
                            alignItems="center"
                            paddingX={3}
                            width="100%"
                          >
                            <text
                              fg={dialogTheme.hue.accent[400]}
                              attributes={TextAttributes.BOLD}
                              selectable={false}
                              wrapMode="none"
                              truncate
                              flexShrink={1}
                            >
                              {projGroup().project.pinned ? "★ " : ""}
                              {projGroup().project.name}
                            </text>
                            <text
                              fg={dialogTheme.text.faint}
                              selectable={false}
                              wrapMode="none"
                            >
                              {projGroup().worktrees.length}{" "}
                              {projGroup().worktrees.length === 1
                                ? "worktree"
                                : "worktrees"}
                            </text>
                          </box>

                          {/* Worktree Subtrees — 1-line breathing gap between each worktree block */}
                          <For each={wtKeys()}>
                            {(wtKey, wtIdx) => {
                              const wtGroupAccessor = createMemo(() =>
                                projGroup().worktrees.find((w) => w.key === wtKey),
                              )
                              return (
                                <Show when={wtGroupAccessor()}>
                                  {(wtGroup) => {
                                    const wt = () => wtGroup().worktree
                                    const hiddenRollup = createMemo(() =>
                                      rollupHiddenWorktreeStatus(
                                        wt(),
                                        wtGroup().sessions,
                                      ),
                                    )
                                    const rowStatus = () => hiddenRollup().status
                                    const rowStatusDetail = () =>
                                      hiddenRollup().detail
                                    const isWtSelected = () =>
                                      selectedRow()?.key === wtKey
                                    const sessionIDs = createMemo(
                                      () => wtGroup().sessions.map((s) => s.id),
                                      [],
                                      { equals: sameStringArray },
                                    )

                                    return (
                                      <box
                                        flexDirection="column"
                                        width="100%"
                                        marginTop={wtIdx() > 0 ? 1 : 0}
                                      >
                                        {/* Worktree Parent Row */}
                                        <box
                                          ref={(el) => {
                                            if (el) rowRefs.set(wtKey, el)
                                            else rowRefs.delete(wtKey)
                                          }}
                                          flexDirection="row"
                                          justifyContent="space-between"
                                          alignItems="center"
                                          width="100%"
                                          paddingX={3}
                                          backgroundColor={rowBg(wtKey)}
                                          onMouseOver={() =>
                                            rowHover.onEnter(wtKey)
                                          }
                                          onMouseOut={() =>
                                            rowHover.onLeave(wtKey)
                                          }
                                          onMouseUp={() => {
                                            setSelectedKey(wtKey)
                                            activateSwitcherRow({
                                              kind: "worktree",
                                              key: wtKey,
                                              project: projGroup().project,
                                              worktree: wt(),
                                              directlyMatched:
                                                wtGroup().directlyMatched,
                                            })
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
                                                isWtSelected()
                                                  ? focusedRowText
                                                  : dialogStatusColor(
                                                      rowStatus(),
                                                      wt().isCurrent,
                                                    )
                                              }
                                              attributes={TextAttributes.BOLD}
                                              selectable={false}
                                              wrapMode="none"
                                            >
                                              {worktreeGlyph(
                                                rowStatus(),
                                                wt().isCurrent,
                                              )}
                                            </text>
                                            <HoverMarqueeText
                                              renderer={getRenderer}
                                              text={wt().label}
                                              active={
                                                isWtSelected() ||
                                                hoveredKey() === wtKey
                                              }
                                              fg={
                                                isWtSelected()
                                                  ? focusedRowText
                                                  : dialogTheme.text.base
                                              }
                                              attributes={TextAttributes.BOLD}
                                              flexShrink={1}
                                            />
                                            <Show when={wt().sublabel}>
                                              {(sub) => (
                                                <HoverMarqueeText
                                                  renderer={getRenderer}
                                                  text={sub()}
                                                  active={
                                                    isWtSelected() ||
                                                    hoveredKey() === wtKey
                                                  }
                                                  fg={
                                                    isWtSelected()
                                                      ? focusedRowText
                                                      : dialogTheme.text.faint
                                                  }
                                                  flexShrink={2}
                                                />
                                              )}
                                            </Show>
                                          </box>

                                          <box
                                            flexDirection="row"
                                            columnGap={1}
                                            flexShrink={0}
                                          >
                                            <box
                                              onMouseUp={(event) => {
                                                if (
                                                  !(
                                                    isWtSelected() ||
                                                    hoveredKey() === wtKey
                                                  )
                                                ) {
                                                  return
                                                }
                                                event.stopPropagation()
                                                userMovedSelection = true
                                                setSelectedKey(wtKey)
                                                if (!closeDialog()) return
                                                const curWt = wt()
                                                void ctrl.createSessionInDirectory(
                                                  curWt.directory,
                                                  `Started session in ${dirBasename(curWt.directory)}`,
                                                  projGroup().project.id,
                                                )
                                              }}
                                            >
                                              <text
                                                fg={
                                                  isWtSelected()
                                                    ? focusedRowText
                                                    : dialogTheme.text.action
                                                        .primary.selected
                                                }
                                                selectable={false}
                                                wrapMode="none"
                                              >
                                                {isWtSelected() ||
                                                hoveredKey() === wtKey
                                                  ? "+ new"
                                                  : "     "}
                                              </text>
                                            </box>
                                            <Show
                                              when={statusLabel(
                                                rowStatus(),
                                                rowStatusDetail(),
                                              )}
                                            >
                                              {(badge) => (
                                                <text
                                                  fg={
                                                    isWtSelected()
                                                      ? focusedRowText
                                                      : dialogStatusColor(
                                                          rowStatus(),
                                                          wt().isCurrent,
                                                        )
                                                  }
                                                  selectable={false}
                                                  wrapMode="none"
                                                >
                                                  {badge()}
                                                </text>
                                              )}
                                            </Show>
                                            <Show when={wt().dirtyCount > 0}>
                                              <text
                                                fg={
                                                  isWtSelected()
                                                    ? focusedRowText
                                                    : dialogTheme.text.muted
                                                }
                                                selectable={false}
                                                wrapMode="none"
                                              >
                                                ~{wt().dirtyCount}
                                              </text>
                                            </Show>
                                            <Show when={wt().ahead > 0}>
                                              <text
                                                fg={
                                                  isWtSelected()
                                                    ? focusedRowText
                                                    : dialogTheme.text.faint
                                                }
                                                selectable={false}
                                                wrapMode="none"
                                              >
                                                ↑{wt().ahead}
                                              </text>
                                            </Show>
                                            <Show when={wt().behind > 0}>
                                              <text
                                                fg={
                                                  isWtSelected()
                                                    ? focusedRowText
                                                    : dialogTheme.text.faint
                                                }
                                                selectable={false}
                                                wrapMode="none"
                                              >
                                                ↓{wt().behind}
                                              </text>
                                            </Show>
                                          </box>
                                        </box>

                                        {/* Nested Session Rows */}
                                        <For each={sessionIDs()}>
                                          {(sessID, sessIdx) => {
                                            const sessKey = `session:${sessID}`
                                            const sessionAccessor = createMemo(
                                              () =>
                                                wtGroup().sessions.find(
                                                  (s) => s.id === sessID,
                                                ),
                                            )
                                            const isSessSelected = () =>
                                              selectedRow()?.key === sessKey
                                            const isLast = () =>
                                              sessIdx() ===
                                              sessionIDs().length - 1

                                            return (
                                              <Show when={sessionAccessor()}>
                                                {(session) => (
                                                  <box
                                                    ref={(el) => {
                                                      if (el)
                                                        rowRefs.set(sessKey, el)
                                                      else
                                                        rowRefs.delete(sessKey)
                                                    }}
                                                    flexDirection="row"
                                                    justifyContent="space-between"
                                                    alignItems="center"
                                                    width="100%"
                                                    paddingLeft={5}
                                                    paddingRight={3}
                                                    backgroundColor={rowBg(
                                                      sessKey,
                                                    )}
                                                    onMouseOver={() =>
                                                      rowHover.onEnter(sessKey)
                                                    }
                                                    onMouseOut={() =>
                                                      rowHover.onLeave(sessKey)
                                                    }
                                                    onMouseUp={() => {
                                                      setSelectedKey(sessKey)
                                                      const matchedRow =
                                                        filtered().selectableRows.find(
                                                          (r) =>
                                                            r.key === sessKey,
                                                        )
                                                      activateSwitcherRow(
                                                        matchedRow ?? {
                                                          kind: "session",
                                                          key: sessKey,
                                                          project:
                                                            projGroup().project,
                                                          worktree: wt(),
                                                          session: session(),
                                                          isLastSession:
                                                            isLast(),
                                                          directlyMatched: false,
                                                        },
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
                                                          isSessSelected()
                                                            ? focusedRowText
                                                            : dialogTheme.text
                                                                .faint
                                                        }
                                                        selectable={false}
                                                        wrapMode="none"
                                                      >
                                                        {isLast() ? "└─" : "├─"}
                                                      </text>
                                                      <text
                                                        fg={
                                                          isSessSelected()
                                                            ? focusedRowText
                                                            : dialogStatusColor(
                                                                session()
                                                                  .status,
                                                                session()
                                                                  .isCurrent,
                                                              )
                                                        }
                                                        selectable={false}
                                                        wrapMode="none"
                                                      >
                                                        {statusGlyph(
                                                          session().status,
                                                          session().isCurrent,
                                                        )}
                                                      </text>
                                                      <HoverMarqueeText
                                                        renderer={getRenderer}
                                                        text={session().title}
                                                        active={
                                                          isSessSelected() ||
                                                          hoveredKey() ===
                                                            sessKey
                                                        }
                                                        fg={
                                                          isSessSelected()
                                                            ? focusedRowText
                                                            : session()
                                                                  .isCurrent ||
                                                                hoveredKey() ===
                                                                  sessKey
                                                              ? dialogTheme.text
                                                                  .base
                                                              : dialogTheme.text
                                                                  .muted
                                                        }
                                                        attributes={
                                                          session().isCurrent
                                                            ? TextAttributes.BOLD
                                                            : TextAttributes.NONE
                                                        }
                                                        flexShrink={1}
                                                      />
                                                    </box>

                                                    <box
                                                      flexDirection="row"
                                                      columnGap={1}
                                                      flexShrink={0}
                                                    >
                                                      <Show
                                                        when={
                                                          statusLabel(
                                                            session().status,
                                                            session()
                                                              .statusDetail,
                                                          ) ??
                                                          (session().isCurrent
                                                            ? "active"
                                                            : undefined)
                                                        }
                                                      >
                                                        {(badge) => (
                                                          <text
                                                            fg={
                                                              isSessSelected()
                                                                ? focusedRowText
                                                                : session()
                                                                      .status !==
                                                                    "idle"
                                                                  ? dialogStatusColor(
                                                                      session()
                                                                        .status,
                                                                      session()
                                                                        .isCurrent,
                                                                    )
                                                                  : dialogTheme
                                                                      .text
                                                                      .faint
                                                            }
                                                            selectable={false}
                                                            wrapMode="none"
                                                          >
                                                            {badge()}
                                                          </text>
                                                        )}
                                                      </Show>
                                                    </box>
                                                  </box>
                                                )}
                                              </Show>
                                            )
                                          }}
                                        </For>
                                      </box>
                                    )
                                  }}
                                </Show>
                              )
                            }}
                          </For>
                        </box>
                      )
                    }}
                  </Show>
                )
              }}
            </For>
          </Show>
        </box>
      </scrollbox>

      {/* Footer Shortcuts */}
      <box
        flexDirection="row"
        columnGap={3}
        paddingX={4}
        paddingTop={1}
        flexWrap="wrap"
      >
        <box
          flexDirection="column"
          onMouseOver={() => footerHover.onEnter("worktree")}
          onMouseOut={() => footerHover.onLeave("worktree")}
          onMouseUp={() => triggerNewWorktree()}
        >
          <text
            fg={
              hoveredFooterAction() === "worktree"
                ? dialogTheme.text.action.primary.selected
                : footerTheme.text.base
            }
            selectable={false}
            wrapMode="none"
          >
            new worktree
          </text>
          <text fg={footerTheme.text.muted} selectable={false} wrapMode="none">
            ctrl+n
          </text>
        </box>
        <box
          flexDirection="column"
          onMouseOver={() => footerHover.onEnter("session")}
          onMouseOut={() => footerHover.onLeave("session")}
          onMouseUp={() => triggerNewSession()}
        >
          <text
            fg={
              hoveredFooterAction() === "session"
                ? dialogTheme.text.action.primary.selected
                : footerTheme.text.base
            }
            selectable={false}
            wrapMode="none"
          >
            new session
          </text>
          <text fg={footerTheme.text.muted} selectable={false} wrapMode="none">
            ctrl+s
          </text>
        </box>
        <box
          flexDirection="column"
          onMouseOver={() => footerHover.onEnter("editor")}
          onMouseOut={() => footerHover.onLeave("editor")}
          onMouseUp={() => triggerOpenEditor()}
        >
          <text
            fg={
              hoveredFooterAction() === "editor"
                ? dialogTheme.text.action.primary.selected
                : footerTheme.text.base
            }
            selectable={false}
            wrapMode="none"
          >
            open editor
          </text>
          <text fg={footerTheme.text.muted} selectable={false} wrapMode="none">
            ctrl+o
          </text>
        </box>
        <Show when={canRemoveSelected()}>
          <box
            flexDirection="column"
            onMouseOver={() => footerHover.onEnter("remove")}
            onMouseOut={() => footerHover.onLeave("remove")}
            onMouseUp={() => triggerRemoveWorktree()}
          >
            <text
              fg={
                hoveredFooterAction() === "remove"
                  ? dialogTheme.text.feedback.warning.base
                  : footerTheme.text.base
              }
              selectable={false}
              wrapMode="none"
            >
              remove
            </text>
            <text
              fg={footerTheme.text.muted}
              selectable={false}
              wrapMode="none"
            >
              ctrl+x
            </text>
          </box>
        </Show>
        <box
          flexDirection="column"
          onMouseOver={() => footerHover.onEnter("all")}
          onMouseOut={() => footerHover.onLeave("all")}
          onMouseUp={() => triggerToggleAll()}
        >
          <text
            fg={
              hoveredFooterAction() === "all"
                ? dialogTheme.text.action.primary.selected
                : footerTheme.text.base
            }
            selectable={false}
            wrapMode="none"
          >
            {showAll() ? "current repo" : "all repos"}
          </text>
          <text fg={footerTheme.text.muted} selectable={false} wrapMode="none">
            ctrl+a
          </text>
        </box>
      </box>
    </box>
  )
}

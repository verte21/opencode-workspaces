/** @jsxImportSource @opentui/solid */
import {
  MouseButton,
  TextAttributes,
  type BoxRenderable,
  type KeyEvent,
  type ScrollBoxRenderable,
} from "@opentui/core"
import { For, Show, createEffect, createMemo, createSignal } from "solid-js"
import {
  dirBasename,
  rollupHiddenWorktreeStatus,
  type FlatTreeRow,
} from "../model.js"
import { createHoverFlagSignal, createHoverKeySignal } from "./hover.js"
import { HoverMarqueeText } from "./marquee.js"
import type { WorkspacesController } from "./state.js"
import {
  resolvePanelRowBg,
  resolveSidebarAccentHoverBg,
  resolveSidebarHoverBg,
  resolveStatusColor,
  sameStringArray,
  statusGlyph,
  statusLabel,
  worktreeGlyph,
  type SessionPanelSlotInput,
} from "./types.js"

function isLeftClick(event: { readonly button?: number }): boolean {
  return event.button === undefined || event.button === MouseButton.LEFT
}

function isRightClick(event: { readonly button?: number }): boolean {
  return event.button === MouseButton.RIGHT
}

export const WorkspacesPanel = (props: {
  readonly ctrl: WorkspacesController
  readonly panel: SessionPanelSlotInput
}) => {
  const { ctrl } = props
  const { context } = ctrl
  const getRenderer = () => context.renderer

  let containerRef: BoxRenderable | undefined
  let panelScrollRef: ScrollBoxRenderable | undefined
  const panelRowRefs = new Map<string, BoxRenderable>()

  const tree = createMemo(() =>
    ctrl.buildSnapshot({
      explicitSessionID: props.panel.sessionID,
      includeSessionRows: true,
      currentProjectOnly: !ctrl.prefs.showAllGitProjects,
      onlyRelevantProjects: false,
    }),
  )

  const rowKeys = createMemo(
    () => tree().rows.map((r) => r.key),
    [],
    { equals: sameStringArray },
  )

  const [selectedKey, setSelectedKey] = createSignal<string>("")
  const panelRowHover = createHoverKeySignal()
  const hoveredPanelKey = panelRowHover.hoveredKey
  const panelSessionDeleteHover = createHoverKeySignal()
  const footerPathHover = createHoverFlagSignal()
  const hoveredFooterPath = footerPathHover.hovered
  const panelNewSessionHover = createHoverFlagSignal()
  const panelNewSessionHovered = panelNewSessionHover.hovered
  let panelUserMoved = false

  createEffect(() => {
    ctrl.syncSessionWorkspace(props.panel.sessionID)
  })

  const scrollPanelRowIntoView = (key: string) => {
    const el = panelRowRefs.get(key)
    if (
      el &&
      !el.isDestroyed &&
      panelScrollRef &&
      !panelScrollRef.isDestroyed
    ) {
      panelScrollRef.scrollChildIntoView(el, { align: "nearest", inset: 1 })
    }
  }

  createEffect(() => {
    const rows = tree().rows
    if (rows.length === 0) return

    const activeRow =
      rows.find((r) => r.kind === "session" && r.session.isCurrent) ??
      rows.find((r) => r.kind === "worktree" && r.worktree.isCurrent) ??
      rows.find((r) => r.kind === "project" && r.project.isCurrent)

    if (!panelUserMoved && activeRow) {
      if (selectedKey() !== activeRow.key) {
        setSelectedKey(activeRow.key)
        queueMicrotask(() => scrollPanelRowIntoView(activeRow.key))
      }
      return
    }

    const currentKey = selectedKey()
    if (currentKey && rows.some((r) => r.key === currentKey)) return

    const fallbackRow = activeRow ?? rows[0]
    if (fallbackRow) {
      setSelectedKey(fallbackRow.key)
      queueMicrotask(() => scrollPanelRowIntoView(fallbackRow.key))
    }
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

  const resolveRowDirectory = (row: FlatTreeRow | undefined) => {
    if (!row) return ctrl.resolveActiveDirectory(props.panel.sessionID)
    return row.kind === "project" ? row.project.canonical : row.worktree.directory
  }

  const selectedPath = createMemo<string | undefined>(() => {
    const row = selectedRow()
    if (!row) return undefined
    const dir =
      row.kind === "project" ? row.project.canonical : row.worktree.directory
    return context.ui.format.path(dir)
  })

  const moveCursor = (delta: number) => {
    const rows = tree().rows
    if (rows.length === 0) return
    panelUserMoved = true
    const key = selectedKey()
    const idx = rows.findIndex((r) => r.key === key)
    const start = idx === -1 ? 0 : idx
    const nextIdx = Math.max(0, Math.min(rows.length - 1, start + delta))
    const target = rows[nextIdx]
    if (target) {
      setSelectedKey(target.key)
      scrollPanelRowIntoView(target.key)
    }
  }

  const activateRow = (row: FlatTreeRow | undefined) => {
    if (!row) return
    if (row.kind === "project") {
      ctrl.toggleCollapseProject(row.project.id)
      return
    }
    if (row.kind === "worktree") {
      void ctrl.openWorktree(
        row.worktree.directory,
        row.worktree.primarySessionID,
        row.project.id,
      )
      return
    }
    ctrl.activateSession(row.session.id, row.worktree.directory, row.project.id)
  }

  const handleKeyDown = (event: KeyEvent) => {
    if (!props.panel.focused) return
    const rows = tree().rows
    const row = selectedRow()

    if (!event.ctrl && !event.meta && /^[1-9]$/.test(event.name)) {
      event.preventDefault()
      event.stopPropagation()
      void ctrl.jumpToQuickSlot(Number.parseInt(event.name, 10))
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
          const target = event.shift ? rows[rows.length - 1] : rows[0]
          if (target) {
            setSelectedKey(target.key)
            scrollPanelRowIntoView(target.key)
          }
        }
        return
      case "home": {
        event.preventDefault()
        event.stopPropagation()
        const first = rows[0]
        if (first) {
          setSelectedKey(first.key)
          scrollPanelRowIntoView(first.key)
        }
        return
      }
      case "end": {
        event.preventDefault()
        event.stopPropagation()
        const last = rows[rows.length - 1]
        if (last) {
          setSelectedKey(last.key)
          scrollPanelRowIntoView(last.key)
        }
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
        if (row) ctrl.toggleCollapseProject(row.project.id)
        return
      case "h":
      case "left":
        event.preventDefault()
        event.stopPropagation()
        if (row && !row.project.collapsed) {
          ctrl.toggleCollapseProject(row.project.id)
          setSelectedKey(`project:${row.project.id}`)
        }
        return
      case "l":
      case "right":
        event.preventDefault()
        event.stopPropagation()
        if (row?.kind === "project" && row.project.collapsed) {
          ctrl.toggleCollapseProject(row.project.id)
        } else {
          activateRow(row)
        }
        return
      case "o":
        event.preventDefault()
        event.stopPropagation()
        void ctrl.openWorktreeInEditor(resolveRowDirectory(row))
        return
      case "n":
        event.preventDefault()
        event.stopPropagation()
        if (row) {
          void ctrl.createWorktreeFlow({
            id: row.project.id,
            name: row.project.name,
            canonical: row.project.canonical,
          })
        } else {
          const proj = ctrl.findCurrentProject()
          if (proj) void ctrl.createWorktreeFlow(proj)
        }
        return
      case "s":
        event.preventDefault()
        event.stopPropagation()
        if (row) {
          const dir = resolveRowDirectory(row)
          if (dir) {
            void ctrl.createSessionInDirectory(
              dir,
              `Started session in ${dirBasename(dir)}`,
              row.project.id,
            )
          }
        }
        return
      case "m":
        event.preventDefault()
        event.stopPropagation()
        if (row) {
          const dir = resolveRowDirectory(row)
          if (dir) {
            void ctrl.moveCurrentSessionToDirectory(
              dir,
              props.panel.sessionID,
              row.project.id,
            )
          }
        }
        return
      case "p":
        event.preventDefault()
        event.stopPropagation()
        if (row) {
          void ctrl.togglePinProject({
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
        if (row?.kind === "session") {
          void ctrl.removeSessionFlow(row.session)
        } else if (row?.kind === "worktree") {
          void ctrl.removeWorktreeFlow(row.project, row.worktree)
        }
        return
      case "a":
      case "i":
        event.preventDefault()
        event.stopPropagation()
        void ctrl.toggleShowAllGitProjects()
        return
      case "r":
        event.preventDefault()
        event.stopPropagation()
        void ctrl.refreshWorkspacesData({ forceWorktreeRefresh: true })
        context.ui.toast.show({
          message: "Refreshed Git worktrees",
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

  const renderPanelRowByKey = (rowKey: string, rowIndex: () => number) => {
    const rowAccessor = createMemo(() =>
      tree().rows.find((r) => r.key === rowKey),
    )
    const isSelected = () => selectedRow()?.key === rowKey
    const isRowHovered = () => hoveredPanelKey() === rowKey
    const isRowActive = () => isSelected() || isRowHovered()
    const rowBg = () =>
      resolvePanelRowBg(context.theme, {
        selected: isSelected(),
        hovered: isRowHovered(),
      })

    if (rowKey.startsWith("project:")) {
      const projRow = createMemo(() => {
        const cur = rowAccessor()
        return cur?.kind === "project" ? cur : undefined
      })
      return (
        <Show when={projRow()}>
          {(row) => {
            const p = () => row().project
            return (
              <box
                ref={(el) => {
                  if (el) panelRowRefs.set(rowKey, el)
                  else panelRowRefs.delete(rowKey)
                }}
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
                width="100%"
                paddingX={1}
                marginTop={rowIndex() > 0 ? 1 : 0}
                backgroundColor={rowBg()}
                onMouseOver={() => panelRowHover.onEnter(rowKey)}
                onMouseOut={() => panelRowHover.onLeave(rowKey)}
                onMouseUp={() => {
                  panelUserMoved = true
                  setSelectedKey(rowKey)
                  ctrl.toggleCollapseProject(p().id)
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
                      isRowActive()
                        ? context.theme.text.action.primary.selected
                        : context.theme.text.muted
                    }
                    selectable={false}
                    wrapMode="none"
                  >
                    {p().collapsed ? "▸" : "▾"}
                  </text>
                  <Show when={p().pinned}>
                    <text
                      fg={context.theme.text.feedback.warning.base}
                      selectable={false}
                      wrapMode="none"
                    >
                      ★
                    </text>
                  </Show>
                  <HoverMarqueeText
                    renderer={getRenderer}
                    text={p().name}
                    active={isRowActive()}
                    fg={context.theme.hue.accent[400]}
                    attributes={TextAttributes.BOLD}
                    flexShrink={1}
                  />
                </box>
                <text
                  fg={
                    isRowActive()
                      ? context.theme.text.muted
                      : context.theme.text.faint
                  }
                  selectable={false}
                  wrapMode="none"
                >
                  {p().worktrees.length} wt
                </text>
              </box>
            )
          }}
        </Show>
      )
    }

    if (rowKey.startsWith("worktree:")) {
      const wtRow = createMemo(() => {
        const cur = rowAccessor()
        return cur?.kind === "worktree" ? cur : undefined
      })
      const needsWorktreeGap = () => {
        const prev = tree().rows[rowIndex() - 1]
        return Boolean(prev && prev.kind !== "project")
      }
      return (
        <Show when={wtRow()}>
          {(row) => {
            const wt = () => row().worktree
            const hiddenRollup = createMemo(() =>
              rollupHiddenWorktreeStatus(wt(), wt().sessions),
            )
            const rowStatus = () => hiddenRollup().status
            const rowStatusDetail = () => hiddenRollup().detail
            return (
              <box
                ref={(el) => {
                  if (el) panelRowRefs.set(rowKey, el)
                  else panelRowRefs.delete(rowKey)
                }}
                flexDirection="row"
                justifyContent="space-between"
                alignItems="center"
                width="100%"
                paddingLeft={2}
                paddingRight={1}
                marginTop={needsWorktreeGap() ? 1 : 0}
                backgroundColor={rowBg()}
                onMouseOver={() => panelRowHover.onEnter(rowKey)}
                onMouseOut={() => panelRowHover.onLeave(rowKey)}
                onMouseUp={(event) => {
                  if (!isLeftClick(event)) return
                  panelUserMoved = true
                  setSelectedKey(rowKey)
                  const curWt = wt()
                  void ctrl.openWorktree(
                    curWt.directory,
                    curWt.primarySessionID,
                    row().project.id,
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
                      isRowActive()
                        ? context.theme.text.muted
                        : context.theme.text.faint
                    }
                    selectable={false}
                    wrapMode="none"
                  >
                    {wt().quickSlot ? `${wt().quickSlot}` : " "}
                  </text>
                  <text
                    fg={
                      isRowActive() && !wt().isCurrent && rowStatus() === "idle"
                        ? context.theme.text.muted
                        : resolveStatusColor(
                            context.theme,
                            rowStatus(),
                            wt().isCurrent,
                          )
                    }
                    attributes={TextAttributes.BOLD}
                    selectable={false}
                    wrapMode="none"
                  >
                    {worktreeGlyph(rowStatus(), wt().isCurrent)}
                  </text>
                  <HoverMarqueeText
                    renderer={getRenderer}
                    text={wt().label}
                    active={isRowActive()}
                    fg={
                      wt().isCurrent || rowStatus() !== "idle" || isRowActive()
                        ? context.theme.text.base
                        : context.theme.text.muted
                    }
                    attributes={
                      wt().isCurrent || isSelected()
                        ? TextAttributes.BOLD
                        : TextAttributes.NONE
                    }
                    flexShrink={1}
                  />
                </box>

                <box flexDirection="row" columnGap={1} flexShrink={0}>
                  <Show when={statusLabel(rowStatus(), rowStatusDetail())}>
                    {(badge) => (
                      <text
                        fg={resolveStatusColor(
                          context.theme,
                          rowStatus(),
                          wt().isCurrent,
                        )}
                        selectable={false}
                        wrapMode="none"
                      >
                        {badge()}
                      </text>
                    )}
                  </Show>
                  <Show when={wt().dirtyCount > 0}>
                    <text
                      fg={context.theme.text.muted}
                      selectable={false}
                      wrapMode="none"
                    >
                      ~{wt().dirtyCount}
                    </text>
                  </Show>
                  <Show when={wt().ahead > 0}>
                    <text
                      fg={
                        isRowActive()
                          ? context.theme.text.muted
                          : context.theme.text.faint
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
                        isRowActive()
                          ? context.theme.text.muted
                          : context.theme.text.faint
                      }
                      selectable={false}
                      wrapMode="none"
                    >
                      ↓{wt().behind}
                    </text>
                  </Show>
                </box>
              </box>
            )
          }}
        </Show>
      )
    }

    const sessRow = createMemo(() => {
      const cur = rowAccessor()
      return cur?.kind === "session" ? cur : undefined
    })

    return (
      <Show when={sessRow()}>
        {(row) => {
          const s = () => row().session
          const isLastSession = () => {
            const sessions = row().worktree.sessions
            return sessions[sessions.length - 1]?.id === s().id
          }
          const isSessHovered = () => hoveredPanelKey() === rowKey
          const isDeleteHovered = () =>
            panelSessionDeleteHover.hoveredKey() === rowKey
          return (
            <box
              ref={(el) => {
                if (el) panelRowRefs.set(rowKey, el)
                else panelRowRefs.delete(rowKey)
              }}
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
              width="100%"
              paddingLeft={6}
              paddingRight={1}
              backgroundColor={rowBg()}
              onMouseOver={() => panelRowHover.onEnter(rowKey)}
              onMouseOut={() => panelRowHover.onLeave(rowKey)}
              onMouseUp={(event) => {
                panelUserMoved = true
                setSelectedKey(rowKey)
                if (isRightClick(event)) {
                  event.stopPropagation()
                  void ctrl.openSessionContextMenu(
                    s(),
                    row().worktree.directory,
                    row().project.id,
                  )
                  return
                }
                if (!isLeftClick(event)) return
                ctrl.activateSession(
                  s().id,
                  row().worktree.directory,
                  row().project.id,
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
                    isRowActive()
                      ? context.theme.text.muted
                      : context.theme.text.faint
                  }
                  selectable={false}
                  wrapMode="none"
                >
                  {isLastSession() ? "└─" : "├─"}
                </text>
                <text
                  fg={
                    isRowActive() && !s().isCurrent && s().status === "idle"
                      ? context.theme.text.muted
                      : resolveStatusColor(
                          context.theme,
                          s().status,
                          s().isCurrent,
                        )
                  }
                  selectable={false}
                  wrapMode="none"
                >
                  {statusGlyph(s().status, s().isCurrent)}
                </text>
                <HoverMarqueeText
                  renderer={getRenderer}
                  text={s().title}
                  active={isRowActive()}
                  fg={
                    s().isCurrent || s().status !== "idle" || isRowActive()
                      ? context.theme.text.base
                      : context.theme.text.muted
                  }
                  attributes={
                    s().isCurrent ? TextAttributes.BOLD : TextAttributes.NONE
                  }
                  flexShrink={1}
                />
              </box>
              <box flexDirection="row" columnGap={1} flexShrink={0}>
                <box
                  backgroundColor={
                    isSessHovered() && isDeleteHovered()
                      ? resolveSidebarAccentHoverBg(context.theme)
                      : undefined
                  }
                  onMouseOver={() => panelSessionDeleteHover.onEnter(rowKey)}
                  onMouseOut={() => panelSessionDeleteHover.onLeave(rowKey)}
                  onMouseUp={(event) => {
                    if (!isLeftClick(event) || !isRowActive()) return
                    event.stopPropagation()
                    void ctrl.removeSessionFlow(s())
                  }}
                >
                  <text
                    fg={
                      isDeleteHovered()
                        ? context.theme.text.feedback.error.base
                        : context.theme.text.muted
                    }
                    attributes={
                      isDeleteHovered()
                        ? TextAttributes.BOLD
                        : TextAttributes.NONE
                    }
                    selectable={false}
                    wrapMode="none"
                  >
                    {isRowActive() ? "×" : " "}
                  </text>
                </box>
                <Show
                  when={
                    statusLabel(s().status, s().statusDetail) ??
                    (s().isCurrent ? "active" : undefined)
                  }
                >
                  {(badge) => (
                    <text
                      fg={
                        s().status !== "idle"
                          ? resolveStatusColor(
                              context.theme,
                              s().status,
                              s().isCurrent,
                            )
                          : isRowActive()
                            ? context.theme.text.muted
                            : context.theme.text.faint
                      }
                      selectable={false}
                      wrapMode="none"
                      flexShrink={0}
                    >
                      {badge()}
                    </text>
                  )}
                </Show>
              </box>
            </box>
          )
        }}
      </Show>
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
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        paddingX={1}
        paddingBottom={1}
      >
        <text
          fg={context.theme.text.base}
          attributes={TextAttributes.BOLD}
          selectable={false}
          wrapMode="none"
        >
          Worktrees
        </text>
        <box flexDirection="row" columnGap={2} alignItems="center">
          <box
            backgroundColor={
              panelNewSessionHovered()
                ? resolveSidebarHoverBg(context.theme)
                : undefined
            }
            onMouseOver={() => panelNewSessionHover.onEnter()}
            onMouseOut={() => panelNewSessionHover.onLeave()}
            onMouseUp={(event) => {
              event.stopPropagation()
              const row = selectedRow()
              const dir = resolveRowDirectory(row)
              if (!dir) return
              void ctrl.createSessionInDirectory(
                dir,
                `Started session in ${dirBasename(dir)}`,
                row?.project.id,
              )
            }}
          >
            <text
              fg={
                panelNewSessionHovered()
                  ? context.theme.text.action.primary.selected
                  : context.theme.text.base
              }
              attributes={TextAttributes.BOLD}
              selectable={false}
              wrapMode="none"
            >
              + New session
            </text>
          </box>
          <text
            fg={context.theme.text.faint}
            selectable={false}
            wrapMode="none"
          >
            {ctrl.prefs.showAllGitProjects ? "all git repos" : "current repo"} · esc
          </text>
        </box>
      </box>

      <scrollbox
        ref={(el) => {
          panelScrollRef = el
        }}
        flexGrow={1}
      >
        <box flexDirection="column" width="100%">
          <Show
            when={rowKeys().length > 0}
            fallback={
              <box paddingX={1} paddingY={1}>
                <text
                  fg={context.theme.text.muted}
                  selectable={false}
                  wrapMode="word"
                >
                  No Git worktrees for this folder. Press "a" to browse all Git
                  repositories, or "n" inside a Git repo to create a worktree.
                </text>
              </box>
            }
          >
            <For each={rowKeys()}>
              {(rowKey, idx) => renderPanelRowByKey(rowKey, idx)}
            </For>
          </Show>
        </box>
      </scrollbox>

      <box flexDirection="column" paddingX={1} paddingTop={1}>
        <Show when={selectedPath()}>
          {(path) => (
            <box
              width="100%"
              overflow="hidden"
              onMouseOver={() => footerPathHover.onEnter()}
              onMouseOut={() => footerPathHover.onLeave()}
            >
              <HoverMarqueeText
                renderer={getRenderer}
                text={path()}
                active={hoveredFooterPath()}
                fg={
                  hoveredFooterPath()
                    ? context.theme.text.base
                    : context.theme.text.muted
                }
                flexShrink={1}
              />
            </box>
          )}
        </Show>
        <text fg={context.theme.text.faint} selectable={false} wrapMode="word">
          j/k move · ⏎ open · o editor · n worktree · s session · p pin · x remove · a repos
        </text>
      </box>
    </box>
  )
}

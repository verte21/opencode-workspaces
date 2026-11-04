/** @jsxImportSource @opentui/solid */
import { TextAttributes } from "@opentui/core"
import { For, Show, createEffect, createMemo } from "solid-js"
import {
  dirBasename,
  resolveWorkspaceNewSessionDirectory,
  rollupHiddenWorktreeStatus,
  type ProjectNode,
  type WorktreeNode,
} from "../model.js"
import {
  createHoverFlagSignal,
  createHoverKeySignal,
  type HoverKeyController,
} from "./hover.js"
import { HoverMarqueeText } from "./marquee.js"
import type { WorkspacesController } from "./state.js"
import {
  resolveSidebarAccentHoverBg,
  resolveSidebarHoverBg,
  resolveStatusColor,
  sameStringArray,
  statusGlyph,
  statusLabel,
} from "./types.js"

function renderSidebarWorktreeRow(
  ctrl: WorkspacesController,
  wtAccessor: () => WorktreeNode | undefined,
  indented: boolean,
  worktreeHover: HoverKeyController,
  chevronHover: HoverKeyController,
  plusHover: HoverKeyController,
  sessionHover: HoverKeyController,
) {
  const { context } = ctrl
  const getRenderer = () => context.renderer
  const hoverBg = () => resolveSidebarHoverBg(context.theme)
  const accentHoverBg = () => resolveSidebarAccentHoverBg(context.theme)

  return (
    <Show when={wtAccessor()}>
      {(wt) => {
        const hasSessions = () => wt().sessions.length > 0
        const isExpanded = createMemo(
          () => hasSessions() && ctrl.isSidebarWorktreeExpanded(wt().directory),
        )
        // When expanded, show all sessions in the worktree; when collapsed, still surface actively running/blocked background sessions
        const visibleSessions = createMemo(() => {
          const cur = wt()
          if (isExpanded()) return cur.sessions
          return cur.sessions
            .filter((s) => !s.isCurrent && s.status !== "idle")
            .slice(0, 3)
        })
        const visibleSessionIDs = createMemo(
          () => visibleSessions().map((s) => s.id),
          [],
          { equals: sameStringArray },
        )
        const hiddenRollup = createMemo(() =>
          rollupHiddenWorktreeStatus(wt(), visibleSessions()),
        )
        const rowStatus = () => hiddenRollup().status
        const rowStatusDetail = () => hiddenRollup().detail
        const isRowHovered = () => worktreeHover.hoveredKey() === wt().directory
        const isChevronHovered = () =>
          chevronHover.hoveredKey() === wt().directory
        const isPlusHovered = () => plusHover.hoveredKey() === wt().directory

        return (
          <box flexDirection="column" width="100%">
            <box
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
              width="100%"
              paddingLeft={indented ? 2 : 0}
              backgroundColor={isRowHovered() ? hoverBg() : undefined}
              onMouseOver={() => worktreeHover.onEnter(wt().directory)}
              onMouseOut={() => worktreeHover.onLeave(wt().directory)}
              onMouseUp={() => {
                const cur = wt()
                if (cur.isCurrent && hasSessions()) {
                  ctrl.toggleSidebarWorktree(cur.directory)
                  return
                }
                void ctrl.openWorktree(
                  cur.directory,
                  cur.primarySessionID,
                  cur.projectID,
                )
              }}
            >
              <box
                flexDirection="row"
                flexGrow={1}
                flexShrink={1}
                overflow="hidden"
              >
                <box
                  paddingRight={1}
                  flexShrink={0}
                  onMouseOver={() => chevronHover.onEnter(wt().directory)}
                  onMouseOut={() => chevronHover.onLeave(wt().directory)}
                  onMouseUp={(event) => {
                    if (hasSessions()) {
                      event.stopPropagation()
                      ctrl.toggleSidebarWorktree(wt().directory)
                    }
                  }}
                >
                  <text
                    fg={
                      hasSessions() &&
                      isChevronHovered() &&
                      !wt().isCurrent &&
                      rowStatus() === "idle"
                        ? context.theme.text.base
                        : isRowHovered() &&
                            !wt().isCurrent &&
                            rowStatus() === "idle"
                          ? context.theme.text.muted
                          : resolveStatusColor(
                              context.theme,
                              rowStatus(),
                              wt().isCurrent,
                            )
                    }
                    attributes={
                      rowStatus() !== "idle" ||
                      wt().isCurrent ||
                      (hasSessions() && isChevronHovered())
                        ? TextAttributes.BOLD
                        : TextAttributes.NONE
                    }
                    selectable={false}
                    wrapMode="none"
                  >
                    {hasSessions()
                      ? isExpanded()
                        ? "▾"
                        : "▸"
                      : statusGlyph(rowStatus(), false)}
                  </text>
                </box>
                <HoverMarqueeText
                  renderer={getRenderer}
                  text={wt().label}
                  active={isRowHovered()}
                  fg={
                    wt().isCurrent || rowStatus() !== "idle" || isRowHovered()
                      ? context.theme.text.base
                      : context.theme.text.muted
                  }
                  attributes={
                    wt().isCurrent ? TextAttributes.BOLD : TextAttributes.NONE
                  }
                  flexShrink={1}
                />
              </box>

              <box flexDirection="row" columnGap={1} flexShrink={0}>
                <box
                  backgroundColor={
                    isRowHovered() && isPlusHovered()
                      ? accentHoverBg()
                      : undefined
                  }
                  onMouseOver={() => plusHover.onEnter(wt().directory)}
                  onMouseOut={() => plusHover.onLeave(wt().directory)}
                  onMouseUp={(event) => {
                    if (!isRowHovered()) return
                    event.stopPropagation()
                    const cur = wt()
                    void ctrl.createSessionInDirectory(
                      cur.directory,
                      `Started session in ${cur.label}`,
                      cur.projectID,
                    )
                  }}
                >
                  <text
                    fg={context.theme.text.action.primary.selected}
                    attributes={
                      isPlusHovered()
                        ? TextAttributes.BOLD
                        : TextAttributes.NONE
                    }
                    selectable={false}
                    wrapMode="none"
                  >
                    {isRowHovered() ? "+" : " "}
                  </text>
                </box>
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
                    fg={
                      isRowHovered()
                        ? context.theme.text.muted
                        : context.theme.text.faint
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
                      isRowHovered()
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
                      isRowHovered()
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

            <For each={visibleSessionIDs()}>
              {(sessionID, sessIdx) => {
                const sessionAccessor = createMemo(() =>
                  visibleSessions().find((s) => s.id === sessionID),
                )
                const isLast = () =>
                  sessIdx() === visibleSessionIDs().length - 1
                const isSessHovered = () =>
                  sessionHover.hoveredKey() === sessionID
                return (
                  <Show when={sessionAccessor()}>
                    {(session) => (
                      <box
                        flexDirection="row"
                        justifyContent="space-between"
                        alignItems="center"
                        width="100%"
                        paddingLeft={indented ? 4 : 2}
                        backgroundColor={
                          isSessHovered() ? hoverBg() : undefined
                        }
                        onMouseOver={() => sessionHover.onEnter(session().id)}
                        onMouseOut={() => sessionHover.onLeave(session().id)}
                        onMouseUp={() =>
                          ctrl.activateSession(
                            session().id,
                            wt().directory,
                            wt().projectID,
                          )
                        }
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
                              isSessHovered()
                                ? context.theme.text.muted
                                : context.theme.text.faint
                            }
                            selectable={false}
                            wrapMode="none"
                          >
                            {isLast() ? "└─" : "├─"}
                          </text>
                          <text
                            fg={
                              isSessHovered() &&
                              !session().isCurrent &&
                              session().status === "idle"
                                ? context.theme.text.muted
                                : resolveStatusColor(
                                    context.theme,
                                    session().status,
                                    session().isCurrent,
                                  )
                            }
                            attributes={
                              session().status !== "idle" || session().isCurrent
                                ? TextAttributes.BOLD
                                : TextAttributes.NONE
                            }
                            selectable={false}
                            wrapMode="none"
                          >
                            {statusGlyph(session().status, session().isCurrent)}
                          </text>
                          <HoverMarqueeText
                            renderer={getRenderer}
                            text={session().title}
                            active={isSessHovered()}
                            fg={
                              session().isCurrent ||
                              session().status !== "idle" ||
                              isSessHovered()
                                ? context.theme.text.base
                                : context.theme.text.muted
                            }
                            attributes={
                              session().isCurrent
                                ? TextAttributes.BOLD
                                : TextAttributes.NONE
                            }
                            flexShrink={1}
                          />
                        </box>
                        <Show
                          when={statusLabel(
                            session().status,
                            session().statusDetail,
                          )}
                        >
                          {(badge) => (
                            <text
                              fg={resolveStatusColor(
                                context.theme,
                                session().status,
                                session().isCurrent,
                              )}
                              selectable={false}
                              wrapMode="none"
                              flexShrink={0}
                            >
                              {badge()}
                            </text>
                          )}
                        </Show>
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
}

/**
 * Native-styled right sidebar section anchored in the LOWER HALF of the right sidebar
 * (above `sidebar.footer`), separated from OpenCode's upper session info by a top divider.
 * Strictly scoped to the current session's Git repository so unrelated repos never clutter the sidebar.
 */
export const WorkspacesSidebar = (props: {
  readonly ctrl: WorkspacesController
  readonly sessionID: string
  readonly onTogglePanel: () => void
}) => {
  const { ctrl } = props
  const { context } = ctrl
  const getRenderer = () => context.renderer

  const headerHover = createHoverFlagSignal()
  const headerHovered = headerHover.hovered
  const worktreeHover = createHoverKeySignal()
  const chevronHover = createHoverKeySignal()
  const plusHover = createHoverKeySignal()
  const subSessionHover = createHoverKeySignal()
  const newSessionHover = createHoverFlagSignal()
  const newSessionHovered = newSessionHover.hovered
  const hoverBg = () => resolveSidebarHoverBg(context.theme)

  createEffect(() => {
    ctrl.syncSessionWorkspace(props.sessionID)
  })

  const tree = createMemo(() =>
    ctrl.buildSnapshot({
      explicitSessionID: props.sessionID,
      includeSessionRows: false,
      currentProjectOnly: true,
    }),
  )

  const currentProject = createMemo(() => tree().projects[0])
  const resolveTargetWorktree = (proj: ProjectNode) =>
    proj.worktrees.find((wt) => wt.isCurrent) ?? proj.worktrees[0]

  const lowerHalfHeight = createMemo(() =>
    Math.max(10, Math.ceil((ctrl.terminalHeight() - 3) / 2)),
  )

  const sidebarTreeHeight = createMemo(() => {
    const proj = currentProject()
    if (!proj) return 1
    const contentRows = proj.worktrees.reduce((sum, wt) => {
      if (wt.sessions.length > 0 && ctrl.isSidebarWorktreeExpanded(wt.directory)) {
        return sum + 1 + wt.sessions.length
      }
      const activeBg = wt.sessions.filter(
        (s) => !s.isCurrent && s.status !== "idle",
      ).length
      return sum + 1 + Math.min(3, activeBg)
    }, 0)
    const newSessionRows = resolveTargetWorktree(proj)?.label ? 2 : 1
    // Top border (1) + paddingTop (1) + header (1) + marginTop (1) + newSessionRows (1..2) + paddingBottom (1)
    const chromeRows = 5 + newSessionRows
    const maxRows = Math.max(2, lowerHalfHeight() - chromeRows)
    return Math.max(1, Math.min(contentRows, maxRows))
  })

  const spawnSessionInCurrentWorktree = (proj: ProjectNode) => {
    const currentWt = resolveTargetWorktree(proj)
    const dir = resolveWorkspaceNewSessionDirectory({
      currentWorktreeDirectory: currentWt?.directory,
      activeSessionDirectory: ctrl.resolveActiveDirectory(props.sessionID),
    })
    if (!dir) return
    void ctrl.createSessionInDirectory(
      dir,
      `Started session in ${currentWt?.label ?? dirBasename(dir)}`,
      proj.id,
    )
  }

  return (
    <Show when={currentProject()}>
      {(proj) => {
        const worktreeDirs = createMemo(
          () => proj().worktrees.map((w) => w.directory),
          [],
          { equals: sameStringArray },
        )
        return (
          <box
            flexDirection="column"
            width="100%"
            height={lowerHalfHeight()}
            flexShrink={0}
            border={["top"]}
            borderColor={context.theme.border.base}
            shouldFill={false}
            paddingTop={1}
            paddingBottom={1}
          >
            <box
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
              width="100%"
              flexShrink={0}
              backgroundColor={headerHovered() ? hoverBg() : undefined}
              onMouseOver={() => headerHover.onEnter()}
              onMouseOut={() => headerHover.onLeave()}
              onMouseUp={() => props.onTogglePanel()}
            >
              <text
                fg={
                  headerHovered()
                    ? context.theme.text.action.primary.selected
                    : context.theme.text.base
                }
                attributes={TextAttributes.BOLD}
                selectable={false}
                wrapMode="none"
              >
                Worktrees
              </text>
              <Show when={proj().worktrees.length > 1}>
                <text
                  fg={
                    headerHovered()
                      ? context.theme.text.muted
                      : context.theme.text.faint
                  }
                  selectable={false}
                  wrapMode="none"
                >
                  {proj().worktrees.length}
                </text>
              </Show>
            </box>

            <scrollbox
              height={sidebarTreeHeight()}
              flexGrow={0}
              flexShrink={0}
              width="100%"
            >
              <box flexDirection="column" width="100%">
                <For each={worktreeDirs()}>
                  {(dir) =>
                    renderSidebarWorktreeRow(
                      ctrl,
                      createMemo(() =>
                        proj().worktrees.find((w) => w.directory === dir),
                      ),
                      false,
                      worktreeHover,
                      chevronHover,
                      plusHover,
                      subSessionHover,
                    )
                  }
                </For>
              </box>
            </scrollbox>

            <box
              flexDirection="column"
              width="100%"
              marginTop={1}
              flexShrink={0}
              backgroundColor={newSessionHovered() ? hoverBg() : undefined}
              onMouseOver={() => newSessionHover.onEnter()}
              onMouseOut={() => newSessionHover.onLeave()}
              onMouseUp={(event) => {
                event.stopPropagation()
                spawnSessionInCurrentWorktree(proj())
              }}
            >
              <text
                fg={
                  newSessionHovered()
                    ? context.theme.text.action.primary.selected
                    : context.theme.text.base
                }
                attributes={TextAttributes.BOLD}
                selectable={false}
                wrapMode="none"
              >
                + New session
              </text>
              <Show when={resolveTargetWorktree(proj())?.label}>
                {(branch) => (
                  <box
                    flexDirection="row"
                    width="100%"
                    paddingLeft={2}
                    overflow="hidden"
                    shouldFill={false}
                  >
                    <HoverMarqueeText
                      renderer={getRenderer}
                      text={branch()}
                      active={newSessionHovered()}
                      fg={
                        newSessionHovered()
                          ? context.theme.text.base
                          : context.theme.text.muted
                      }
                      flexShrink={1}
                    />
                  </box>
                )}
              </Show>
            </box>
          </box>
        )
      }}
    </Show>
  )
}

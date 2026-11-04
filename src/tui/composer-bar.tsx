/** @jsxImportSource @opentui/solid */
import { MouseButton, TextAttributes } from "@opentui/core"
import { Show, createEffect, createMemo } from "solid-js"
import {
  formatComposerWorkspaceBadge,
  type ProjectNode,
  type WorktreeNode,
} from "../model.js"
import { createHoverFlagSignal } from "./hover.js"
import { HoverMarqueeText } from "./marquee.js"
import type { WorkspacesController } from "./state.js"
import { resolveSidebarHoverBg } from "./types.js"

function isLeftClick(event: { readonly button?: number }): boolean {
  return event.button === undefined || event.button === MouseButton.LEFT
}

/**
 * Compact 1-line active workspace/branch bar rendered in `session.composer.top`
 * directly above the prompt composer so long repo names never clip the branch in
 * OpenCode's narrow 22-col left session bar, with a quick toggle for left-tab mode.
 */
export const WorkspaceComposerBar = (props: {
  readonly ctrl: WorkspacesController
  readonly sessionID: string
  readonly onOpenSwitcher: () => void
}) => {
  const { ctrl } = props
  const { context } = ctrl
  const getRenderer = () => context.renderer

  const branchHover = createHoverFlagSignal()
  const branchHovered = branchHover.hovered
  const modeHover = createHoverFlagSignal()
  const modeHovered = modeHover.hovered
  const attentionHover = createHoverFlagSignal()
  const attentionHovered = attentionHover.hovered
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

  const currentProject = createMemo<ProjectNode | undefined>(
    () => tree().projects[0],
  )

  const activeWorktree = createMemo<WorktreeNode | undefined>(() => {
    const proj = currentProject()
    if (!proj) return undefined
    const active = proj.worktrees.find((wt) => wt.isCurrent)
    if (active) return active
    const activeDir = ctrl.resolveActiveDirectory(props.sessionID)
    if (activeDir) {
      return proj.worktrees.find((wt) => wt.directory === activeDir)
    }
    return proj.worktrees[0]
  })

  const otherBlockedWorktreeCount = createMemo(() => {
    const proj = currentProject()
    const activeWt = activeWorktree()
    if (!proj) return 0
    return proj.worktrees.filter(
      (wt) => wt.directory !== activeWt?.directory && wt.status === "blocked",
    ).length
  })

  const badge = createMemo(() => {
    const wt = activeWorktree()
    return wt ? formatComposerWorkspaceBadge(wt) : undefined
  })

  const tabsEnabled = createMemo(() => Boolean(context.ui.tabs?.enabled()))
  const tabsModeLabel = createMemo(() =>
    ctrl.leftTabsMode() === "grouped" ? "tabs: grouped" : "tabs: worktree",
  )

  return (
    <Show when={badge()}>
      {(info) => (
        <box
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          width="100%"
          height={1}
          flexShrink={0}
          paddingLeft={1}
          paddingRight={1}
          gap={2}
          shouldFill={false}
        >
          <box
            flexDirection="row"
            alignItems="center"
            flexGrow={1}
            flexShrink={1}
            minWidth={0}
            overflow="hidden"
            gap={1}
            shouldFill={false}
          >
            <box
              flexDirection="row"
              alignItems="center"
              flexShrink={1}
              minWidth={0}
              overflow="hidden"
              gap={1}
              backgroundColor={branchHovered() ? hoverBg() : undefined}
              shouldFill={branchHovered()}
              onMouseOver={() => branchHover.onEnter()}
              onMouseOut={() => branchHover.onLeave()}
              onMouseUp={(event) => {
                if (!isLeftClick(event)) return
                event.stopPropagation()
                props.onOpenSwitcher()
              }}
            >
              <HoverMarqueeText
                renderer={getRenderer}
                text={info().primaryText}
                active={branchHovered()}
                fg={
                  branchHovered()
                    ? context.theme.text.action.primary.selected
                    : context.theme.text.muted
                }
                attributes={
                  branchHovered() ? TextAttributes.BOLD : TextAttributes.NONE
                }
                flexShrink={1}
              />
              <Show when={info().gitBadge}>
                {(gitText) => (
                  <text
                    fg={
                      branchHovered()
                        ? context.theme.text.base
                        : context.theme.text.faint
                    }
                    selectable={false}
                    wrapMode="none"
                    flexShrink={0}
                  >
                    {gitText()}
                  </text>
                )}
              </Show>
            </box>

            <Show when={otherBlockedWorktreeCount() > 0}>
              <box
                flexDirection="row"
                flexShrink={0}
                backgroundColor={attentionHovered() ? hoverBg() : undefined}
                shouldFill={attentionHovered()}
                onMouseOver={() => attentionHover.onEnter()}
                onMouseOut={() => attentionHover.onLeave()}
                onMouseUp={(event) => {
                  if (!isLeftClick(event)) return
                  event.stopPropagation()
                  props.onOpenSwitcher()
                }}
              >
                <text
                  fg={context.theme.text.feedback.warning.base}
                  attributes={TextAttributes.BOLD}
                  selectable={false}
                  wrapMode="none"
                >
                  {`⚠ ${otherBlockedWorktreeCount()}`}
                </text>
              </box>
            </Show>
          </box>

          <Show when={tabsEnabled()}>
            <box
              flexDirection="row"
              flexShrink={0}
              backgroundColor={modeHovered() ? hoverBg() : undefined}
              shouldFill={modeHovered()}
              onMouseOver={() => modeHover.onEnter()}
              onMouseOut={() => modeHover.onLeave()}
              onMouseUp={(event) => {
                if (!isLeftClick(event)) return
                event.stopPropagation()
                void ctrl.toggleLeftTabsMode()
              }}
            >
              <text
                fg={
                  modeHovered()
                    ? context.theme.text.action.primary.selected
                    : context.theme.text.faint
                }
                attributes={
                  modeHovered() ? TextAttributes.BOLD : TextAttributes.NONE
                }
                selectable={false}
                wrapMode="none"
              >
                {tabsModeLabel()}
              </text>
            </box>
          </Show>
        </box>
      )}
    </Show>
  )
}

import type { Plugin } from "@opencode/plugin/tui"
import type {
  AgentStatus,
  AgentStatusDetail,
  GitSummary,
  GitWorktreeEntry,
} from "../model.js"

export const PANEL_NAME = "opencode-workspaces.panel"

export interface SessionPanelSlotInput {
  readonly name: string
  readonly sessionID: string
  readonly width: number
  readonly presentation: "panel" | "fullscreen"
  readonly focused: boolean
  readonly focus: () => void
  readonly close: () => void
  readonly toggleFullscreen: () => void
}

export interface EphemeralWorkspaceCache {
  worktreesByProject: Record<string, string[]>
  gitWorktreesByRoot: Record<string, GitWorktreeEntry[]>
  gitByDirectory: Record<string, GitSummary>
  lastSyncedAt: number
}

export function worktreeGlyph(status: AgentStatus, isCurrent: boolean): string {
  if (status === "blocked") return "!"
  if (status === "working") return "●"
  if (isCurrent) return "▸"
  return "○"
}

export function statusGlyph(status: AgentStatus, isCurrent: boolean): string {
  if (status === "blocked") return "!"
  if (status === "working") return "●"
  if (isCurrent) return "▸"
  return "·"
}

export function statusLabel(
  status: AgentStatus,
  detail?: AgentStatusDetail,
): string | undefined {
  if (status === "blocked") {
    return detail === "permission" ? "perm" : "ask"
  }
  if (status === "working") return "busy"
  return undefined
}

export function sameStringArray(
  a: readonly string[],
  b: readonly string[],
): boolean {
  return a.length === b.length && a.every((v, idx) => v === b[idx])
}

export function resolveStatusColor(
  theme: Plugin.Context["theme"],
  status: AgentStatus,
  isCurrent: boolean,
) {
  if (status === "blocked") return theme.text.feedback.warning.base
  if (status === "working") return theme.text.feedback.info.base
  if (isCurrent) return theme.text.action.primary.selected
  return theme.text.faint
}

interface ColorChannels {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

export function parseColorChannels(color: unknown): ColorChannels | undefined {
  if (typeof color === "object" && color !== null) {
    const rec = color as Record<string, unknown>
    if (
      ArrayBuffer.isView(rec.buffer) &&
      typeof rec.r === "number" &&
      typeof rec.g === "number" &&
      typeof rec.b === "number" &&
      typeof rec.a === "number" &&
      Number.isFinite(rec.r) &&
      Number.isFinite(rec.g) &&
      Number.isFinite(rec.b) &&
      Number.isFinite(rec.a)
    ) {
      return { r: rec.r, g: rec.g, b: rec.b, a: rec.a }
    }
    return undefined
  }
  if (typeof color !== "string") return undefined
  if (color === "transparent") return { r: 0, g: 0, b: 0, a: 0 }
  const hex = color.startsWith("#") ? color.slice(1) : ""
  if (hex.length === 3 || hex.length === 4) {
    const r = Number.parseInt(hex[0]! + hex[0]!, 16) / 255
    const g = Number.parseInt(hex[1]! + hex[1]!, 16) / 255
    const b = Number.parseInt(hex[2]! + hex[2]!, 16) / 255
    const a = hex.length === 4 ? Number.parseInt(hex[3]! + hex[3]!, 16) / 255 : 1
    if ([r, g, b, a].every(Number.isFinite)) return { r, g, b, a }
  } else if (hex.length === 6 || hex.length === 8) {
    const r = Number.parseInt(hex.slice(0, 2), 16) / 255
    const g = Number.parseInt(hex.slice(2, 4), 16) / 255
    const b = Number.parseInt(hex.slice(4, 6), 16) / 255
    const a =
      hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1
    if ([r, g, b, a].every(Number.isFinite)) return { r, g, b, a }
  }
  return undefined
}

export function isVisiblyDistinctOnSurface(
  candidate: unknown,
  surface: unknown,
  minChannelDelta = 0.08,
): boolean {
  const cand = parseColorChannels(candidate)
  if (!cand) return false
  if (cand.a < 0.12) return false
  const surf = parseColorChannels(surface)
  if (!surf || surf.a < 0.05) return true
  const delta =
    Math.abs(cand.r - surf.r) +
    Math.abs(cand.g - surf.g) +
    Math.abs(cand.b - surf.b)
  return delta >= minChannelDelta
}

/**
 * OpenCode's right sidebar and right split-pane already render on
 * `theme.background.raised.base` (`$hue.neutral.700`, or transparent in
 * transparent terminal themes). Hover highlights must step above `raised.base`
 * with an opaque, perceptually distinct surface color.
 */
export function resolveSidebarHoverBg(theme: Plugin.Context["theme"]) {
  const surface = theme.background.raised.base
  const dialogHovered =
    typeof theme.surface === "function"
      ? theme.surface("dialog")?.background?.action?.primary?.hovered
      : undefined
  const candidates = [
    theme.background.raised.max,
    dialogHovered,
    theme.background.raised.high,
    theme.hue?.interactive?.[600],
  ]
  for (const minDelta of [0.12, 0.06, 0.02]) {
    for (const candidate of candidates) {
      if (candidate && isVisiblyDistinctOnSurface(candidate, surface, minDelta)) {
        return candidate
      }
    }
  }
  for (const candidate of candidates) {
    if (parseColorChannels(candidate)) return candidate
  }
  return theme.background.raised.high
}

export function resolveSidebarAccentHoverBg(theme: Plugin.Context["theme"]) {
  const rowHover = resolveSidebarHoverBg(theme)
  const candidates = [
    theme.hue?.interactive?.[600],
    theme.background.raised.high,
    theme.background.raised.max,
  ]
  for (const candidate of candidates) {
    if (
      candidate &&
      isVisiblyDistinctOnSurface(candidate, theme.background.raised.base, 0.06) &&
      isVisiblyDistinctOnSurface(candidate, rowHover, 0.03)
    ) {
      return candidate
    }
  }
  return rowHover
}

export function resolvePanelRowBg(
  theme: Plugin.Context["theme"],
  state: { readonly selected: boolean; readonly hovered: boolean },
) {
  if (!state.selected && !state.hovered) return undefined
  const surface = theme.background.raised.base
  const high = theme.background.raised.high
  const max = theme.background.raised.max
  const interactive = theme.hue?.interactive?.[600]

  const hoverBg = isVisiblyDistinctOnSurface(high, surface, 0.08)
    ? high
    : resolveSidebarHoverBg(theme)

  if (!state.selected) {
    return hoverBg
  }

  let selectedBg = parseColorChannels(max) ? max : high
  if (
    !isVisiblyDistinctOnSurface(selectedBg, surface, 0.1) ||
    !isVisiblyDistinctOnSurface(selectedBg, hoverBg, 0.04)
  ) {
    if (
      interactive &&
      isVisiblyDistinctOnSurface(interactive, surface, 0.08) &&
      isVisiblyDistinctOnSurface(interactive, hoverBg, 0.03)
    ) {
      selectedBg = interactive
    }
  }

  if (
    state.hovered &&
    interactive &&
    selectedBg !== interactive &&
    isVisiblyDistinctOnSurface(interactive, surface, 0.08) &&
    isVisiblyDistinctOnSurface(interactive, selectedBg, 0.02)
  ) {
    return interactive
  }

  return selectedBg
}

export function resolveDialogHoverBg(
  baseTheme: Plugin.Context["theme"],
  dialogTheme: Plugin.Context["theme"],
) {
  const surface = dialogTheme.background.base
  const hovered = dialogTheme.background.action.primary.hovered
  if (isVisiblyDistinctOnSurface(hovered, surface, 0.08)) {
    return hovered
  }
  return resolveSidebarHoverBg(baseTheme)
}

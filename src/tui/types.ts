import type { Plugin } from "@opencode/plugin/tui"
import type {
  AgentStatus,
  AgentStatusDetail,
  GitSummary,
  GitWorktreeEntry,
} from "../model.js"

export type ThemeColor = Plugin.Context["theme"]["text"]["base"]

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
): ThemeColor {
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

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)))
}

function formatHexRgb(r: number, g: number, b: number): string {
  const hex = (v: number) => clampByte(v).toString(16).padStart(2, "0")
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

function synthesizeHoverSurface(
  surface: unknown,
  text: unknown,
  weight = 0.14,
): string {
  const surf = parseColorChannels(surface)
  const txt = parseColorChannels(text)

  if (!surf || surf.a < 0.05) {
    const base = txt && txt.a >= 0.2 ? txt : { r: 1, g: 1, b: 1 }
    return formatHexRgb(base.r * 0.22, base.g * 0.24, base.b * 0.28)
  }

  const surfLuma = (surf.r + surf.g + surf.b) / 3
  const fallbackTarget =
    surfLuma < 0.5 ? { r: 1, g: 1, b: 1 } : { r: 0, g: 0, b: 0 }
  const textDelta = txt
    ? Math.abs(txt.r - surf.r) +
      Math.abs(txt.g - surf.g) +
      Math.abs(txt.b - surf.b)
    : 0
  const target = txt && txt.a >= 0.2 && textDelta >= 0.3 ? txt : fallbackTarget

  return formatHexRgb(
    surf.r + (target.r - surf.r) * weight,
    surf.g + (target.g - surf.g) * weight,
    surf.b + (target.b - surf.b) * weight,
  )
}

/**
 * OpenCode's right sidebar and right split-pane already render on
 * `theme.background.raised.base` (`$hue.neutral.700`, or transparent in
 * transparent terminal themes). Hover highlights must step above `raised.base`
 * with an opaque, perceptually distinct surface color.
 */
export function resolveSidebarHoverBg(
  theme: Plugin.Context["theme"],
): ThemeColor | string {
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
  for (const minDelta of [0.16, 0.12]) {
    for (const candidate of candidates) {
      if (candidate && isVisiblyDistinctOnSurface(candidate, surface, minDelta)) {
        return candidate
      }
    }
  }
  return synthesizeHoverSurface(surface, theme.text?.base, 0.14)
}

export function resolveSidebarAccentHoverBg(
  theme: Plugin.Context["theme"],
): ThemeColor | string {
  const rowHover = resolveSidebarHoverBg(theme)
  const candidates = [
    theme.hue?.interactive?.[600],
    theme.background.raised.high,
    theme.background.raised.max,
  ]
  for (const candidate of candidates) {
    if (
      candidate &&
      isVisiblyDistinctOnSurface(candidate, theme.background.raised.base, 0.12) &&
      isVisiblyDistinctOnSurface(candidate, rowHover, 0.05)
    ) {
      return candidate
    }
  }
  return synthesizeHoverSurface(rowHover, theme.text?.base, 0.12)
}

export function resolvePanelRowBg(
  theme: Plugin.Context["theme"],
  state: { readonly selected: boolean; readonly hovered: boolean },
): ThemeColor | string | undefined {
  if (!state.selected && !state.hovered) return undefined
  const surface = theme.background.raised.base
  const high = theme.background.raised.high
  const max = theme.background.raised.max
  const interactive = theme.hue?.interactive?.[600]

  const hoverBg = isVisiblyDistinctOnSurface(high, surface, 0.12)
    ? high
    : resolveSidebarHoverBg(theme)

  if (!state.selected) {
    return hoverBg
  }

  let selectedBg: ThemeColor | string = parseColorChannels(max) ? max : high
  if (
    !isVisiblyDistinctOnSurface(selectedBg, surface, 0.14) ||
    !isVisiblyDistinctOnSurface(selectedBg, hoverBg, 0.05)
  ) {
    if (
      interactive &&
      isVisiblyDistinctOnSurface(interactive, surface, 0.12) &&
      isVisiblyDistinctOnSurface(interactive, hoverBg, 0.05)
    ) {
      selectedBg = interactive
    } else {
      selectedBg = synthesizeHoverSurface(hoverBg, theme.text?.base, 0.1)
    }
  }

  if (state.hovered) {
    if (
      interactive &&
      selectedBg !== interactive &&
      isVisiblyDistinctOnSurface(interactive, surface, 0.12) &&
      isVisiblyDistinctOnSurface(interactive, selectedBg, 0.04)
    ) {
      return interactive
    }
    return synthesizeHoverSurface(selectedBg, theme.text?.base, 0.08)
  }

  return selectedBg
}

export function resolveDialogHoverBg(
  baseTheme: Plugin.Context["theme"],
  dialogTheme: Plugin.Context["theme"],
): ThemeColor | string {
  const surface = dialogTheme.background.base
  const hovered = dialogTheme.background.action.primary.hovered
  if (isVisiblyDistinctOnSurface(hovered, surface, 0.12)) {
    return hovered
  }
  const fallback = resolveSidebarHoverBg(baseTheme)
  if (isVisiblyDistinctOnSurface(fallback, surface, 0.12)) {
    return fallback
  }
  return synthesizeHoverSurface(surface, dialogTheme.text?.base, 0.14)
}

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

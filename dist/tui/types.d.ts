import type { Plugin } from "@opencode/plugin/tui";
import type { AgentStatus, AgentStatusDetail, GitSummary, GitWorktreeEntry } from "../model.js";
export type ThemeColor = Plugin.Context["theme"]["text"]["base"];
export declare const PANEL_NAME = "opencode-workspaces.panel";
export interface SessionPanelSlotInput {
    readonly name: string;
    readonly sessionID: string;
    readonly width: number;
    readonly presentation: "panel" | "fullscreen";
    readonly focused: boolean;
    readonly focus: () => void;
    readonly close: () => void;
    readonly toggleFullscreen: () => void;
}
export interface EphemeralWorkspaceCache {
    worktreesByProject: Record<string, string[]>;
    gitWorktreesByRoot: Record<string, GitWorktreeEntry[]>;
    gitByDirectory: Record<string, GitSummary>;
    lastSyncedAt: number;
}
export declare function worktreeGlyph(status: AgentStatus, isCurrent: boolean): string;
export declare function statusGlyph(status: AgentStatus, isCurrent: boolean): string;
export declare function statusLabel(status: AgentStatus, detail?: AgentStatusDetail): string | undefined;
export declare function sameStringArray(a: readonly string[], b: readonly string[]): boolean;
export declare function resolveStatusColor(theme: Plugin.Context["theme"], status: AgentStatus, isCurrent: boolean): ThemeColor;
interface ColorChannels {
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly a: number;
}
export declare function parseColorChannels(color: unknown): ColorChannels | undefined;
export declare function isVisiblyDistinctOnSurface(candidate: unknown, surface: unknown, minChannelDelta?: number): boolean;
/**
 * OpenCode's right sidebar and right split-pane already render on
 * `theme.background.raised.base` (`$hue.neutral.700`, or transparent in
 * transparent terminal themes). Hover highlights must step above `raised.base`
 * with an opaque, perceptually distinct surface color.
 */
export declare function resolveSidebarHoverBg(theme: Plugin.Context["theme"]): ThemeColor | string;
export declare function resolveSidebarAccentHoverBg(theme: Plugin.Context["theme"]): ThemeColor | string;
export declare function resolvePanelRowBg(theme: Plugin.Context["theme"], state: {
    readonly selected: boolean;
    readonly hovered: boolean;
}): ThemeColor | string | undefined;
export declare function resolveDialogHoverBg(baseTheme: Plugin.Context["theme"], dialogTheme: Plugin.Context["theme"]): ThemeColor | string;
export {};

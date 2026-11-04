export type AgentStatus = "blocked" | "working" | "idle";
export type AgentStatusDetail = "permission" | "form" | "running";
export interface GitSummary {
    readonly branch?: string;
    readonly head?: string;
    readonly dirtyCount: number;
    readonly ahead: number;
    readonly behind: number;
}
export interface GitWorktreeEntry {
    readonly directory: string;
    readonly branch?: string;
    readonly head?: string;
}
export type LeftTabsMode = "scoped" | "grouped";
export interface WorkspacePreferences {
    pinnedProjects: string[];
    collapsedProjects: string[];
    expandedSidebarWorktrees?: string[];
    preferredEditor?: string;
    showAllGitProjects: boolean;
    maxRecentProjects: number;
    leftTabsMode?: LeftTabsMode;
    tabsByWorktree?: Record<string, string[]>;
}
export declare const DEFAULT_PREFERENCES: WorkspacePreferences;
export interface ProjectInput {
    readonly id: string;
    readonly canonical: string;
    readonly vcs?: string;
    readonly name?: string;
    readonly sandboxes?: readonly string[];
    readonly time: {
        readonly created: number;
        readonly updated: number;
        readonly active?: number;
        readonly archived?: number;
    };
}
export interface SessionInput {
    readonly id: string;
    readonly parentID?: string;
    readonly projectID: string;
    readonly title?: string;
    readonly outcome?: "succeeded" | "failed" | "interrupted";
    readonly time: {
        readonly created: number;
        readonly updated: number;
        readonly busy?: number;
        readonly idle?: number;
        readonly viewed?: number;
        readonly archived?: number;
    };
    readonly location: {
        readonly directory: string;
        readonly workspaceID?: string;
    };
}
export interface SessionRuntimeState {
    readonly running: boolean;
    readonly permissionsCount: number;
    readonly formsCount: number;
}
export interface WorkspaceSessionNode {
    readonly id: string;
    readonly projectID: string;
    readonly title: string;
    readonly directory: string;
    readonly status: AgentStatus;
    readonly statusDetail?: AgentStatusDetail;
    readonly outcome?: "succeeded" | "failed" | "interrupted";
    readonly isCurrent: boolean;
    readonly updatedAt: number;
}
export interface WorktreeNode {
    readonly projectID: string;
    readonly directory: string;
    readonly label: string;
    readonly sublabel?: string;
    readonly isCanonical: boolean;
    readonly branch?: string;
    readonly dirtyCount: number;
    readonly ahead: number;
    readonly behind: number;
    readonly status: AgentStatus;
    readonly statusDetail?: AgentStatusDetail;
    readonly isCurrent: boolean;
    readonly sessions: readonly WorkspaceSessionNode[];
    readonly primarySessionID?: string;
    readonly quickSlot?: number;
}
export interface ProjectNode {
    readonly id: string;
    readonly name: string;
    readonly canonical: string;
    readonly pinned: boolean;
    readonly collapsed: boolean;
    readonly isCurrent: boolean;
    readonly status: AgentStatus;
    readonly statusDetail?: AgentStatusDetail;
    readonly totalSessions: number;
    readonly activeCount: number;
    readonly updatedAt: number;
    readonly worktrees: readonly WorktreeNode[];
}
export type FlatTreeRow = {
    readonly kind: "project";
    readonly key: string;
    readonly project: ProjectNode;
} | {
    readonly kind: "worktree";
    readonly key: string;
    readonly project: ProjectNode;
    readonly worktree: WorktreeNode;
} | {
    readonly kind: "session";
    readonly key: string;
    readonly project: ProjectNode;
    readonly worktree: WorktreeNode;
    readonly session: WorkspaceSessionNode;
};
export interface WorkspaceTreeResult {
    readonly projects: readonly ProjectNode[];
    readonly rows: readonly FlatTreeRow[];
    readonly quickSlots: ReadonlyMap<number, WorktreeNode>;
    readonly summary: {
        readonly totalProjects: number;
        readonly totalWorktrees: number;
        readonly workingSessions: number;
        readonly blockedSessions: number;
    };
}
export interface BuildWorkspaceTreeInput {
    readonly projects: readonly ProjectInput[];
    readonly sessions: readonly SessionInput[];
    readonly sessionRuntime: Readonly<Record<string, SessionRuntimeState>>;
    readonly worktreesByProject: Readonly<Record<string, readonly string[]>>;
    readonly gitWorktreesByRoot?: Readonly<Record<string, readonly GitWorktreeEntry[]>>;
    readonly gitByDirectory: Readonly<Record<string, GitSummary>>;
    readonly prefs: WorkspacePreferences;
    readonly currentSessionID?: string;
    readonly currentDirectory?: string;
    readonly homeDirectory?: string;
    readonly includeSessionRows?: boolean;
    /** When true (e.g. in the session sidebar & default panel), strictly shows only the active repository. */
    readonly currentProjectOnly?: boolean;
    /** When false (e.g. when viewing all Git repos), includes idle single-worktree Git repos too. */
    readonly onlyRelevantProjects?: boolean;
}
export declare function normalizeDir(dir: string): string;
export declare function dirBasename(dir: string): string;
export declare function isSubpathOrSame(candidateDir: string, rootDir: string): boolean;
export declare function isInvalidWorkspaceRoot(dir: string, homeDirectory?: string): boolean;
export declare function computeSessionStatus(state?: SessionRuntimeState): {
    readonly status: AgentStatus;
    readonly detail?: AgentStatusDetail;
};
export declare function aggregateStatus(items: readonly {
    readonly status: AgentStatus;
    readonly statusDetail?: AgentStatusDetail;
}[]): {
    readonly status: AgentStatus;
    readonly detail?: AgentStatusDetail;
};
/**
 * Computes the status rolled up onto a parent worktree row from child sessions
 * that are NOT currently rendered underneath it. When child sessions are unfolded,
 * their `!` / `●` glyphs and `perm` / `ask` / `busy` badges appear only on the
 * session rows instead of duplicating onto the parent worktree row.
 */
export declare function rollupHiddenWorktreeStatus(worktree: Pick<WorktreeNode, "sessions">, visibleSessions: readonly Pick<WorkspaceSessionNode, "id">[]): {
    readonly status: AgentStatus;
    readonly detail?: AgentStatusDetail;
};
export declare function matchSessionWorktree(sessionDir: string, knownWorktreeDirs: readonly string[], canonicalDir: string): string;
/**
 * Parses `git status --porcelain=v1 -b` output into branch, ahead/behind, and dirty file count.
 */
export declare function parseGitPorcelainBranchStatus(output: string): GitSummary;
/**
 * Parses `git worktree list --porcelain` into real active Git worktrees (excluding bare/prunable).
 */
export declare function parseGitWorktreePorcelain(output: string): GitWorktreeEntry[];
export declare function formatSessionTitle(session: Pick<SessionInput, "id" | "title">): string;
export declare function buildWorkspaceTree(input: BuildWorkspaceTreeInput): WorkspaceTreeResult;
export interface SwitcherWorktreeGroup {
    readonly key: string;
    readonly worktree: WorktreeNode;
    readonly sessions: readonly WorkspaceSessionNode[];
    readonly directlyMatched: boolean;
}
export interface SwitcherProjectGroup {
    readonly project: ProjectNode;
    readonly worktrees: readonly SwitcherWorktreeGroup[];
}
export type SwitcherSelectableRow = {
    readonly kind: "worktree";
    readonly key: string;
    readonly project: ProjectNode;
    readonly worktree: WorktreeNode;
    readonly directlyMatched: boolean;
} | {
    readonly kind: "session";
    readonly key: string;
    readonly project: ProjectNode;
    readonly worktree: WorktreeNode;
    readonly session: WorkspaceSessionNode;
    readonly isLastSession: boolean;
    readonly directlyMatched: boolean;
};
export interface SwitcherFilterResult {
    readonly projects: readonly SwitcherProjectGroup[];
    readonly selectableRows: readonly SwitcherSelectableRow[];
}
/**
 * Formats worktree row titles in `/ws`: labels the canonical repository folder
 * as `Project sessions` with its currently checked-out branch shown as a muted
 * `⎇ <branch>` tag (since OpenCode scopes sessions by folder rather than branch),
 * while secondary Git worktrees keep their dedicated branch/worktree label.
 */
export declare function formatSwitcherWorktreeLabel(wt: Pick<WorktreeNode, "isCanonical" | "label" | "sublabel" | "branch">): {
    readonly title: string;
    readonly subtitle?: string;
};
/**
 * Filters a `ProjectNode[]` hierarchy by query while preserving Project → Worktree → Session
 * tree grouping so matching sessions always retain their parent worktree context.
 */
export declare function filterWorkspaceTreeForSwitcher(projects: readonly ProjectNode[], rawQuery: string): SwitcherFilterResult;
export interface WorkspaceNewSessionTargetInput {
    readonly explicitWorktreeDirectory?: string;
    readonly currentWorktreeDirectory?: string;
    readonly activeSessionDirectory?: string;
    readonly selectedWorkspaceDirectory?: string;
    readonly launchDirectory?: string;
}
/**
 * Resolves the target directory when the user clicks the plugin's explicit
 * "+ session" / "new session" action to spawn a session in a workspace.
 */
export declare function resolveWorkspaceNewSessionDirectory(input: WorkspaceNewSessionTargetInput): string | undefined;
export declare const MARQUEE_GAP = "     ";
export interface MarqueeTimingOptions {
    readonly holdStartMs?: number;
    readonly stepMs?: number;
}
/**
 * Computes one-directional horizontal column scroll offset (`0 .. periodCols - 1`)
 * for a seamless ticker marquee (`"${text}${MARQUEE_GAP}${text}"`).
 *
 * Cycle:
 * 1. Brief initial settle pause at column 0 (`holdStartMs`) when first hovered/focused
 * 2. Continuous one-way advance (`stepMs` per column) wrapping modulo `periodCols`
 *    so the repeated copy glides into column 0 seamlessly without ever reversing
 */
export declare function computeMarqueeScrollX(elapsedMs: number, periodCols: number, options?: MarqueeTimingOptions): number;
export interface EditorPreset {
    readonly id: string;
    readonly title: string;
    readonly command: string;
    readonly description: string;
    readonly kind: "gui" | "terminal";
    readonly macAppName?: string;
}
export declare const EDITOR_PRESETS: readonly EditorPreset[];
export interface ParsedEditorCommand {
    readonly binary: string;
    readonly args: readonly string[];
    readonly kind: "gui" | "terminal";
    readonly macAppName?: string;
}
/**
 * Parses an editor command string (e.g. `zed`, `code --wait`, `/opt/homebrew/bin/nvim`)
 * into executable + sanitized arguments + GUI vs terminal TTY classification.
 */
export declare function parseEditorCommand(rawCommand: string | undefined): ParsedEditorCommand | undefined;
export interface ComposerWorkspaceBadge {
    readonly primaryText: string;
    readonly gitBadge?: string;
}
/**
 * Formats a concise, uncapped workspace/branch badge for `session.composer.top`
 * so long repo names never clip the active worktree/branch in OpenCode's 22-col left bar.
 */
export declare function formatComposerWorkspaceBadge(worktree: Pick<WorktreeNode, "label" | "sublabel" | "branch" | "isCanonical" | "dirtyCount" | "ahead" | "behind">): ComposerWorkspaceBadge;
export declare const MAX_SCOPED_WORKTREE_TABS = 12;
export declare const MAX_RESTORED_GROUPED_TABS = 24;
export interface LeftTabItemInput {
    readonly sessionID: string;
    readonly active?: boolean;
}
export interface LeftTabSessionMeta {
    readonly id: string;
    readonly projectID: string;
    readonly worktreeDirectory: string;
    readonly isCanonicalWorktree: boolean;
    readonly projectPinned: boolean;
    readonly projectCanonical: string;
    readonly updatedAt: number;
}
export interface LeftTabMoveOp {
    readonly sessionID: string;
    readonly index: number;
}
export interface LeftTabsReconcileInput {
    readonly mode: LeftTabsMode;
    readonly openTabs: readonly LeftTabItemInput[];
    readonly knownSessions: ReadonlyMap<string, LeftTabSessionMeta>;
    readonly deletedSessionIDs?: ReadonlySet<string>;
    readonly activeRootSessionID?: string;
    readonly activeWorktreeDirectory?: string;
    readonly activeProjectID?: string;
    readonly showAllGitProjects?: boolean;
    readonly previousScopedWorktreeDirectory?: string;
    readonly previousMode?: LeftTabsMode;
    readonly savedTabsByWorktree: Readonly<Record<string, readonly string[]>>;
}
export interface LeftTabsReconcilePlan {
    readonly toOpen: readonly string[];
    readonly toFocus?: string;
    readonly toClose: readonly string[];
    readonly moves: readonly LeftTabMoveOp[];
    readonly nextScopedWorktreeDirectory: string | undefined;
    readonly nextSavedTabsByWorktree: Record<string, string[]>;
}
/**
 * Computes minimal sequential `tabs.move(sessionID, index)` operations to transform
 * `currentOrder` into `desiredOrder`. Returns `[]` when already ordered.
 */
export declare function computeMinimalTabMoves(currentOrder: readonly string[], desiredOrder: readonly string[]): LeftTabMoveOp[];
/**
 * Pure planner for organizing OpenCode's left session tabs (`context.ui.tabs`) in either:
 * - `"scoped"` mode: swaps the left tab bar to show only the active worktree's sessions,
 *   remembering open tabs & tab order per worktree without deleting any session history.
 * - `"grouped"` mode: keeps tabs across worktrees open simultaneously, stably clustered
 *   by repository and worktree without cursor-jumping on tab clicks.
 */
export declare function planLeftTabsReconciliation(input: LeftTabsReconcileInput): LeftTabsReconcilePlan;

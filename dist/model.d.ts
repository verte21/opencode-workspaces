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
export interface WorkspacePreferences {
    pinnedProjects: string[];
    collapsedProjects: string[];
    expandedSidebarWorktrees?: string[];
    preferredEditor?: string;
    showAllGitProjects: boolean;
    maxRecentProjects: number;
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
export interface MarqueeTimingOptions {
    readonly holdStartMs?: number;
    readonly stepMs?: number;
    readonly holdEndMs?: number;
    readonly returnStepMs?: number;
    readonly betweenCyclesMs?: number;
}
/**
 * Computes horizontal column scroll offset (`0 .. maxScrollX`) for a hovered/focused
 * workspace or session label that overflows its container width.
 *
 * Cycle:
 * 1. Brief initial pause at column 0 (`holdStartMs`)
 * 2. Smooth forward step to `maxScrollX` (`stepMs` per column)
 * 3. Pause at `maxScrollX` so the full suffix is easy to read (`holdEndMs`)
 * 4. Smooth glide back to column 0 (`returnStepMs` per column) + rest (`betweenCyclesMs`)
 */
export declare function computeMarqueeScrollX(elapsedMs: number, maxScrollX: number, options?: MarqueeTimingOptions): number;
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

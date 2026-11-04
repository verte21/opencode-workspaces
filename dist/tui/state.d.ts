import type { Plugin } from "@opencode/plugin/tui";
import type { Store } from "solid-js/store";
import { type ProjectNode, type WorkspacePreferences, type WorkspaceSessionNode, type WorkspaceTreeResult, type WorktreeNode } from "../model.js";
import type { EphemeralWorkspaceCache } from "./types.js";
export interface WorkspacesController {
    readonly context: Plugin.Context;
    readonly prefs: Store<WorkspacePreferences>;
    readonly cache: Store<EphemeralWorkspaceCache>;
    readonly terminalHeight: () => number;
    readonly selectedWorkspace: () => {
        readonly directory: string;
        readonly projectID?: string;
    } | undefined;
    readonly resolveActiveSessionID: (explicitSessionID?: string) => string | undefined;
    readonly resolveActiveDirectory: (activeSessionID?: string) => string | undefined;
    readonly syncSessionWorkspace: (sessionID: string | undefined) => void;
    readonly buildSnapshot: (options?: {
        readonly explicitSessionID?: string;
        readonly includeSessionRows?: boolean;
        readonly currentProjectOnly?: boolean;
        readonly onlyRelevantProjects?: boolean;
    }) => WorkspaceTreeResult;
    readonly refreshWorkspacesData: (options?: {
        readonly forceWorktreeRefresh?: boolean;
        readonly includeAllProjects?: boolean;
    }) => Promise<void>;
    readonly scheduleRefresh: (delayMs?: number) => void;
    readonly findCurrentProject: () => {
        id: string;
        name: string;
        canonical: string;
    } | undefined;
    readonly activateSession: (sessionID: string, directoryHint?: string, projectIDHint?: string) => void;
    readonly createSessionInDirectory: (directory: string, announceLabel?: string, projectIDHint?: string) => Promise<void>;
    readonly openWorktree: (directory: string, preferredSessionID?: string, projectIDHint?: string) => Promise<void>;
    readonly toggleCollapseProject: (projectID: string) => void;
    readonly isSidebarWorktreeExpanded: (directory: string) => boolean;
    readonly toggleSidebarWorktree: (directory: string) => void;
    readonly togglePinProject: (project: {
        id: string;
        name: string;
        canonical: string;
    }) => Promise<void>;
    readonly toggleShowAllGitProjects: () => Promise<void>;
    readonly createWorktreeFlow: (project: {
        id: string;
        name: string;
        canonical: string;
    }, initialBranch?: string) => Promise<void>;
    readonly removeWorktreeFlow: (project: ProjectNode, worktree: WorktreeNode) => Promise<void>;
    readonly removeSessionFlow: (session: WorkspaceSessionNode) => Promise<void>;
    readonly openSessionContextMenu: (session: WorkspaceSessionNode, worktreeDirectory: string, projectID: string) => Promise<void>;
    readonly moveCurrentSessionToDirectory: (targetDirectory: string, explicitSessionID?: string, projectIDHint?: string) => Promise<void>;
    readonly jumpToQuickSlot: (slot: number) => Promise<void>;
    readonly openWorktreeInEditor: (targetDirectory?: string, explicitEditorArg?: string) => Promise<void>;
    readonly choosePreferredEditor: () => Promise<string | undefined>;
    readonly dispose: () => void;
}
export declare function createWorkspacesController(context: Plugin.Context): WorkspacesController;

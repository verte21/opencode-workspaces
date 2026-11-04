import type { WorkspacesController } from "./state.js";
/**
 * Compact 1-line active workspace/branch bar rendered in `session.composer.top`
 * directly above the prompt composer so long repo names never clip the branch in
 * OpenCode's narrow 22-col left session bar, with a quick toggle for left-tab mode.
 */
export declare const WorkspaceComposerBar: (props: {
    readonly ctrl: WorkspacesController;
    readonly sessionID: string;
    readonly onOpenSwitcher: () => void;
}) => import("solid-js").JSX.Element;

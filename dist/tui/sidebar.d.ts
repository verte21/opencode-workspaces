import type { WorkspacesController } from "./state.js";
/**
 * Native-styled right sidebar section anchored in the LOWER HALF of the right sidebar
 * (above `sidebar.footer`), separated from OpenCode's upper session info by a top divider.
 * Strictly scoped to the current session's Git repository so unrelated repos never clutter the sidebar.
 */
export declare const WorkspacesSidebar: (props: {
    readonly ctrl: WorkspacesController;
    readonly sessionID: string;
    readonly onTogglePanel: () => void;
}) => import("solid-js").JSX.Element;

import type { WorkspacesController } from "./state.js";
import { type SessionPanelSlotInput } from "./types.js";
export declare const WorkspacesPanel: (props: {
    readonly ctrl: WorkspacesController;
    readonly panel: SessionPanelSlotInput;
}) => import("solid-js").JSX.Element;

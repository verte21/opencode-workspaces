import type { Plugin } from "@opencode/plugin/tui";
import { type ParsedEditorCommand } from "../model.js";
export interface EditorSpawnRequest {
    readonly binary: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly kind: "gui" | "terminal";
}
export type EditorSpawner = (req: EditorSpawnRequest) => Promise<void>;
export declare function promptPreferredEditor(context: Plugin.Context, currentCommand?: string): Promise<string | undefined>;
export declare function launchParsedEditor(options: {
    readonly context: Plugin.Context;
    readonly directory: string;
    readonly parsed: ParsedEditorCommand;
    readonly spawner?: EditorSpawner;
    readonly platform?: NodeJS.Platform;
    readonly onAfterTerminalExit?: () => void;
}): Promise<void>;
export declare function resolveConfiguredEditor(options: {
    readonly explicitArg?: string;
    readonly pluginOptionEditor?: unknown;
    readonly preferredEditor?: string;
    readonly env?: Readonly<Record<string, string | undefined>>;
}): {
    readonly raw?: string;
    readonly parsed?: ParsedEditorCommand;
    readonly shouldPersistExplicit: boolean;
};

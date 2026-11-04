import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { GitSummary, GitWorktreeEntry } from "./model.js";
export interface InspectLocationsInput {
    readonly directories: readonly string[];
    /** Optional canonical repository roots; when provided, `git worktree list` runs only once per root. */
    readonly rootDirectories?: readonly string[];
}
export interface InspectLocationsOutput {
    readonly summaries: Readonly<Record<string, GitSummary>>;
    readonly worktreesByRoot: Readonly<Record<string, readonly GitWorktreeEntry[]>>;
}
export type WorkspacesUpdatedEvent = {
    readonly directory: string;
    readonly reason: string;
    readonly timestamp: number;
    readonly [key: string]: unknown;
};
export declare const WorkspacesRpc: {
    readonly id: "opencode-workspaces";
    readonly methods: {
        readonly inspectLocations: {
            readonly input: StandardSchemaV1<InspectLocationsInput, InspectLocationsInput>;
            readonly output: StandardSchemaV1<InspectLocationsOutput, InspectLocationsOutput>;
        };
    };
    readonly events: {
        readonly updated: {
            readonly schema: StandardSchemaV1<WorkspacesUpdatedEvent, WorkspacesUpdatedEvent>;
        };
    };
};

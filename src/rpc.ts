import { Rpc } from "@opencode/plugin/rpc"
import type { StandardSchemaV1 } from "@standard-schema/spec"
import type { GitSummary, GitWorktreeEntry } from "./model.js"

export interface InspectLocationsInput {
  readonly directories: readonly string[]
  /** Optional canonical repository roots; when provided, `git worktree list` runs only once per root. */
  readonly rootDirectories?: readonly string[]
}

export interface InspectLocationsOutput {
  readonly summaries: Readonly<Record<string, GitSummary>>
  readonly worktreesByRoot: Readonly<Record<string, readonly GitWorktreeEntry[]>>
}

export type WorkspacesUpdatedEvent = {
  readonly directory: string
  readonly reason: string
  readonly timestamp: number
  readonly [key: string]: unknown
}

function standardSchema<T>(
  parse: (value: unknown) => T | undefined,
  message: string,
): StandardSchemaV1<T, T> {
  return {
    "~standard": {
      version: 1,
      vendor: "opencode-workspaces",
      validate(value: unknown) {
        const parsed = parse(value)
        if (parsed === undefined) {
          return { issues: [{ message }] }
        }
        return { value: parsed }
      },
    },
  }
}

const InspectLocationsInputSchema = standardSchema<InspectLocationsInput>((val) => {
  if (!val || typeof val !== "object") return undefined
  const raw = (val as { directories?: unknown }).directories
  if (!Array.isArray(raw)) return undefined
  const directories = raw.filter((item): item is string => typeof item === "string")
  const rawRoots = (val as { rootDirectories?: unknown }).rootDirectories
  const rootDirectories = Array.isArray(rawRoots)
    ? rawRoots.filter((item): item is string => typeof item === "string")
    : undefined
  return rootDirectories ? { directories, rootDirectories } : { directories }
}, "Expected { directories: string[], rootDirectories?: string[] }")

const InspectLocationsOutputSchema = standardSchema<InspectLocationsOutput>((val) => {
  if (!val || typeof val !== "object") return undefined
  const raw = val as {
    summaries?: unknown
    worktreesByRoot?: unknown
  }
  if (!raw.summaries || typeof raw.summaries !== "object") return undefined

  const summaries: Record<string, GitSummary> = {}
  for (const [dir, entry] of Object.entries(raw.summaries as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue
    const obj = entry as Record<string, unknown>
    summaries[dir] = {
      ...(typeof obj.branch === "string" ? { branch: obj.branch } : {}),
      ...(typeof obj.head === "string" ? { head: obj.head } : {}),
      dirtyCount: typeof obj.dirtyCount === "number" ? obj.dirtyCount : 0,
      ahead: typeof obj.ahead === "number" ? obj.ahead : 0,
      behind: typeof obj.behind === "number" ? obj.behind : 0,
    }
  }

  const worktreesByRoot: Record<string, GitWorktreeEntry[]> = {}
  if (raw.worktreesByRoot && typeof raw.worktreesByRoot === "object") {
    for (const [rootDir, list] of Object.entries(
      raw.worktreesByRoot as Record<string, unknown>,
    )) {
      if (!Array.isArray(list)) continue
      worktreesByRoot[rootDir] = list
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .filter((item) => typeof item.directory === "string")
        .map((item) => ({
          directory: item.directory as string,
          ...(typeof item.branch === "string" ? { branch: item.branch } : {}),
          ...(typeof item.head === "string" ? { head: item.head } : {}),
        }))
    }
  }

  return { summaries, worktreesByRoot }
}, "Expected { summaries, worktreesByRoot }")

const WorkspacesUpdatedEventSchema = standardSchema<WorkspacesUpdatedEvent>((val) => {
  if (!val || typeof val !== "object") return undefined
  const obj = val as Record<string, unknown>
  if (typeof obj.directory !== "string") return undefined
  return {
    directory: obj.directory,
    reason: typeof obj.reason === "string" ? obj.reason : "updated",
    timestamp: typeof obj.timestamp === "number" ? obj.timestamp : Date.now(),
  }
}, "Expected { directory: string, reason: string, timestamp: number }")

export const WorkspacesRpc = Rpc.define({
  id: "opencode-workspaces",
  methods: {
    inspectLocations: {
      input: InspectLocationsInputSchema,
      output: InspectLocationsOutputSchema,
    },
  },
  events: {
    updated: {
      schema: WorkspacesUpdatedEventSchema,
    },
  },
})

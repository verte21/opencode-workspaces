import { Rpc } from "@opencode/plugin/rpc"
import type { StandardSchemaV1 } from "@standard-schema/spec"
import type { GitSummary } from "./model.js"

export interface InspectLocationsInput {
  readonly directories: readonly string[]
}

export interface InspectLocationsOutput {
  readonly summaries: Readonly<Record<string, GitSummary>>
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
  return { directories }
}, "Expected { directories: string[] }")

const InspectLocationsOutputSchema = standardSchema<InspectLocationsOutput>((val) => {
  if (!val || typeof val !== "object") return undefined
  const raw = (val as { summaries?: unknown }).summaries
  if (!raw || typeof raw !== "object") return undefined
  const summaries: Record<string, GitSummary> = {}
  for (const [dir, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue
    const obj = entry as Record<string, unknown>
    summaries[dir] = {
      branch: typeof obj.branch === "string" ? obj.branch : undefined,
      dirtyCount: typeof obj.dirtyCount === "number" ? obj.dirtyCount : 0,
      ahead: typeof obj.ahead === "number" ? obj.ahead : 0,
      behind: typeof obj.behind === "number" ? obj.behind : 0,
    }
  }
  return { summaries }
}, "Expected { summaries: Record<string, GitSummary> }")

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

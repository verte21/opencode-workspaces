import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Schema } from "effect"
import ServerPlugin, { WorkspacesRpc } from "../src/index.js"

describe("ServerPlugin RPC integration", () => {
  test("registers WorkspacesRpc and inspects real git repository status", async () => {
    const repoDir = path.resolve(import.meta.dir, "..")
    let registeredHandlers: Record<string, any> | undefined
    let disposed = false

    const mockContext = {
      location: {
        directory: repoDir,
        project: {
          id: "proj-self",
          directory: repoDir,
          canonical: repoDir,
        },
      },
      rpc: {
        async register(def: unknown, handlers: Record<string, any>) {
          expect(def).toBe(WorkspacesRpc)
          registeredHandlers = handlers
          return {
            events: {
              async emit() {},
            },
            async dispose() {
              disposed = true
            },
          }
        },
      },
      event: {
        subscribe() {
          return {
            async *[Symbol.asyncIterator]() {
              // No-op stream for unit test
            },
          }
        },
      },
    } as any

    const cleanup = await ServerPlugin.setup(mockContext)
    expect(registeredHandlers).toBeDefined()

    const result = await registeredHandlers!.inspectLocations(
      { directories: [repoDir] },
      {
        signal: new AbortController().signal,
        error: (type: string, message: string) => ({ type, message }),
      },
    )

    expect(result.summaries[repoDir]).toBeDefined()
    expect(typeof result.summaries[repoDir].branch).toBe("string")
    expect(result.summaries[repoDir].branch.length).toBeGreaterThan(0)
    expect(typeof result.summaries[repoDir].dirtyCount).toBe("number")

    // Must pass both StandardSchemaV1 validation and OpenCode's Effect Schema.Json RPC response encoder (no `undefined` property values)
    const validated =
      WorkspacesRpc.methods.inspectLocations.output["~standard"].validate(result)
    expect("value" in validated).toBe(true)
    if ("value" in validated) {
      expect(() =>
        Schema.encodeUnknownSync(Schema.Json)(validated.value as any),
      ).not.toThrow()
    }

    // Passing explicit `rootDirectories: [repoDir]` inspects worktree status without duplicating `worktreesByRoot` keys
    const discoveredWts = result.worktreesByRoot[repoDir] ?? []
    if (discoveredWts.length > 1) {
      const siblingDir = discoveredWts[1]!.directory
      const scopedResult = await registeredHandlers!.inspectLocations(
        {
          directories: [repoDir, siblingDir],
          rootDirectories: [repoDir],
        },
        {
          signal: new AbortController().signal,
          error: (type: string, message: string) => ({ type, message }),
        },
      )
      expect(Object.keys(scopedResult.worktreesByRoot)).toEqual([repoDir])
      expect(scopedResult.summaries[siblingDir]).toBeDefined()
    }

    if (cleanup) await cleanup()
    expect(disposed).toBe(true)
  })
})

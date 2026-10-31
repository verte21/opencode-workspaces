import { execFile } from "node:child_process"
import { Plugin } from "@opencode/plugin"
import {
  type GitSummary,
  normalizeDir,
  parseGitPorcelainBranchStatus,
} from "./model.js"
import { WorkspacesRpc } from "./rpc.js"

const CACHE_TTL_MS = 1500
const MAX_DIRECTORIES_PER_CALL = 32
const MAX_CONCURRENCY = 4

interface CacheEntry {
  readonly summary: GitSummary
  readonly expiresAt: number
}

function inspectGitDirectory(
  directory: string,
  signal?: AbortSignal,
): Promise<GitSummary | undefined> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", directory, "--no-optional-locks", "status", "--porcelain=v1", "-b"],
      {
        timeout: 2500,
        maxBuffer: 512 * 1024,
        signal,
      },
      (error, stdout) => {
        if (error || typeof stdout !== "string") {
          resolve(undefined)
          return
        }
        resolve(parseGitPorcelainBranchStatus(stdout))
      },
    )
  })
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor
      cursor += 1
      results[idx] = await worker(items[idx]!)
    }
  })
  await Promise.all(runners)
  return results
}

export default Plugin.define({
  id: "opencode-workspaces",
  async setup(context) {
    const cache = new Map<string, CacheEntry>()

    const registration = await context.rpc.register(WorkspacesRpc, {
      async inspectLocations(input, callCtx) {
        const uniqueDirs = Array.from(
          new Set(
            input.directories
              .map((d) => normalizeDir(d))
              .filter((d) => d.length > 0 && d.startsWith("/")),
          ),
        ).slice(0, MAX_DIRECTORIES_PER_CALL)

        const now = Date.now()
        const summaries: Record<string, GitSummary> = {}
        const misses: string[] = []

        for (const dir of uniqueDirs) {
          const cached = cache.get(dir)
          if (cached && cached.expiresAt > now) {
            summaries[dir] = cached.summary
          } else {
            misses.push(dir)
          }
        }

        if (misses.length > 0) {
          await mapWithConcurrency(misses, MAX_CONCURRENCY, async (dir) => {
            if (callCtx.signal.aborted) return
            const summary = await inspectGitDirectory(dir, callCtx.signal)
            if (summary) {
              cache.set(dir, { summary, expiresAt: Date.now() + CACHE_TTL_MS })
              summaries[dir] = summary
            }
          })
        }

        return { summaries }
      },
    })

    const abortController = new AbortController()
    let debounceTimer: ReturnType<typeof setTimeout> | undefined
    let pendingReason = "updated"

    const scheduleEmit = (reason: string) => {
      pendingReason = reason
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined
        cache.clear()
        void registration.events
          .emit("updated", {
            directory: context.location.directory,
            reason: pendingReason,
            timestamp: Date.now(),
          })
          .catch(() => {})
      }, 500)
    }

    void (async () => {
      try {
        for await (const event of context.event.subscribe({
          signal: abortController.signal,
        })) {
          if (
            event.type === "worktree.updated" ||
            event.type === "vcs.branch.updated" ||
            event.type === "filesystem.changed" ||
            event.type === "project.updated"
          ) {
            scheduleEmit(event.type)
          }
        }
      } catch {
        // Subscription aborted on plugin teardown
      }
    })()

    return async () => {
      abortController.abort()
      if (debounceTimer) clearTimeout(debounceTimer)
      await registration.dispose()
    }
  },
})

export * from "./model.js"
export { WorkspacesRpc } from "./rpc.js"

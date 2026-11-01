import { execFile } from "node:child_process"
import { Plugin } from "@opencode/plugin"
import {
  type GitSummary,
  type GitWorktreeEntry,
  isInvalidWorkspaceRoot,
  normalizeDir,
  parseGitPorcelainBranchStatus,
  parseGitWorktreePorcelain,
} from "./model.js"
import { WorkspacesRpc } from "./rpc.js"

const CACHE_TTL_MS = 2000
const MAX_ROOTS_PER_CALL = 16
const MAX_DIRECTORIES_PER_CALL = 48
const MAX_CONCURRENCY = 4

interface SummaryCacheEntry {
  readonly summary: GitSummary
  readonly expiresAt: number
}

interface WorktreeCacheEntry {
  readonly worktrees: readonly GitWorktreeEntry[]
  readonly expiresAt: number
}

function runGit(
  directory: string,
  args: readonly string[],
  signal?: AbortSignal,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", directory, "--no-optional-locks", ...args],
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
        resolve(stdout)
      },
    )
  })
}

async function inspectGitDirectory(
  directory: string,
  signal?: AbortSignal,
): Promise<GitSummary | undefined> {
  const stdout = await runGit(
    directory,
    ["status", "--porcelain=v1", "-b"],
    signal,
  )
  if (stdout === undefined) return undefined
  return parseGitPorcelainBranchStatus(stdout)
}

async function listGitWorktrees(
  directory: string,
  signal?: AbortSignal,
): Promise<readonly GitWorktreeEntry[] | undefined> {
  const stdout = await runGit(
    directory,
    ["worktree", "list", "--porcelain"],
    signal,
  )
  if (stdout === undefined) return undefined
  return parseGitWorktreePorcelain(stdout)
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
    const summaryCache = new Map<string, SummaryCacheEntry>()
    const worktreeCache = new Map<string, WorktreeCacheEntry>()

    const registration = await context.rpc.register(WorkspacesRpc, {
      async inspectLocations(input, callCtx) {
        const sanitizeDirs = (rawDirs: readonly string[], limit: number) =>
          Array.from(
            new Set(
              rawDirs
                .map((d) => normalizeDir(d))
                .filter((d) => !isInvalidWorkspaceRoot(d) && d.startsWith("/")),
            ),
          ).slice(0, limit)

        const requestedDirs = sanitizeDirs(
          input.directories,
          MAX_DIRECTORIES_PER_CALL,
        )
        const wtRootCandidates = input.rootDirectories
          ? sanitizeDirs(input.rootDirectories, MAX_ROOTS_PER_CALL)
          : requestedDirs.slice(0, MAX_ROOTS_PER_CALL)

        const now = Date.now()
        const worktreesByRoot: Record<string, readonly GitWorktreeEntry[]> = {}
        const allStatusDirs = new Set<string>(requestedDirs)
        for (const rootDir of wtRootCandidates) {
          allStatusDirs.add(rootDir)
        }

        // 1. Discover real Git worktrees (`git worktree list --porcelain`) once per repository root
        const coveredWorktreeMembers = new Set<string>()
        const wtMisses: string[] = []
        for (const dir of wtRootCandidates) {
          if (!input.rootDirectories && coveredWorktreeMembers.has(dir)) {
            continue
          }
          const cached = worktreeCache.get(dir)
          if (cached && cached.expiresAt > now) {
            worktreesByRoot[dir] = cached.worktrees
            for (const wt of cached.worktrees) {
              coveredWorktreeMembers.add(wt.directory)
              if (!isInvalidWorkspaceRoot(wt.directory)) {
                allStatusDirs.add(wt.directory)
              }
            }
          } else {
            wtMisses.push(dir)
          }
        }

        const inspectWorktreeRoot = async (dir: string) => {
          if (callCtx.signal.aborted) return
          if (!input.rootDirectories && coveredWorktreeMembers.has(dir)) return
          const wts = await listGitWorktrees(dir, callCtx.signal)
          if (!wts) {
            worktreeCache.delete(dir)
            return
          }
          if (wts.length > 0) {
            worktreeCache.set(dir, {
              worktrees: wts,
              expiresAt: Date.now() + CACHE_TTL_MS,
            })
            worktreesByRoot[dir] = wts
            for (const wt of wts) {
              coveredWorktreeMembers.add(wt.directory)
              if (
                !isInvalidWorkspaceRoot(wt.directory) &&
                allStatusDirs.size < MAX_DIRECTORIES_PER_CALL
              ) {
                allStatusDirs.add(wt.directory)
              }
            }
          }
        }

        if (wtMisses.length > 0) {
          if (input.rootDirectories) {
            await mapWithConcurrency(
              wtMisses,
              MAX_CONCURRENCY,
              inspectWorktreeRoot,
            )
          } else {
            // Legacy caller without explicit `rootDirectories`: resolve sequentially so sibling worktrees share discovery
            for (const dir of wtMisses) {
              await inspectWorktreeRoot(dir)
            }
          }
        }

        // 2. Inspect branch + dirty + ahead/behind status once for each root & worktree
        const summaries: Record<string, GitSummary> = {}
        const statusMisses: string[] = []
        for (const dir of allStatusDirs) {
          const cached = summaryCache.get(dir)
          if (cached && cached.expiresAt > now) {
            summaries[dir] = cached.summary
          } else {
            statusMisses.push(dir)
          }
        }

        if (statusMisses.length > 0) {
          await mapWithConcurrency(statusMisses, MAX_CONCURRENCY, async (dir) => {
            if (callCtx.signal.aborted) return
            const summary = await inspectGitDirectory(dir, callCtx.signal)
            if (summary) {
              summaryCache.set(dir, {
                summary,
                expiresAt: Date.now() + CACHE_TTL_MS,
              })
              summaries[dir] = summary
            } else {
              summaryCache.delete(dir)
            }
          })
        }

        return { summaries, worktreesByRoot }
      },
    })

    const abortController = new AbortController()
    let debounceTimer: ReturnType<typeof setTimeout> | undefined
    let pendingReason = "updated"
    let pendingInvalidateWorktrees = false

    const scheduleEmit = (reason: string, invalidateWorktrees: boolean) => {
      pendingReason = reason
      if (invalidateWorktrees) {
        pendingInvalidateWorktrees = true
      }
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined
        summaryCache.clear()
        if (pendingInvalidateWorktrees) {
          worktreeCache.clear()
          pendingInvalidateWorktrees = false
        }
        void registration.events
          .emit("updated", {
            directory: context.location.directory,
            reason: pendingReason,
            timestamp: Date.now(),
          })
          .catch(() => {})
      }, 400)
    }

    void (async () => {
      try {
        for await (const event of context.event.subscribe({
          signal: abortController.signal,
        })) {
          if (
            event.type === "worktree.updated" ||
            event.type === "vcs.branch.updated" ||
            event.type === "project.updated"
          ) {
            scheduleEmit(event.type, true)
          } else if (event.type === "filesystem.changed") {
            scheduleEmit(event.type, false)
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

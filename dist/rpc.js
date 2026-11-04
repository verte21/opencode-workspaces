import { Rpc } from "@opencode/plugin/rpc";
function standardSchema(parse, message) {
  return {
    "~standard": {
      version: 1,
      vendor: "opencode-workspaces",
      validate(value) {
        const parsed = parse(value);
        if (parsed === undefined) {
          return {
            issues: [{
              message
            }]
          };
        }
        return {
          value: parsed
        };
      }
    }
  };
}
const InspectLocationsInputSchema = standardSchema(val => {
  if (!val || typeof val !== "object") return undefined;
  const raw = val.directories;
  if (!Array.isArray(raw)) return undefined;
  const directories = raw.filter(item => typeof item === "string");
  const rawRoots = val.rootDirectories;
  const rootDirectories = Array.isArray(rawRoots) ? rawRoots.filter(item => typeof item === "string") : undefined;
  return rootDirectories ? {
    directories,
    rootDirectories
  } : {
    directories
  };
}, "Expected { directories: string[], rootDirectories?: string[] }");
const InspectLocationsOutputSchema = standardSchema(val => {
  if (!val || typeof val !== "object") return undefined;
  const raw = val;
  if (!raw.summaries || typeof raw.summaries !== "object") return undefined;
  const summaries = {};
  for (const [dir, entry] of Object.entries(raw.summaries)) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry;
    summaries[dir] = {
      ...(typeof obj.branch === "string" ? {
        branch: obj.branch
      } : {}),
      ...(typeof obj.head === "string" ? {
        head: obj.head
      } : {}),
      dirtyCount: typeof obj.dirtyCount === "number" ? obj.dirtyCount : 0,
      ahead: typeof obj.ahead === "number" ? obj.ahead : 0,
      behind: typeof obj.behind === "number" ? obj.behind : 0
    };
  }
  const worktreesByRoot = {};
  if (raw.worktreesByRoot && typeof raw.worktreesByRoot === "object") {
    for (const [rootDir, list] of Object.entries(raw.worktreesByRoot)) {
      if (!Array.isArray(list)) continue;
      worktreesByRoot[rootDir] = list.filter(item => Boolean(item && typeof item === "object")).filter(item => typeof item.directory === "string").map(item => ({
        directory: item.directory,
        ...(typeof item.branch === "string" ? {
          branch: item.branch
        } : {}),
        ...(typeof item.head === "string" ? {
          head: item.head
        } : {})
      }));
    }
  }
  return {
    summaries,
    worktreesByRoot
  };
}, "Expected { summaries, worktreesByRoot }");
const WorkspacesUpdatedEventSchema = standardSchema(val => {
  if (!val || typeof val !== "object") return undefined;
  const obj = val;
  if (typeof obj.directory !== "string") return undefined;
  return {
    directory: obj.directory,
    reason: typeof obj.reason === "string" ? obj.reason : "updated",
    timestamp: typeof obj.timestamp === "number" ? obj.timestamp : Date.now()
  };
}, "Expected { directory: string, reason: string, timestamp: number }");
export const WorkspacesRpc = Rpc.define({
  id: "opencode-workspaces",
  methods: {
    inspectLocations: {
      input: InspectLocationsInputSchema,
      output: InspectLocationsOutputSchema
    }
  },
  events: {
    updated: {
      schema: WorkspacesUpdatedEventSchema
    }
  }
});

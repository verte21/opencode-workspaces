import { spawn } from "node:child_process";
import { EDITOR_PRESETS, dirBasename, parseEditorCommand } from "../model.js";
function defaultSpawnEditor(req) {
  if (req.kind === "terminal") {
    return new Promise((resolve, reject) => {
      const child = spawn(req.binary, [...req.args], {
        cwd: req.cwd,
        stdio: "inherit"
      });
      child.once("error", reject);
      child.once("exit", code => {
        if (code && code !== 0) {
          reject(new Error(`${req.binary} exited with code ${code}`));
          return;
        }
        resolve();
      });
    });
  }
  return new Promise((resolve, reject) => {
    const child = spawn(req.binary, [...req.args], {
      cwd: req.cwd,
      detached: true,
      stdio: "ignore"
    });
    let settled = false;
    child.once("error", err => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    child.once("spawn", () => {
      if (settled) return;
      settled = true;
      child.unref();
      resolve();
    });
  });
}
export async function promptPreferredEditor(context, currentCommand) {
  const options = EDITOR_PRESETS.map(preset => ({
    title: preset.title,
    value: preset.command,
    description: preset.description,
    footer: preset.command,
    category: preset.kind === "gui" ? "GUI Editors" : "Terminal Editors"
  }));
  return context.ui.dialog.select({
    title: "Choose Editor for Worktrees",
    placeholder: "Select an editor (zed, cursor, code, nvim...)",
    options,
    current: currentCommand
  });
}
export async function launchParsedEditor(options) {
  const {
    context,
    directory,
    parsed
  } = options;
  const runSpawn = options.spawner ?? defaultSpawnEditor;
  const platform = options.platform ?? process.platform;
  if (parsed.kind === "terminal") {
    context.ui.dialog.clear();
    let suspended = false;
    try {
      await context.renderer.suspend();
      suspended = true;
      await runSpawn({
        binary: parsed.binary,
        args: [...parsed.args, "."],
        cwd: directory,
        kind: "terminal"
      });
    } finally {
      if (suspended) {
        try {
          await context.renderer.resume();
        } catch {
          // Ignore resume errors during shutdown
        }
      }
      options.onAfterTerminalExit?.();
    }
    return;
  }
  try {
    await runSpawn({
      binary: parsed.binary,
      args: [...parsed.args, directory],
      cwd: directory,
      kind: "gui"
    });
  } catch (err) {
    const isNotFound = err instanceof Error && "code" in err && err.code === "ENOENT";
    if (isNotFound && platform === "darwin" && parsed.macAppName) {
      await runSpawn({
        binary: "open",
        args: ["-a", parsed.macAppName, directory],
        cwd: directory,
        kind: "gui"
      });
    } else {
      throw err;
    }
  }
  context.ui.toast.show({
    message: `Opened ${dirBasename(directory) || directory} in ${dirBasename(parsed.binary)}`,
    variant: "success",
    duration: 1800
  });
}
export function resolveConfiguredEditor(options) {
  const explicitTrimmed = options.explicitArg?.trim();
  if (explicitTrimmed) {
    return {
      raw: explicitTrimmed,
      parsed: parseEditorCommand(explicitTrimmed),
      shouldPersistExplicit: true
    };
  }
  if (typeof options.pluginOptionEditor === "string" && options.pluginOptionEditor.trim()) {
    const raw = options.pluginOptionEditor.trim();
    return {
      raw,
      parsed: parseEditorCommand(raw),
      shouldPersistExplicit: false
    };
  }
  if (options.preferredEditor?.trim()) {
    const raw = options.preferredEditor.trim();
    return {
      raw,
      parsed: parseEditorCommand(raw),
      shouldPersistExplicit: false
    };
  }
  const env = options.env ?? process.env;
  const envEditor = env.VISUAL?.trim() || env.EDITOR?.trim();
  if (envEditor) {
    return {
      raw: envEditor,
      parsed: parseEditorCommand(envEditor),
      shouldPersistExplicit: false
    };
  }
  return {
    shouldPersistExplicit: false
  };
}

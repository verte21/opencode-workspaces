import { createComponent as _$createComponent } from "@opentui/solid";
/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui";
import { Show } from "solid-js";
import { dirBasename } from "./model.js";
import { WorkspacesPanel } from "./tui/panel.js";
import { WorkspacesSidebar } from "./tui/sidebar.js";
import { createWorkspacesController } from "./tui/state.js";
import { WorkspaceSwitcherDialog } from "./tui/switcher-dialog.js";
import { PANEL_NAME } from "./tui/types.js";
export default Plugin.define({
  id: "opencode-workspaces",
  setup(context) {
    const toggleKey = typeof context.options.toggleKey === "string" ? context.options.toggleKey : "ctrl+g";
    const switcherKey = typeof context.options.switcherKey === "string" ? context.options.switcherKey : "ctrl+shift+w";
    const openEditorKey = typeof context.options.openEditorKey === "string" ? context.options.openEditorKey : false;
    const ctrl = createWorkspacesController(context);
    const openWorkspaceSwitcherDialog = showAllOverride => {
      context.ui.dialog.show(() => _$createComponent(WorkspaceSwitcherDialog, {
        ctrl: ctrl,
        initialShowAll: showAllOverride
      }));
    };
    const toggleWorkspacesPanel = () => {
      const route = context.ui.router.current();
      if (route.type !== "session") {
        openWorkspaceSwitcherDialog();
        return;
      }
      const activePanel = context.ui.panel.current();
      if (activePanel?.name === PANEL_NAME) {
        context.ui.panel.close();
      } else {
        ctrl.scheduleRefresh(0);
        const opened = context.ui.panel.open(PANEL_NAME);
        if (!opened) {
          openWorkspaceSwitcherDialog();
        }
      }
    };
    const handleSlashWs = async rawArgs => {
      const trimmed = (rawArgs ?? "").trim();
      const argsText = trimmed.replace(/^\/(?:ws|workspaces)\b\s*/i, "").trim();
      if (!argsText) {
        openWorkspaceSwitcherDialog();
        return;
      }
      const [sub, ...rest] = argsText.split(/\s+/);
      const restJoined = rest.join(" ").trim();
      if (/^[1-9]$/.test(sub)) {
        await ctrl.jumpToQuickSlot(Number.parseInt(sub, 10));
        return;
      }
      switch (sub.toLowerCase()) {
        case "open":
        case "edit":
        case "ide":
        case "code":
          await ctrl.openWorktreeInEditor(undefined, restJoined || undefined);
          return;
        case "editor":
          if (restJoined) {
            await ctrl.openWorktreeInEditor(undefined, restJoined);
          } else {
            await ctrl.choosePreferredEditor();
          }
          return;
        case "panel":
        case "pane":
        case "right":
          toggleWorkspacesPanel();
          return;
        case "new":
        case "wt":
        case "worktree":
          {
            const proj = ctrl.findCurrentProject();
            if (!proj) {
              context.ui.toast.show({
                message: "Open a Git repository first to create a worktree",
                variant: "warning"
              });
              return;
            }
            await ctrl.createWorktreeFlow(proj, restJoined || undefined);
            return;
          }
        case "session":
        case "s":
          {
            const dir = ctrl.resolveActiveDirectory();
            if (!dir) return;
            const proj = ctrl.findCurrentProject();
            await ctrl.createSessionInDirectory(dir, `Started session in ${dirBasename(dir)}`, proj?.id);
            return;
          }
        case "pin":
          {
            const proj = ctrl.findCurrentProject();
            if (proj) await ctrl.togglePinProject(proj);
            return;
          }
        case "all":
        case "filter":
          await ctrl.toggleShowAllGitProjects();
          return;
        case "refresh":
        case "sync":
          await ctrl.refreshWorkspacesData({
            forceWorktreeRefresh: true
          });
          context.ui.toast.show({
            message: "Refreshed Git worktrees",
            variant: "success",
            duration: 1400
          });
          return;
        default:
          openWorkspaceSwitcherDialog();
      }
    };
    const quickJumpCommands = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(slot => ({
      id: `workspaces.jump.${slot}`,
      title: `Workspaces: Jump to Worktree ${slot}`,
      group: "Workspaces",
      run: () => ctrl.jumpToQuickSlot(slot)
    }));
    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "workspaces.panel.toggle",
        title: "Workspaces: Toggle Worktrees Panel",
        description: "Open or close the interactive Git Worktrees right panel",
        group: "Workspaces",
        bind: toggleKey,
        palette: true,
        suggested: true,
        run: () => {
          toggleWorkspacesPanel();
        }
      }, {
        id: "workspaces.switcher",
        title: "Workspaces: Switch Worktree",
        description: "Search and switch across Git worktrees and sessions (/ws [1-9|open|editor|new|panel|all])",
        group: "Workspaces",
        bind: switcherKey,
        palette: true,
        slash: {
          name: "ws",
          aliases: ["workspaces"],
          arguments: true
        },
        run: input => handleSlashWs(input)
      }, {
        id: "workspaces.worktree.openEditor",
        title: "Workspaces: Open Worktree in Editor",
        description: "Open the active Git worktree in your preferred editor (Zed, Cursor, VS Code, Neovim, etc.)",
        group: "Workspaces",
        bind: openEditorKey,
        palette: true,
        suggested: true,
        run: async () => {
          await ctrl.openWorktreeInEditor();
        }
      }, {
        id: "workspaces.editor.select",
        title: "Workspaces: Set Preferred Editor",
        description: "Choose which GUI or terminal editor opens Git worktrees",
        group: "Workspaces",
        palette: true,
        run: async () => {
          await ctrl.choosePreferredEditor();
        }
      }, {
        id: "workspaces.worktree.new",
        title: "Workspaces: New Git Worktree",
        group: "Workspaces",
        palette: true,
        run: async () => {
          const proj = ctrl.findCurrentProject();
          if (proj) await ctrl.createWorktreeFlow(proj);
        }
      }, {
        id: "workspaces.session.new",
        title: "Workspaces: New Session in Current Worktree",
        group: "Workspaces",
        palette: true,
        run: async () => {
          const dir = ctrl.resolveActiveDirectory();
          if (!dir) return;
          const proj = ctrl.findCurrentProject();
          await ctrl.createSessionInDirectory(dir, `Started session in ${dirBasename(dir)}`, proj?.id);
        }
      }, {
        id: "workspaces.project.pin",
        title: "Workspaces: Pin / Unpin Repository",
        group: "Workspaces",
        palette: true,
        run: async () => {
          const proj = ctrl.findCurrentProject();
          if (proj) await ctrl.togglePinProject(proj);
        }
      }, ...quickJumpCommands]
    }));
    const stopSidebarSlot = context.ui.slot({
      before: "sidebar.footer",
      render: ({
        sessionID
      }) => _$createComponent(WorkspacesSidebar, {
        ctrl: ctrl,
        sessionID: sessionID,
        onTogglePanel: toggleWorkspacesPanel
      })
    });
    const stopPanelSlot = context.ui.slot({
      append: "session.panel",
      render: panel => _$createComponent(Show, {
        get when() {
          return panel.name === PANEL_NAME;
        },
        get children() {
          return _$createComponent(WorkspacesPanel, {
            ctrl: ctrl,
            panel: panel
          });
        }
      })
    });
    return () => {
      try {
        stopSidebarSlot();
      } catch {
        // Ignore teardown errors
      }
      try {
        stopPanelSlot();
      } catch {
        // Ignore teardown errors
      }
      ctrl.dispose();
    };
  }
});

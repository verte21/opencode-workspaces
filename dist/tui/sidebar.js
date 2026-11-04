import { effect as _$effect } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
/** @jsxImportSource @opentui/solid */
import { MouseButton, TextAttributes } from "@opentui/core";
import { For, Show, createEffect, createMemo } from "solid-js";
import { dirBasename, resolveWorkspaceNewSessionDirectory } from "../model.js";
import { createHoverFlagSignal, createHoverKeySignal } from "./hover.js";
import { HoverMarqueeText } from "./marquee.js";
import { resolveSidebarAccentHoverBg, resolveSidebarHoverBg, resolveStatusColor, sameStringArray, statusGlyph, workspaceStatusGlyph } from "./types.js";
function isLeftClick(event) {
  return event.button === undefined || event.button === MouseButton.LEFT;
}
function isRightClick(event) {
  return event.button === MouseButton.RIGHT;
}
function renderSidebarWorktreeRow(ctrl, wtAccessor, indented, worktreeHover, chevronHover, plusHover, sessionHover, sessionDeleteHover) {
  const {
    context
  } = ctrl;
  const getRenderer = () => context.renderer;
  const hoverBg = () => resolveSidebarHoverBg(context.theme);
  const accentHoverBg = () => resolveSidebarAccentHoverBg(context.theme);
  return _$createComponent(Show, {
    get when() {
      return wtAccessor();
    },
    children: wt => {
      const hasSessions = () => wt().sessions.length > 0;
      const isExpanded = createMemo(() => hasSessions() && ctrl.isSidebarWorktreeExpanded(wt().directory));
      // When expanded, show all sessions in the worktree; when collapsed, still surface actively running/blocked background sessions
      const visibleSessions = createMemo(() => {
        const cur = wt();
        if (isExpanded()) return cur.sessions;
        return cur.sessions.filter(s => !s.isCurrent && s.status !== "idle").slice(0, 3);
      });
      const visibleSessionIDs = createMemo(() => visibleSessions().map(s => s.id), [], {
        equals: sameStringArray
      });
      const isRowHovered = () => worktreeHover.hoveredKey() === wt().directory;
      const isChevronHovered = () => chevronHover.hoveredKey() === wt().directory;
      const isPlusHovered = () => plusHover.hoveredKey() === wt().directory;
      return (() => {
        var _el$ = _$createElement("box"),
          _el$2 = _$createElement("box"),
          _el$3 = _$createElement("box"),
          _el$4 = _$createElement("box"),
          _el$5 = _$createElement("text"),
          _el$6 = _$createElement("box"),
          _el$7 = _$createElement("box"),
          _el$8 = _$createElement("text");
        _$insertNode(_el$, _el$2);
        _$setProp(_el$, "flexDirection", "column");
        _$setProp(_el$, "width", "100%");
        _$insertNode(_el$2, _el$3);
        _$insertNode(_el$2, _el$6);
        _$setProp(_el$2, "flexDirection", "row");
        _$setProp(_el$2, "justifyContent", "space-between");
        _$setProp(_el$2, "alignItems", "center");
        _$setProp(_el$2, "width", "100%");
        _$setProp(_el$2, "paddingLeft", indented ? 2 : 0);
        _$setProp(_el$2, "onMouseOver", () => worktreeHover.onEnter(wt().directory));
        _$setProp(_el$2, "onMouseOut", () => worktreeHover.onLeave(wt().directory));
        _$setProp(_el$2, "onMouseUp", event => {
          if (!isLeftClick(event)) return;
          const cur = wt();
          if (cur.isCurrent && hasSessions()) {
            ctrl.toggleSidebarWorktree(cur.directory);
            return;
          }
          void ctrl.openWorktree(cur.directory, cur.primarySessionID, cur.projectID);
        });
        _$insertNode(_el$3, _el$4);
        _$setProp(_el$3, "flexDirection", "row");
        _$setProp(_el$3, "flexGrow", 1);
        _$setProp(_el$3, "flexShrink", 1);
        _$setProp(_el$3, "overflow", "hidden");
        _$insertNode(_el$4, _el$5);
        _$setProp(_el$4, "paddingRight", 1);
        _$setProp(_el$4, "flexShrink", 0);
        _$setProp(_el$4, "onMouseOver", () => chevronHover.onEnter(wt().directory));
        _$setProp(_el$4, "onMouseOut", () => chevronHover.onLeave(wt().directory));
        _$setProp(_el$4, "onMouseUp", event => {
          if (!isLeftClick(event)) return;
          if (hasSessions()) {
            event.stopPropagation();
            ctrl.toggleSidebarWorktree(wt().directory);
          }
        });
        _$setProp(_el$5, "selectable", false);
        _$setProp(_el$5, "wrapMode", "none");
        _$insert(_el$5, (() => {
          var _c$ = _$memo(() => !!hasSessions());
          return () => _c$() ? isExpanded() ? "▾" : "▸" : "·";
        })());
        _$insert(_el$3, _$createComponent(HoverMarqueeText, {
          renderer: getRenderer,
          get text() {
            return wt().label;
          },
          get active() {
            return isRowHovered();
          },
          get fg() {
            return _$memo(() => !!(wt().isCurrent || wt().status !== "idle" || isRowHovered()))() ? context.theme.text.base : context.theme.text.muted;
          },
          get attributes() {
            return _$memo(() => !!wt().isCurrent)() ? TextAttributes.BOLD : TextAttributes.NONE;
          },
          flexShrink: 1
        }), null);
        _$insertNode(_el$6, _el$7);
        _$setProp(_el$6, "flexDirection", "row");
        _$setProp(_el$6, "columnGap", 1);
        _$setProp(_el$6, "flexShrink", 0);
        _$insertNode(_el$7, _el$8);
        _$setProp(_el$7, "onMouseOver", () => plusHover.onEnter(wt().directory));
        _$setProp(_el$7, "onMouseOut", () => plusHover.onLeave(wt().directory));
        _$setProp(_el$7, "onMouseUp", event => {
          if (!isLeftClick(event) || !isRowHovered()) return;
          event.stopPropagation();
          const cur = wt();
          void ctrl.createSessionInDirectory(cur.directory, `Started session in ${cur.label}`, cur.projectID);
        });
        _$setProp(_el$8, "selectable", false);
        _$setProp(_el$8, "wrapMode", "none");
        _$insert(_el$8, () => isRowHovered() ? "+" : " ");
        _$insert(_el$6, _$createComponent(Show, {
          get when() {
            return workspaceStatusGlyph(wt().status);
          },
          children: badge => (() => {
            var _el$13 = _$createElement("text");
            _$setProp(_el$13, "selectable", false);
            _$setProp(_el$13, "wrapMode", "none");
            _$insert(_el$13, badge);
            _$effect(_p$ => {
              var _v$7 = resolveStatusColor(context.theme, wt().status, wt().isCurrent),
                _v$8 = TextAttributes.BOLD;
              _v$7 !== _p$.e && (_p$.e = _$setProp(_el$13, "fg", _v$7, _p$.e));
              _v$8 !== _p$.t && (_p$.t = _$setProp(_el$13, "attributes", _v$8, _p$.t));
              return _p$;
            }, {
              e: undefined,
              t: undefined
            });
            return _el$13;
          })()
        }), null);
        _$insert(_el$6, _$createComponent(Show, {
          get when() {
            return wt().dirtyCount > 0;
          },
          get children() {
            var _el$9 = _$createElement("text"),
              _el$0 = _$createTextNode(`~`);
            _$insertNode(_el$9, _el$0);
            _$setProp(_el$9, "selectable", false);
            _$setProp(_el$9, "wrapMode", "none");
            _$insert(_el$9, () => wt().dirtyCount, null);
            _$effect(_$p => _$setProp(_el$9, "fg", isRowHovered() ? context.theme.text.muted : context.theme.text.faint, _$p));
            return _el$9;
          }
        }), null);
        _$insert(_el$6, _$createComponent(Show, {
          get when() {
            return wt().ahead > 0;
          },
          get children() {
            var _el$1 = _$createElement("text"),
              _el$10 = _$createTextNode(`↑`);
            _$insertNode(_el$1, _el$10);
            _$setProp(_el$1, "selectable", false);
            _$setProp(_el$1, "wrapMode", "none");
            _$insert(_el$1, () => wt().ahead, null);
            _$effect(_$p => _$setProp(_el$1, "fg", isRowHovered() ? context.theme.text.muted : context.theme.text.faint, _$p));
            return _el$1;
          }
        }), null);
        _$insert(_el$6, _$createComponent(Show, {
          get when() {
            return wt().behind > 0;
          },
          get children() {
            var _el$11 = _$createElement("text"),
              _el$12 = _$createTextNode(`↓`);
            _$insertNode(_el$11, _el$12);
            _$setProp(_el$11, "selectable", false);
            _$setProp(_el$11, "wrapMode", "none");
            _$insert(_el$11, () => wt().behind, null);
            _$effect(_$p => _$setProp(_el$11, "fg", isRowHovered() ? context.theme.text.muted : context.theme.text.faint, _$p));
            return _el$11;
          }
        }), null);
        _$insert(_el$, _$createComponent(For, {
          get each() {
            return visibleSessionIDs();
          },
          children: (sessionID, sessIdx) => {
            const sessionAccessor = createMemo(() => visibleSessions().find(s => s.id === sessionID));
            const isLast = () => sessIdx() === visibleSessionIDs().length - 1;
            const isSessHovered = () => sessionHover.hoveredKey() === sessionID;
            const isDeleteHovered = () => sessionDeleteHover.hoveredKey() === sessionID;
            return _$createComponent(Show, {
              get when() {
                return sessionAccessor();
              },
              children: session => (() => {
                var _el$14 = _$createElement("box"),
                  _el$15 = _$createElement("box"),
                  _el$16 = _$createElement("text"),
                  _el$17 = _$createElement("text"),
                  _el$18 = _$createElement("box"),
                  _el$19 = _$createElement("box"),
                  _el$20 = _$createElement("text");
                _$insertNode(_el$14, _el$15);
                _$insertNode(_el$14, _el$18);
                _$setProp(_el$14, "flexDirection", "row");
                _$setProp(_el$14, "justifyContent", "space-between");
                _$setProp(_el$14, "alignItems", "center");
                _$setProp(_el$14, "width", "100%");
                _$setProp(_el$14, "paddingLeft", indented ? 4 : 2);
                _$setProp(_el$14, "onMouseOver", () => sessionHover.onEnter(session().id));
                _$setProp(_el$14, "onMouseOut", () => sessionHover.onLeave(session().id));
                _$setProp(_el$14, "onMouseUp", event => {
                  if (isRightClick(event)) {
                    event.stopPropagation();
                    void ctrl.openSessionContextMenu(session(), wt().directory, wt().projectID);
                    return;
                  }
                  if (!isLeftClick(event)) return;
                  ctrl.activateSession(session().id, wt().directory, wt().projectID);
                });
                _$insertNode(_el$15, _el$16);
                _$insertNode(_el$15, _el$17);
                _$setProp(_el$15, "flexDirection", "row");
                _$setProp(_el$15, "columnGap", 1);
                _$setProp(_el$15, "flexGrow", 1);
                _$setProp(_el$15, "flexShrink", 1);
                _$setProp(_el$15, "overflow", "hidden");
                _$setProp(_el$16, "selectable", false);
                _$setProp(_el$16, "wrapMode", "none");
                _$insert(_el$16, () => isLast() ? "└─" : "├─");
                _$setProp(_el$17, "selectable", false);
                _$setProp(_el$17, "wrapMode", "none");
                _$insert(_el$17, () => statusGlyph(session().status, session().isCurrent));
                _$insert(_el$15, _$createComponent(HoverMarqueeText, {
                  renderer: getRenderer,
                  get text() {
                    return session().title;
                  },
                  get active() {
                    return isSessHovered();
                  },
                  get fg() {
                    return _$memo(() => !!(session().isCurrent || session().status !== "idle" || isSessHovered()))() ? context.theme.text.base : context.theme.text.muted;
                  },
                  get attributes() {
                    return _$memo(() => !!session().isCurrent)() ? TextAttributes.BOLD : TextAttributes.NONE;
                  },
                  flexShrink: 1
                }), null);
                _$insertNode(_el$18, _el$19);
                _$setProp(_el$18, "flexDirection", "row");
                _$setProp(_el$18, "columnGap", 1);
                _$setProp(_el$18, "flexShrink", 0);
                _$insertNode(_el$19, _el$20);
                _$setProp(_el$19, "onMouseOver", () => sessionDeleteHover.onEnter(session().id));
                _$setProp(_el$19, "onMouseOut", () => sessionDeleteHover.onLeave(session().id));
                _$setProp(_el$19, "onMouseUp", event => {
                  if (!isLeftClick(event) || !isSessHovered()) {
                    return;
                  }
                  event.stopPropagation();
                  void ctrl.removeSessionFlow(session());
                });
                _$setProp(_el$20, "selectable", false);
                _$setProp(_el$20, "wrapMode", "none");
                _$insert(_el$20, () => isSessHovered() ? "×" : " ");
                _$effect(_p$ => {
                  var _v$9 = isSessHovered() ? hoverBg() : undefined,
                    _v$0 = isSessHovered() ? context.theme.text.muted : context.theme.text.faint,
                    _v$1 = isSessHovered() && !session().isCurrent && session().status === "idle" ? context.theme.text.muted : resolveStatusColor(context.theme, session().status, session().isCurrent),
                    _v$10 = session().status !== "idle" || session().isCurrent ? TextAttributes.BOLD : TextAttributes.NONE,
                    _v$11 = isSessHovered() && isDeleteHovered() ? accentHoverBg() : undefined,
                    _v$12 = isDeleteHovered() ? context.theme.text.feedback.error.base : context.theme.text.muted,
                    _v$13 = isDeleteHovered() ? TextAttributes.BOLD : TextAttributes.NONE;
                  _v$9 !== _p$.e && (_p$.e = _$setProp(_el$14, "backgroundColor", _v$9, _p$.e));
                  _v$0 !== _p$.t && (_p$.t = _$setProp(_el$16, "fg", _v$0, _p$.t));
                  _v$1 !== _p$.a && (_p$.a = _$setProp(_el$17, "fg", _v$1, _p$.a));
                  _v$10 !== _p$.o && (_p$.o = _$setProp(_el$17, "attributes", _v$10, _p$.o));
                  _v$11 !== _p$.i && (_p$.i = _$setProp(_el$19, "backgroundColor", _v$11, _p$.i));
                  _v$12 !== _p$.n && (_p$.n = _$setProp(_el$20, "fg", _v$12, _p$.n));
                  _v$13 !== _p$.s && (_p$.s = _$setProp(_el$20, "attributes", _v$13, _p$.s));
                  return _p$;
                }, {
                  e: undefined,
                  t: undefined,
                  a: undefined,
                  o: undefined,
                  i: undefined,
                  n: undefined,
                  s: undefined
                });
                return _el$14;
              })()
            });
          }
        }), null);
        _$effect(_p$ => {
          var _v$ = isRowHovered() ? hoverBg() : undefined,
            _v$2 = hasSessions() && isChevronHovered() && !wt().isCurrent ? context.theme.text.base : wt().isCurrent ? context.theme.text.action.primary.selected : isRowHovered() ? context.theme.text.muted : context.theme.text.faint,
            _v$3 = wt().isCurrent || hasSessions() && isChevronHovered() ? TextAttributes.BOLD : TextAttributes.NONE,
            _v$4 = isRowHovered() && isPlusHovered() ? accentHoverBg() : undefined,
            _v$5 = context.theme.text.action.primary.selected,
            _v$6 = isPlusHovered() ? TextAttributes.BOLD : TextAttributes.NONE;
          _v$ !== _p$.e && (_p$.e = _$setProp(_el$2, "backgroundColor", _v$, _p$.e));
          _v$2 !== _p$.t && (_p$.t = _$setProp(_el$5, "fg", _v$2, _p$.t));
          _v$3 !== _p$.a && (_p$.a = _$setProp(_el$5, "attributes", _v$3, _p$.a));
          _v$4 !== _p$.o && (_p$.o = _$setProp(_el$7, "backgroundColor", _v$4, _p$.o));
          _v$5 !== _p$.i && (_p$.i = _$setProp(_el$8, "fg", _v$5, _p$.i));
          _v$6 !== _p$.n && (_p$.n = _$setProp(_el$8, "attributes", _v$6, _p$.n));
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined,
          o: undefined,
          i: undefined,
          n: undefined
        });
        return _el$;
      })();
    }
  });
}

/**
 * Native-styled right sidebar section anchored in the LOWER HALF of the right sidebar
 * (above `sidebar.footer`), separated from OpenCode's upper session info by a top divider.
 * Strictly scoped to the current session's Git repository so unrelated repos never clutter the sidebar.
 */
export const WorkspacesSidebar = props => {
  const {
    ctrl
  } = props;
  const {
    context
  } = ctrl;
  const getRenderer = () => context.renderer;
  const headerHover = createHoverFlagSignal();
  const headerHovered = headerHover.hovered;
  const worktreeHover = createHoverKeySignal();
  const chevronHover = createHoverKeySignal();
  const plusHover = createHoverKeySignal();
  const subSessionHover = createHoverKeySignal();
  const subSessionDeleteHover = createHoverKeySignal();
  const newSessionHover = createHoverFlagSignal();
  const newSessionHovered = newSessionHover.hovered;
  const hoverBg = () => resolveSidebarHoverBg(context.theme);
  createEffect(() => {
    ctrl.syncSessionWorkspace(props.sessionID);
  });
  const tree = createMemo(() => ctrl.buildSnapshot({
    explicitSessionID: props.sessionID,
    includeSessionRows: false,
    currentProjectOnly: true
  }));
  const currentProject = createMemo(() => tree().projects[0]);
  const resolveTargetWorktree = proj => {
    const activeWt = proj.worktrees.find(wt => wt.isCurrent);
    if (activeWt) return activeWt;
    const activeDir = ctrl.resolveActiveDirectory(props.sessionID);
    if (activeDir) {
      const matched = proj.worktrees.find(wt => wt.directory === activeDir);
      if (matched) return matched;
    }
    return undefined;
  };
  const resolveNewSessionSubtitle = proj => {
    const targetWt = resolveTargetWorktree(proj);
    if (targetWt?.label) return targetWt.label;
    const activeDir = ctrl.resolveActiveDirectory(props.sessionID);
    if (activeDir) {
      return dirBasename(activeDir) || proj.worktrees[0]?.label;
    }
    return proj.worktrees[0]?.label;
  };
  const lowerHalfHeight = createMemo(() => Math.max(10, Math.ceil((ctrl.terminalHeight() - 3) / 2)));
  const sidebarTreeHeight = createMemo(() => {
    const proj = currentProject();
    if (!proj) return 1;
    const contentRows = proj.worktrees.reduce((sum, wt) => {
      if (wt.sessions.length > 0 && ctrl.isSidebarWorktreeExpanded(wt.directory)) {
        return sum + 1 + wt.sessions.length;
      }
      const activeBg = wt.sessions.filter(s => !s.isCurrent && s.status !== "idle").length;
      return sum + 1 + Math.min(3, activeBg);
    }, 0);
    const newSessionRows = resolveNewSessionSubtitle(proj) ? 2 : 1;
    // Top border (1) + paddingTop (1) + header (1) + marginTop (1) + newSessionRows (1..2) + paddingBottom (1)
    const chromeRows = 5 + newSessionRows;
    const maxRows = Math.max(2, lowerHalfHeight() - chromeRows);
    return Math.max(1, Math.min(contentRows, maxRows));
  });
  const spawnSessionInCurrentWorktree = proj => {
    const currentWt = resolveTargetWorktree(proj);
    const dir = resolveWorkspaceNewSessionDirectory({
      currentWorktreeDirectory: currentWt?.directory,
      activeSessionDirectory: ctrl.resolveActiveDirectory(props.sessionID),
      launchDirectory: proj.canonical
    });
    if (!dir) return;
    void ctrl.createSessionInDirectory(dir, `Started session in ${currentWt?.label ?? dirBasename(dir)}`, proj.id);
  };
  return _$createComponent(Show, {
    get when() {
      return currentProject();
    },
    children: proj => {
      const worktreeDirs = createMemo(() => proj().worktrees.map(w => w.directory), [], {
        equals: sameStringArray
      });
      return (() => {
        var _el$21 = _$createElement("box"),
          _el$22 = _$createElement("box"),
          _el$23 = _$createElement("text"),
          _el$26 = _$createElement("scrollbox"),
          _el$27 = _$createElement("box"),
          _el$28 = _$createElement("box"),
          _el$29 = _$createElement("text");
        _$insertNode(_el$21, _el$22);
        _$insertNode(_el$21, _el$26);
        _$insertNode(_el$21, _el$28);
        _$setProp(_el$21, "flexDirection", "column");
        _$setProp(_el$21, "width", "100%");
        _$setProp(_el$21, "flexShrink", 0);
        _$setProp(_el$21, "border", ["top"]);
        _$setProp(_el$21, "shouldFill", false);
        _$setProp(_el$21, "paddingTop", 1);
        _$setProp(_el$21, "paddingBottom", 1);
        _$insertNode(_el$22, _el$23);
        _$setProp(_el$22, "flexDirection", "row");
        _$setProp(_el$22, "justifyContent", "space-between");
        _$setProp(_el$22, "alignItems", "center");
        _$setProp(_el$22, "width", "100%");
        _$setProp(_el$22, "flexShrink", 0);
        _$setProp(_el$22, "onMouseOver", () => headerHover.onEnter());
        _$setProp(_el$22, "onMouseOut", () => headerHover.onLeave());
        _$setProp(_el$22, "onMouseUp", event => {
          if (!isLeftClick(event)) return;
          props.onTogglePanel();
        });
        _$insertNode(_el$23, _$createTextNode(`Worktrees`));
        _$setProp(_el$23, "selectable", false);
        _$setProp(_el$23, "wrapMode", "none");
        _$insert(_el$22, _$createComponent(Show, {
          get when() {
            return proj().worktrees.length > 1;
          },
          get children() {
            var _el$25 = _$createElement("text");
            _$setProp(_el$25, "selectable", false);
            _$setProp(_el$25, "wrapMode", "none");
            _$insert(_el$25, () => proj().worktrees.length);
            _$effect(_$p => _$setProp(_el$25, "fg", headerHovered() ? context.theme.text.muted : context.theme.text.faint, _$p));
            return _el$25;
          }
        }), null);
        _$insertNode(_el$26, _el$27);
        _$setProp(_el$26, "flexGrow", 0);
        _$setProp(_el$26, "flexShrink", 0);
        _$setProp(_el$26, "width", "100%");
        _$setProp(_el$27, "flexDirection", "column");
        _$setProp(_el$27, "width", "100%");
        _$insert(_el$27, _$createComponent(For, {
          get each() {
            return worktreeDirs();
          },
          children: dir => renderSidebarWorktreeRow(ctrl, createMemo(() => proj().worktrees.find(w => w.directory === dir)), false, worktreeHover, chevronHover, plusHover, subSessionHover, subSessionDeleteHover)
        }));
        _$insertNode(_el$28, _el$29);
        _$setProp(_el$28, "flexDirection", "column");
        _$setProp(_el$28, "width", "100%");
        _$setProp(_el$28, "marginTop", 1);
        _$setProp(_el$28, "flexShrink", 0);
        _$setProp(_el$28, "onMouseOver", () => newSessionHover.onEnter());
        _$setProp(_el$28, "onMouseOut", () => newSessionHover.onLeave());
        _$setProp(_el$28, "onMouseUp", event => {
          if (!isLeftClick(event)) return;
          event.stopPropagation();
          spawnSessionInCurrentWorktree(proj());
        });
        _$insertNode(_el$29, _$createTextNode(`+ New session`));
        _$setProp(_el$29, "selectable", false);
        _$setProp(_el$29, "wrapMode", "none");
        _$insert(_el$28, _$createComponent(Show, {
          get when() {
            return resolveNewSessionSubtitle(proj());
          },
          children: branch => (() => {
            var _el$31 = _$createElement("box");
            _$setProp(_el$31, "flexDirection", "row");
            _$setProp(_el$31, "width", "100%");
            _$setProp(_el$31, "paddingLeft", 2);
            _$setProp(_el$31, "overflow", "hidden");
            _$setProp(_el$31, "shouldFill", false);
            _$insert(_el$31, _$createComponent(HoverMarqueeText, {
              renderer: getRenderer,
              get text() {
                return branch();
              },
              get active() {
                return newSessionHovered();
              },
              get fg() {
                return _$memo(() => !!newSessionHovered())() ? context.theme.text.base : context.theme.text.muted;
              },
              flexShrink: 1
            }));
            return _el$31;
          })()
        }), null);
        _$effect(_p$ => {
          var _v$14 = lowerHalfHeight(),
            _v$15 = context.theme.border.base,
            _v$16 = headerHovered() ? hoverBg() : undefined,
            _v$17 = headerHovered() ? context.theme.text.action.primary.selected : context.theme.text.base,
            _v$18 = TextAttributes.BOLD,
            _v$19 = sidebarTreeHeight(),
            _v$20 = newSessionHovered() ? hoverBg() : undefined,
            _v$21 = newSessionHovered() ? context.theme.text.action.primary.selected : context.theme.text.base,
            _v$22 = TextAttributes.BOLD;
          _v$14 !== _p$.e && (_p$.e = _$setProp(_el$21, "height", _v$14, _p$.e));
          _v$15 !== _p$.t && (_p$.t = _$setProp(_el$21, "borderColor", _v$15, _p$.t));
          _v$16 !== _p$.a && (_p$.a = _$setProp(_el$22, "backgroundColor", _v$16, _p$.a));
          _v$17 !== _p$.o && (_p$.o = _$setProp(_el$23, "fg", _v$17, _p$.o));
          _v$18 !== _p$.i && (_p$.i = _$setProp(_el$23, "attributes", _v$18, _p$.i));
          _v$19 !== _p$.n && (_p$.n = _$setProp(_el$26, "height", _v$19, _p$.n));
          _v$20 !== _p$.s && (_p$.s = _$setProp(_el$28, "backgroundColor", _v$20, _p$.s));
          _v$21 !== _p$.h && (_p$.h = _$setProp(_el$29, "fg", _v$21, _p$.h));
          _v$22 !== _p$.r && (_p$.r = _$setProp(_el$29, "attributes", _v$22, _p$.r));
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined,
          o: undefined,
          i: undefined,
          n: undefined,
          s: undefined,
          h: undefined,
          r: undefined
        });
        return _el$21;
      })();
    }
  });
};

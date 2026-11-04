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
import { dirBasename, resolveWorkspaceNewSessionDirectory, rollupHiddenWorktreeStatus } from "../model.js";
import { createHoverFlagSignal, createHoverKeySignal } from "./hover.js";
import { HoverMarqueeText } from "./marquee.js";
import { resolveSidebarAccentHoverBg, resolveSidebarHoverBg, resolveStatusColor, sameStringArray, statusGlyph, statusLabel } from "./types.js";
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
      const hiddenRollup = createMemo(() => rollupHiddenWorktreeStatus(wt(), visibleSessions()));
      const rowStatus = () => hiddenRollup().status;
      const rowStatusDetail = () => hiddenRollup().detail;
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
          return () => _c$() ? isExpanded() ? "▾" : "▸" : statusGlyph(rowStatus(), false);
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
            return _$memo(() => !!(wt().isCurrent || rowStatus() !== "idle" || isRowHovered()))() ? context.theme.text.base : context.theme.text.muted;
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
            return statusLabel(rowStatus(), rowStatusDetail());
          },
          children: badge => (() => {
            var _el$13 = _$createElement("text");
            _$setProp(_el$13, "selectable", false);
            _$setProp(_el$13, "wrapMode", "none");
            _$insert(_el$13, badge);
            _$effect(_$p => _$setProp(_el$13, "fg", resolveStatusColor(context.theme, rowStatus(), wt().isCurrent), _$p));
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
                _$insert(_el$18, _$createComponent(Show, {
                  get when() {
                    return statusLabel(session().status, session().statusDetail);
                  },
                  children: badge => (() => {
                    var _el$21 = _$createElement("text");
                    _$setProp(_el$21, "selectable", false);
                    _$setProp(_el$21, "wrapMode", "none");
                    _$setProp(_el$21, "flexShrink", 0);
                    _$insert(_el$21, badge);
                    _$effect(_$p => _$setProp(_el$21, "fg", resolveStatusColor(context.theme, session().status, session().isCurrent), _$p));
                    return _el$21;
                  })()
                }), null);
                _$effect(_p$ => {
                  var _v$7 = isSessHovered() ? hoverBg() : undefined,
                    _v$8 = isSessHovered() ? context.theme.text.muted : context.theme.text.faint,
                    _v$9 = isSessHovered() && !session().isCurrent && session().status === "idle" ? context.theme.text.muted : resolveStatusColor(context.theme, session().status, session().isCurrent),
                    _v$0 = session().status !== "idle" || session().isCurrent ? TextAttributes.BOLD : TextAttributes.NONE,
                    _v$1 = isSessHovered() && isDeleteHovered() ? accentHoverBg() : undefined,
                    _v$10 = isDeleteHovered() ? context.theme.text.feedback.error.base : context.theme.text.muted,
                    _v$11 = isDeleteHovered() ? TextAttributes.BOLD : TextAttributes.NONE;
                  _v$7 !== _p$.e && (_p$.e = _$setProp(_el$14, "backgroundColor", _v$7, _p$.e));
                  _v$8 !== _p$.t && (_p$.t = _$setProp(_el$16, "fg", _v$8, _p$.t));
                  _v$9 !== _p$.a && (_p$.a = _$setProp(_el$17, "fg", _v$9, _p$.a));
                  _v$0 !== _p$.o && (_p$.o = _$setProp(_el$17, "attributes", _v$0, _p$.o));
                  _v$1 !== _p$.i && (_p$.i = _$setProp(_el$19, "backgroundColor", _v$1, _p$.i));
                  _v$10 !== _p$.n && (_p$.n = _$setProp(_el$20, "fg", _v$10, _p$.n));
                  _v$11 !== _p$.s && (_p$.s = _$setProp(_el$20, "attributes", _v$11, _p$.s));
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
            _v$2 = hasSessions() && isChevronHovered() && !wt().isCurrent && rowStatus() === "idle" ? context.theme.text.base : isRowHovered() && !wt().isCurrent && rowStatus() === "idle" ? context.theme.text.muted : resolveStatusColor(context.theme, rowStatus(), wt().isCurrent),
            _v$3 = rowStatus() !== "idle" || wt().isCurrent || hasSessions() && isChevronHovered() ? TextAttributes.BOLD : TextAttributes.NONE,
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
        var _el$22 = _$createElement("box"),
          _el$23 = _$createElement("box"),
          _el$24 = _$createElement("text"),
          _el$27 = _$createElement("scrollbox"),
          _el$28 = _$createElement("box"),
          _el$29 = _$createElement("box"),
          _el$30 = _$createElement("text");
        _$insertNode(_el$22, _el$23);
        _$insertNode(_el$22, _el$27);
        _$insertNode(_el$22, _el$29);
        _$setProp(_el$22, "flexDirection", "column");
        _$setProp(_el$22, "width", "100%");
        _$setProp(_el$22, "flexShrink", 0);
        _$setProp(_el$22, "border", ["top"]);
        _$setProp(_el$22, "shouldFill", false);
        _$setProp(_el$22, "paddingTop", 1);
        _$setProp(_el$22, "paddingBottom", 1);
        _$insertNode(_el$23, _el$24);
        _$setProp(_el$23, "flexDirection", "row");
        _$setProp(_el$23, "justifyContent", "space-between");
        _$setProp(_el$23, "alignItems", "center");
        _$setProp(_el$23, "width", "100%");
        _$setProp(_el$23, "flexShrink", 0);
        _$setProp(_el$23, "onMouseOver", () => headerHover.onEnter());
        _$setProp(_el$23, "onMouseOut", () => headerHover.onLeave());
        _$setProp(_el$23, "onMouseUp", event => {
          if (!isLeftClick(event)) return;
          props.onTogglePanel();
        });
        _$insertNode(_el$24, _$createTextNode(`Worktrees`));
        _$setProp(_el$24, "selectable", false);
        _$setProp(_el$24, "wrapMode", "none");
        _$insert(_el$23, _$createComponent(Show, {
          get when() {
            return proj().worktrees.length > 1;
          },
          get children() {
            var _el$26 = _$createElement("text");
            _$setProp(_el$26, "selectable", false);
            _$setProp(_el$26, "wrapMode", "none");
            _$insert(_el$26, () => proj().worktrees.length);
            _$effect(_$p => _$setProp(_el$26, "fg", headerHovered() ? context.theme.text.muted : context.theme.text.faint, _$p));
            return _el$26;
          }
        }), null);
        _$insertNode(_el$27, _el$28);
        _$setProp(_el$27, "flexGrow", 0);
        _$setProp(_el$27, "flexShrink", 0);
        _$setProp(_el$27, "width", "100%");
        _$setProp(_el$28, "flexDirection", "column");
        _$setProp(_el$28, "width", "100%");
        _$insert(_el$28, _$createComponent(For, {
          get each() {
            return worktreeDirs();
          },
          children: dir => renderSidebarWorktreeRow(ctrl, createMemo(() => proj().worktrees.find(w => w.directory === dir)), false, worktreeHover, chevronHover, plusHover, subSessionHover, subSessionDeleteHover)
        }));
        _$insertNode(_el$29, _el$30);
        _$setProp(_el$29, "flexDirection", "column");
        _$setProp(_el$29, "width", "100%");
        _$setProp(_el$29, "marginTop", 1);
        _$setProp(_el$29, "flexShrink", 0);
        _$setProp(_el$29, "onMouseOver", () => newSessionHover.onEnter());
        _$setProp(_el$29, "onMouseOut", () => newSessionHover.onLeave());
        _$setProp(_el$29, "onMouseUp", event => {
          if (!isLeftClick(event)) return;
          event.stopPropagation();
          spawnSessionInCurrentWorktree(proj());
        });
        _$insertNode(_el$30, _$createTextNode(`+ New session`));
        _$setProp(_el$30, "selectable", false);
        _$setProp(_el$30, "wrapMode", "none");
        _$insert(_el$29, _$createComponent(Show, {
          get when() {
            return resolveNewSessionSubtitle(proj());
          },
          children: branch => (() => {
            var _el$32 = _$createElement("box");
            _$setProp(_el$32, "flexDirection", "row");
            _$setProp(_el$32, "width", "100%");
            _$setProp(_el$32, "paddingLeft", 2);
            _$setProp(_el$32, "overflow", "hidden");
            _$setProp(_el$32, "shouldFill", false);
            _$insert(_el$32, _$createComponent(HoverMarqueeText, {
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
            return _el$32;
          })()
        }), null);
        _$effect(_p$ => {
          var _v$12 = lowerHalfHeight(),
            _v$13 = context.theme.border.base,
            _v$14 = headerHovered() ? hoverBg() : undefined,
            _v$15 = headerHovered() ? context.theme.text.action.primary.selected : context.theme.text.base,
            _v$16 = TextAttributes.BOLD,
            _v$17 = sidebarTreeHeight(),
            _v$18 = newSessionHovered() ? hoverBg() : undefined,
            _v$19 = newSessionHovered() ? context.theme.text.action.primary.selected : context.theme.text.base,
            _v$20 = TextAttributes.BOLD;
          _v$12 !== _p$.e && (_p$.e = _$setProp(_el$22, "height", _v$12, _p$.e));
          _v$13 !== _p$.t && (_p$.t = _$setProp(_el$22, "borderColor", _v$13, _p$.t));
          _v$14 !== _p$.a && (_p$.a = _$setProp(_el$23, "backgroundColor", _v$14, _p$.a));
          _v$15 !== _p$.o && (_p$.o = _$setProp(_el$24, "fg", _v$15, _p$.o));
          _v$16 !== _p$.i && (_p$.i = _$setProp(_el$24, "attributes", _v$16, _p$.i));
          _v$17 !== _p$.n && (_p$.n = _$setProp(_el$27, "height", _v$17, _p$.n));
          _v$18 !== _p$.s && (_p$.s = _$setProp(_el$29, "backgroundColor", _v$18, _p$.s));
          _v$19 !== _p$.h && (_p$.h = _$setProp(_el$30, "fg", _v$19, _p$.h));
          _v$20 !== _p$.r && (_p$.r = _$setProp(_el$30, "attributes", _v$20, _p$.r));
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
        return _el$22;
      })();
    }
  });
};

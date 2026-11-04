import { effect as _$effect } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { use as _$use } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
/** @jsxImportSource @opentui/solid */
import { MouseButton, TextAttributes } from "@opentui/core";
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { dirBasename } from "../model.js";
import { createHoverFlagSignal, createHoverKeySignal } from "./hover.js";
import { HoverMarqueeText } from "./marquee.js";
import { resolvePanelRowBg, resolveSidebarAccentHoverBg, resolveSidebarHoverBg, resolveStatusColor, sameStringArray, statusGlyph, workspaceStatusGlyph, worktreeGlyph } from "./types.js";
function isLeftClick(event) {
  return event.button === undefined || event.button === MouseButton.LEFT;
}
function isRightClick(event) {
  return event.button === MouseButton.RIGHT;
}
export const WorkspacesPanel = props => {
  const {
    ctrl
  } = props;
  const {
    context
  } = ctrl;
  const getRenderer = () => context.renderer;
  let containerRef;
  let panelScrollRef;
  const panelRowRefs = new Map();
  const tree = createMemo(() => ctrl.buildSnapshot({
    explicitSessionID: props.panel.sessionID,
    includeSessionRows: true,
    currentProjectOnly: !ctrl.prefs.showAllGitProjects,
    onlyRelevantProjects: false
  }));
  const rowKeys = createMemo(() => tree().rows.map(r => r.key), [], {
    equals: sameStringArray
  });
  const [selectedKey, setSelectedKey] = createSignal("");
  const panelRowHover = createHoverKeySignal();
  const hoveredPanelKey = panelRowHover.hoveredKey;
  const panelSessionDeleteHover = createHoverKeySignal();
  const footerPathHover = createHoverFlagSignal();
  const hoveredFooterPath = footerPathHover.hovered;
  const panelNewSessionHover = createHoverFlagSignal();
  const panelNewSessionHovered = panelNewSessionHover.hovered;
  let panelUserMoved = false;
  createEffect(() => {
    ctrl.syncSessionWorkspace(props.panel.sessionID);
  });
  const scrollPanelRowIntoView = key => {
    const el = panelRowRefs.get(key);
    if (el && !el.isDestroyed && panelScrollRef && !panelScrollRef.isDestroyed) {
      panelScrollRef.scrollChildIntoView(el, {
        align: "nearest",
        inset: 1
      });
    }
  };
  createEffect(() => {
    const rows = tree().rows;
    if (rows.length === 0) return;
    const activeRow = rows.find(r => r.kind === "session" && r.session.isCurrent) ?? rows.find(r => r.kind === "worktree" && r.worktree.isCurrent) ?? rows.find(r => r.kind === "project" && r.project.isCurrent);
    if (!panelUserMoved && activeRow) {
      if (selectedKey() !== activeRow.key) {
        setSelectedKey(activeRow.key);
        queueMicrotask(() => scrollPanelRowIntoView(activeRow.key));
      }
      return;
    }
    const currentKey = selectedKey();
    if (currentKey && rows.some(r => r.key === currentKey)) return;
    const fallbackRow = activeRow ?? rows[0];
    if (fallbackRow) {
      setSelectedKey(fallbackRow.key);
      queueMicrotask(() => scrollPanelRowIntoView(fallbackRow.key));
    }
  });
  createEffect(() => {
    if (props.panel.focused && containerRef) {
      containerRef.focus();
    }
  });
  const selectedRow = createMemo(() => {
    const rows = tree().rows;
    const key = selectedKey();
    return rows.find(r => r.key === key) ?? rows[0];
  });
  const resolveRowDirectory = row => {
    if (!row) return ctrl.resolveActiveDirectory(props.panel.sessionID);
    return row.kind === "project" ? row.project.canonical : row.worktree.directory;
  };
  const selectedPath = createMemo(() => {
    const row = selectedRow();
    if (!row) return undefined;
    const dir = row.kind === "project" ? row.project.canonical : row.worktree.directory;
    return context.ui.format.path(dir);
  });
  const moveCursor = delta => {
    const rows = tree().rows;
    if (rows.length === 0) return;
    panelUserMoved = true;
    const key = selectedKey();
    const idx = rows.findIndex(r => r.key === key);
    const start = idx === -1 ? 0 : idx;
    const nextIdx = Math.max(0, Math.min(rows.length - 1, start + delta));
    const target = rows[nextIdx];
    if (target) {
      setSelectedKey(target.key);
      scrollPanelRowIntoView(target.key);
    }
  };
  const activateRow = row => {
    if (!row) return;
    if (row.kind === "project") {
      ctrl.toggleCollapseProject(row.project.id);
      return;
    }
    if (row.kind === "worktree") {
      void ctrl.openWorktree(row.worktree.directory, row.worktree.primarySessionID, row.project.id);
      return;
    }
    ctrl.activateSession(row.session.id, row.worktree.directory, row.project.id);
  };
  const handleKeyDown = event => {
    if (!props.panel.focused) return;
    const rows = tree().rows;
    const row = selectedRow();
    if (!event.ctrl && !event.meta && /^[1-9]$/.test(event.name)) {
      event.preventDefault();
      event.stopPropagation();
      void ctrl.jumpToQuickSlot(Number.parseInt(event.name, 10));
      return;
    }
    switch (event.name) {
      case "j":
      case "down":
        event.preventDefault();
        event.stopPropagation();
        moveCursor(1);
        return;
      case "k":
      case "up":
        event.preventDefault();
        event.stopPropagation();
        moveCursor(-1);
        return;
      case "g":
        if (!event.ctrl) {
          event.preventDefault();
          event.stopPropagation();
          const target = event.shift ? rows[rows.length - 1] : rows[0];
          if (target) {
            setSelectedKey(target.key);
            scrollPanelRowIntoView(target.key);
          }
        }
        return;
      case "home":
        {
          event.preventDefault();
          event.stopPropagation();
          const first = rows[0];
          if (first) {
            setSelectedKey(first.key);
            scrollPanelRowIntoView(first.key);
          }
          return;
        }
      case "end":
        {
          event.preventDefault();
          event.stopPropagation();
          const last = rows[rows.length - 1];
          if (last) {
            setSelectedKey(last.key);
            scrollPanelRowIntoView(last.key);
          }
          return;
        }
      case "return":
      case "enter":
        event.preventDefault();
        event.stopPropagation();
        activateRow(row);
        return;
      case "space":
        event.preventDefault();
        event.stopPropagation();
        if (row) ctrl.toggleCollapseProject(row.project.id);
        return;
      case "h":
      case "left":
        event.preventDefault();
        event.stopPropagation();
        if (row && !row.project.collapsed) {
          ctrl.toggleCollapseProject(row.project.id);
          setSelectedKey(`project:${row.project.id}`);
        }
        return;
      case "l":
      case "right":
        event.preventDefault();
        event.stopPropagation();
        if (row?.kind === "project" && row.project.collapsed) {
          ctrl.toggleCollapseProject(row.project.id);
        } else {
          activateRow(row);
        }
        return;
      case "o":
        event.preventDefault();
        event.stopPropagation();
        void ctrl.openWorktreeInEditor(resolveRowDirectory(row));
        return;
      case "n":
        event.preventDefault();
        event.stopPropagation();
        if (row) {
          void ctrl.createWorktreeFlow({
            id: row.project.id,
            name: row.project.name,
            canonical: row.project.canonical
          });
        } else {
          const proj = ctrl.findCurrentProject();
          if (proj) void ctrl.createWorktreeFlow(proj);
        }
        return;
      case "s":
        event.preventDefault();
        event.stopPropagation();
        if (row) {
          const dir = resolveRowDirectory(row);
          if (dir) {
            void ctrl.createSessionInDirectory(dir, `Started session in ${dirBasename(dir)}`, row.project.id);
          }
        }
        return;
      case "m":
        event.preventDefault();
        event.stopPropagation();
        if (row) {
          const dir = resolveRowDirectory(row);
          if (dir) {
            void ctrl.moveCurrentSessionToDirectory(dir, props.panel.sessionID, row.project.id);
          }
        }
        return;
      case "p":
        event.preventDefault();
        event.stopPropagation();
        if (row) {
          void ctrl.togglePinProject({
            id: row.project.id,
            name: row.project.name,
            canonical: row.project.canonical
          });
        }
        return;
      case "x":
      case "d":
        event.preventDefault();
        event.stopPropagation();
        if (row?.kind === "session") {
          void ctrl.removeSessionFlow(row.session);
        } else if (row?.kind === "worktree") {
          void ctrl.removeWorktreeFlow(row.project, row.worktree);
        }
        return;
      case "a":
      case "i":
        event.preventDefault();
        event.stopPropagation();
        void ctrl.toggleShowAllGitProjects();
        return;
      case "r":
        event.preventDefault();
        event.stopPropagation();
        void ctrl.refreshWorkspacesData({
          forceWorktreeRefresh: true
        });
        context.ui.toast.show({
          message: "Refreshed Git worktrees",
          variant: "info",
          duration: 1200
        });
        return;
      case "f":
        event.preventDefault();
        event.stopPropagation();
        props.panel.toggleFullscreen();
        return;
      case "q":
      case "escape":
        event.preventDefault();
        event.stopPropagation();
        props.panel.close();
        return;
    }
  };
  const renderPanelRowByKey = (rowKey, rowIndex) => {
    const rowAccessor = createMemo(() => tree().rows.find(r => r.key === rowKey));
    const isSelected = () => selectedRow()?.key === rowKey;
    const isRowHovered = () => hoveredPanelKey() === rowKey;
    const isRowActive = () => isSelected() || isRowHovered();
    const rowBg = () => resolvePanelRowBg(context.theme, {
      selected: isSelected(),
      hovered: isRowHovered()
    });
    if (rowKey.startsWith("project:")) {
      const projRow = createMemo(() => {
        const cur = rowAccessor();
        return cur?.kind === "project" ? cur : undefined;
      });
      return _$createComponent(Show, {
        get when() {
          return projRow();
        },
        children: row => {
          const p = () => row().project;
          return (() => {
            var _el$ = _$createElement("box"),
              _el$2 = _$createElement("box"),
              _el$3 = _$createElement("text"),
              _el$6 = _$createElement("text"),
              _el$7 = _$createTextNode(` wt`);
            _$insertNode(_el$, _el$2);
            _$insertNode(_el$, _el$6);
            _$use(el => {
              if (el) panelRowRefs.set(rowKey, el);else panelRowRefs.delete(rowKey);
            }, _el$);
            _$setProp(_el$, "flexDirection", "row");
            _$setProp(_el$, "justifyContent", "space-between");
            _$setProp(_el$, "alignItems", "center");
            _$setProp(_el$, "width", "100%");
            _$setProp(_el$, "paddingX", 1);
            _$setProp(_el$, "onMouseOver", () => panelRowHover.onEnter(rowKey));
            _$setProp(_el$, "onMouseOut", () => panelRowHover.onLeave(rowKey));
            _$setProp(_el$, "onMouseUp", () => {
              panelUserMoved = true;
              setSelectedKey(rowKey);
              ctrl.toggleCollapseProject(p().id);
            });
            _$insertNode(_el$2, _el$3);
            _$setProp(_el$2, "flexDirection", "row");
            _$setProp(_el$2, "columnGap", 1);
            _$setProp(_el$2, "flexGrow", 1);
            _$setProp(_el$2, "flexShrink", 1);
            _$setProp(_el$2, "overflow", "hidden");
            _$setProp(_el$3, "selectable", false);
            _$setProp(_el$3, "wrapMode", "none");
            _$insert(_el$3, () => p().collapsed ? "▸" : "▾");
            _$insert(_el$2, _$createComponent(Show, {
              get when() {
                return p().pinned;
              },
              get children() {
                var _el$4 = _$createElement("text");
                _$insertNode(_el$4, _$createTextNode(`★`));
                _$setProp(_el$4, "selectable", false);
                _$setProp(_el$4, "wrapMode", "none");
                _$effect(_$p => _$setProp(_el$4, "fg", context.theme.text.feedback.warning.base, _$p));
                return _el$4;
              }
            }), null);
            _$insert(_el$2, _$createComponent(HoverMarqueeText, {
              renderer: getRenderer,
              get text() {
                return p().name;
              },
              get active() {
                return isRowActive();
              },
              get fg() {
                return context.theme.hue.accent[400];
              },
              get attributes() {
                return TextAttributes.BOLD;
              },
              flexShrink: 1
            }), null);
            _$insertNode(_el$6, _el$7);
            _$setProp(_el$6, "selectable", false);
            _$setProp(_el$6, "wrapMode", "none");
            _$insert(_el$6, () => p().worktrees.length, _el$7);
            _$effect(_p$ => {
              var _v$ = rowIndex() > 0 ? 1 : 0,
                _v$2 = rowBg(),
                _v$3 = isRowActive() ? context.theme.text.action.primary.selected : context.theme.text.muted,
                _v$4 = isRowActive() ? context.theme.text.muted : context.theme.text.faint;
              _v$ !== _p$.e && (_p$.e = _$setProp(_el$, "marginTop", _v$, _p$.e));
              _v$2 !== _p$.t && (_p$.t = _$setProp(_el$, "backgroundColor", _v$2, _p$.t));
              _v$3 !== _p$.a && (_p$.a = _$setProp(_el$3, "fg", _v$3, _p$.a));
              _v$4 !== _p$.o && (_p$.o = _$setProp(_el$6, "fg", _v$4, _p$.o));
              return _p$;
            }, {
              e: undefined,
              t: undefined,
              a: undefined,
              o: undefined
            });
            return _el$;
          })();
        }
      });
    }
    if (rowKey.startsWith("worktree:")) {
      const wtRow = createMemo(() => {
        const cur = rowAccessor();
        return cur?.kind === "worktree" ? cur : undefined;
      });
      const needsWorktreeGap = () => {
        const prev = tree().rows[rowIndex() - 1];
        return Boolean(prev && prev.kind !== "project");
      };
      return _$createComponent(Show, {
        get when() {
          return wtRow();
        },
        children: row => {
          const wt = () => row().worktree;
          return (() => {
            var _el$8 = _$createElement("box"),
              _el$9 = _$createElement("box"),
              _el$0 = _$createElement("text"),
              _el$1 = _$createElement("text"),
              _el$10 = _$createElement("box");
            _$insertNode(_el$8, _el$9);
            _$insertNode(_el$8, _el$10);
            _$use(el => {
              if (el) panelRowRefs.set(rowKey, el);else panelRowRefs.delete(rowKey);
            }, _el$8);
            _$setProp(_el$8, "flexDirection", "row");
            _$setProp(_el$8, "justifyContent", "space-between");
            _$setProp(_el$8, "alignItems", "center");
            _$setProp(_el$8, "width", "100%");
            _$setProp(_el$8, "paddingLeft", 2);
            _$setProp(_el$8, "paddingRight", 1);
            _$setProp(_el$8, "onMouseOver", () => panelRowHover.onEnter(rowKey));
            _$setProp(_el$8, "onMouseOut", () => panelRowHover.onLeave(rowKey));
            _$setProp(_el$8, "onMouseUp", event => {
              if (!isLeftClick(event)) return;
              panelUserMoved = true;
              setSelectedKey(rowKey);
              const curWt = wt();
              void ctrl.openWorktree(curWt.directory, curWt.primarySessionID, row().project.id);
            });
            _$insertNode(_el$9, _el$0);
            _$insertNode(_el$9, _el$1);
            _$setProp(_el$9, "flexDirection", "row");
            _$setProp(_el$9, "columnGap", 1);
            _$setProp(_el$9, "flexGrow", 1);
            _$setProp(_el$9, "flexShrink", 1);
            _$setProp(_el$9, "overflow", "hidden");
            _$setProp(_el$0, "selectable", false);
            _$setProp(_el$0, "wrapMode", "none");
            _$insert(_el$0, (() => {
              var _c$ = _$memo(() => !!wt().quickSlot);
              return () => _c$() ? `${wt().quickSlot}` : " ";
            })());
            _$setProp(_el$1, "selectable", false);
            _$setProp(_el$1, "wrapMode", "none");
            _$insert(_el$1, () => worktreeGlyph(wt().isCurrent));
            _$insert(_el$9, _$createComponent(HoverMarqueeText, {
              renderer: getRenderer,
              get text() {
                return wt().label;
              },
              get active() {
                return isRowActive();
              },
              get fg() {
                return _$memo(() => !!(wt().isCurrent || wt().status !== "idle" || isRowActive()))() ? context.theme.text.base : context.theme.text.muted;
              },
              get attributes() {
                return _$memo(() => !!(wt().isCurrent || isSelected()))() ? TextAttributes.BOLD : TextAttributes.NONE;
              },
              flexShrink: 1
            }), null);
            _$setProp(_el$10, "flexDirection", "row");
            _$setProp(_el$10, "columnGap", 1);
            _$setProp(_el$10, "flexShrink", 0);
            _$insert(_el$10, _$createComponent(Show, {
              get when() {
                return workspaceStatusGlyph(wt().status);
              },
              children: badge => (() => {
                var _el$17 = _$createElement("text");
                _$setProp(_el$17, "selectable", false);
                _$setProp(_el$17, "wrapMode", "none");
                _$insert(_el$17, badge);
                _$effect(_p$ => {
                  var _v$0 = resolveStatusColor(context.theme, wt().status, wt().isCurrent),
                    _v$1 = TextAttributes.BOLD;
                  _v$0 !== _p$.e && (_p$.e = _$setProp(_el$17, "fg", _v$0, _p$.e));
                  _v$1 !== _p$.t && (_p$.t = _$setProp(_el$17, "attributes", _v$1, _p$.t));
                  return _p$;
                }, {
                  e: undefined,
                  t: undefined
                });
                return _el$17;
              })()
            }), null);
            _$insert(_el$10, _$createComponent(Show, {
              get when() {
                return wt().dirtyCount > 0;
              },
              get children() {
                var _el$11 = _$createElement("text"),
                  _el$12 = _$createTextNode(`~`);
                _$insertNode(_el$11, _el$12);
                _$setProp(_el$11, "selectable", false);
                _$setProp(_el$11, "wrapMode", "none");
                _$insert(_el$11, () => wt().dirtyCount, null);
                _$effect(_$p => _$setProp(_el$11, "fg", context.theme.text.muted, _$p));
                return _el$11;
              }
            }), null);
            _$insert(_el$10, _$createComponent(Show, {
              get when() {
                return wt().ahead > 0;
              },
              get children() {
                var _el$13 = _$createElement("text"),
                  _el$14 = _$createTextNode(`↑`);
                _$insertNode(_el$13, _el$14);
                _$setProp(_el$13, "selectable", false);
                _$setProp(_el$13, "wrapMode", "none");
                _$insert(_el$13, () => wt().ahead, null);
                _$effect(_$p => _$setProp(_el$13, "fg", isRowActive() ? context.theme.text.muted : context.theme.text.faint, _$p));
                return _el$13;
              }
            }), null);
            _$insert(_el$10, _$createComponent(Show, {
              get when() {
                return wt().behind > 0;
              },
              get children() {
                var _el$15 = _$createElement("text"),
                  _el$16 = _$createTextNode(`↓`);
                _$insertNode(_el$15, _el$16);
                _$setProp(_el$15, "selectable", false);
                _$setProp(_el$15, "wrapMode", "none");
                _$insert(_el$15, () => wt().behind, null);
                _$effect(_$p => _$setProp(_el$15, "fg", isRowActive() ? context.theme.text.muted : context.theme.text.faint, _$p));
                return _el$15;
              }
            }), null);
            _$effect(_p$ => {
              var _v$5 = needsWorktreeGap() ? 1 : 0,
                _v$6 = rowBg(),
                _v$7 = isRowActive() ? context.theme.text.muted : context.theme.text.faint,
                _v$8 = wt().isCurrent ? context.theme.text.action.primary.selected : isRowActive() ? context.theme.text.muted : context.theme.text.faint,
                _v$9 = TextAttributes.BOLD;
              _v$5 !== _p$.e && (_p$.e = _$setProp(_el$8, "marginTop", _v$5, _p$.e));
              _v$6 !== _p$.t && (_p$.t = _$setProp(_el$8, "backgroundColor", _v$6, _p$.t));
              _v$7 !== _p$.a && (_p$.a = _$setProp(_el$0, "fg", _v$7, _p$.a));
              _v$8 !== _p$.o && (_p$.o = _$setProp(_el$1, "fg", _v$8, _p$.o));
              _v$9 !== _p$.i && (_p$.i = _$setProp(_el$1, "attributes", _v$9, _p$.i));
              return _p$;
            }, {
              e: undefined,
              t: undefined,
              a: undefined,
              o: undefined,
              i: undefined
            });
            return _el$8;
          })();
        }
      });
    }
    const sessRow = createMemo(() => {
      const cur = rowAccessor();
      return cur?.kind === "session" ? cur : undefined;
    });
    return _$createComponent(Show, {
      get when() {
        return sessRow();
      },
      children: row => {
        const s = () => row().session;
        const isLastSession = () => {
          const sessions = row().worktree.sessions;
          return sessions[sessions.length - 1]?.id === s().id;
        };
        const isSessHovered = () => hoveredPanelKey() === rowKey;
        const isDeleteHovered = () => panelSessionDeleteHover.hoveredKey() === rowKey;
        return (() => {
          var _el$18 = _$createElement("box"),
            _el$19 = _$createElement("box"),
            _el$20 = _$createElement("text"),
            _el$21 = _$createElement("text"),
            _el$22 = _$createElement("box"),
            _el$23 = _$createElement("box"),
            _el$24 = _$createElement("text");
          _$insertNode(_el$18, _el$19);
          _$insertNode(_el$18, _el$22);
          _$use(el => {
            if (el) panelRowRefs.set(rowKey, el);else panelRowRefs.delete(rowKey);
          }, _el$18);
          _$setProp(_el$18, "flexDirection", "row");
          _$setProp(_el$18, "justifyContent", "space-between");
          _$setProp(_el$18, "alignItems", "center");
          _$setProp(_el$18, "width", "100%");
          _$setProp(_el$18, "paddingLeft", 6);
          _$setProp(_el$18, "paddingRight", 1);
          _$setProp(_el$18, "onMouseOver", () => panelRowHover.onEnter(rowKey));
          _$setProp(_el$18, "onMouseOut", () => panelRowHover.onLeave(rowKey));
          _$setProp(_el$18, "onMouseUp", event => {
            panelUserMoved = true;
            setSelectedKey(rowKey);
            if (isRightClick(event)) {
              event.stopPropagation();
              void ctrl.openSessionContextMenu(s(), row().worktree.directory, row().project.id);
              return;
            }
            if (!isLeftClick(event)) return;
            ctrl.activateSession(s().id, row().worktree.directory, row().project.id);
          });
          _$insertNode(_el$19, _el$20);
          _$insertNode(_el$19, _el$21);
          _$setProp(_el$19, "flexDirection", "row");
          _$setProp(_el$19, "columnGap", 1);
          _$setProp(_el$19, "flexGrow", 1);
          _$setProp(_el$19, "flexShrink", 1);
          _$setProp(_el$19, "overflow", "hidden");
          _$setProp(_el$20, "selectable", false);
          _$setProp(_el$20, "wrapMode", "none");
          _$insert(_el$20, () => isLastSession() ? "└─" : "├─");
          _$setProp(_el$21, "selectable", false);
          _$setProp(_el$21, "wrapMode", "none");
          _$insert(_el$21, () => statusGlyph(s().status, s().isCurrent));
          _$insert(_el$19, _$createComponent(HoverMarqueeText, {
            renderer: getRenderer,
            get text() {
              return s().title;
            },
            get active() {
              return isRowActive();
            },
            get fg() {
              return _$memo(() => !!(s().isCurrent || s().status !== "idle" || isRowActive()))() ? context.theme.text.base : context.theme.text.muted;
            },
            get attributes() {
              return _$memo(() => !!s().isCurrent)() ? TextAttributes.BOLD : TextAttributes.NONE;
            },
            flexShrink: 1
          }), null);
          _$insertNode(_el$22, _el$23);
          _$setProp(_el$22, "flexDirection", "row");
          _$setProp(_el$22, "columnGap", 1);
          _$setProp(_el$22, "flexShrink", 0);
          _$insertNode(_el$23, _el$24);
          _$setProp(_el$23, "onMouseOver", () => panelSessionDeleteHover.onEnter(rowKey));
          _$setProp(_el$23, "onMouseOut", () => panelSessionDeleteHover.onLeave(rowKey));
          _$setProp(_el$23, "onMouseUp", event => {
            if (!isLeftClick(event) || !isRowActive()) return;
            event.stopPropagation();
            void ctrl.removeSessionFlow(s());
          });
          _$setProp(_el$24, "selectable", false);
          _$setProp(_el$24, "wrapMode", "none");
          _$insert(_el$24, () => isRowActive() ? "×" : " ");
          _$effect(_p$ => {
            var _v$10 = rowBg(),
              _v$11 = isRowActive() ? context.theme.text.muted : context.theme.text.faint,
              _v$12 = isRowActive() && !s().isCurrent && s().status === "idle" ? context.theme.text.muted : resolveStatusColor(context.theme, s().status, s().isCurrent),
              _v$13 = isSessHovered() && isDeleteHovered() ? resolveSidebarAccentHoverBg(context.theme) : undefined,
              _v$14 = isDeleteHovered() ? context.theme.text.feedback.error.base : context.theme.text.muted,
              _v$15 = isDeleteHovered() ? TextAttributes.BOLD : TextAttributes.NONE;
            _v$10 !== _p$.e && (_p$.e = _$setProp(_el$18, "backgroundColor", _v$10, _p$.e));
            _v$11 !== _p$.t && (_p$.t = _$setProp(_el$20, "fg", _v$11, _p$.t));
            _v$12 !== _p$.a && (_p$.a = _$setProp(_el$21, "fg", _v$12, _p$.a));
            _v$13 !== _p$.o && (_p$.o = _$setProp(_el$23, "backgroundColor", _v$13, _p$.o));
            _v$14 !== _p$.i && (_p$.i = _$setProp(_el$24, "fg", _v$14, _p$.i));
            _v$15 !== _p$.n && (_p$.n = _$setProp(_el$24, "attributes", _v$15, _p$.n));
            return _p$;
          }, {
            e: undefined,
            t: undefined,
            a: undefined,
            o: undefined,
            i: undefined,
            n: undefined
          });
          return _el$18;
        })();
      }
    });
  };
  return (() => {
    var _el$25 = _$createElement("box"),
      _el$26 = _$createElement("box"),
      _el$27 = _$createElement("text"),
      _el$29 = _$createElement("box"),
      _el$30 = _$createElement("box"),
      _el$31 = _$createElement("text"),
      _el$33 = _$createElement("text"),
      _el$34 = _$createTextNode(` · esc`),
      _el$35 = _$createElement("scrollbox"),
      _el$36 = _$createElement("box"),
      _el$37 = _$createElement("box"),
      _el$38 = _$createElement("text");
    _$insertNode(_el$25, _el$26);
    _$insertNode(_el$25, _el$35);
    _$insertNode(_el$25, _el$37);
    _$use(el => {
      containerRef = el;
    }, _el$25);
    _$setProp(_el$25, "flexDirection", "column");
    _$setProp(_el$25, "width", "100%");
    _$setProp(_el$25, "height", "100%");
    _$setProp(_el$25, "paddingY", 1);
    _$setProp(_el$25, "focusable", true);
    _$setProp(_el$25, "onMouseDown", () => props.panel.focus());
    _$setProp(_el$25, "onKeyDown", handleKeyDown);
    _$insertNode(_el$26, _el$27);
    _$insertNode(_el$26, _el$29);
    _$setProp(_el$26, "flexDirection", "row");
    _$setProp(_el$26, "justifyContent", "space-between");
    _$setProp(_el$26, "alignItems", "center");
    _$setProp(_el$26, "paddingX", 1);
    _$setProp(_el$26, "paddingBottom", 1);
    _$insertNode(_el$27, _$createTextNode(`Worktrees`));
    _$setProp(_el$27, "selectable", false);
    _$setProp(_el$27, "wrapMode", "none");
    _$insertNode(_el$29, _el$30);
    _$insertNode(_el$29, _el$33);
    _$setProp(_el$29, "flexDirection", "row");
    _$setProp(_el$29, "columnGap", 2);
    _$setProp(_el$29, "alignItems", "center");
    _$insertNode(_el$30, _el$31);
    _$setProp(_el$30, "onMouseOver", () => panelNewSessionHover.onEnter());
    _$setProp(_el$30, "onMouseOut", () => panelNewSessionHover.onLeave());
    _$setProp(_el$30, "onMouseUp", event => {
      event.stopPropagation();
      const row = selectedRow();
      const dir = resolveRowDirectory(row);
      if (!dir) return;
      void ctrl.createSessionInDirectory(dir, `Started session in ${dirBasename(dir)}`, row?.project.id);
    });
    _$insertNode(_el$31, _$createTextNode(`+ New session`));
    _$setProp(_el$31, "selectable", false);
    _$setProp(_el$31, "wrapMode", "none");
    _$insertNode(_el$33, _el$34);
    _$setProp(_el$33, "selectable", false);
    _$setProp(_el$33, "wrapMode", "none");
    _$insert(_el$33, () => ctrl.prefs.showAllGitProjects ? "all git repos" : "current repo", _el$34);
    _$insertNode(_el$35, _el$36);
    _$use(el => {
      panelScrollRef = el;
    }, _el$35);
    _$setProp(_el$35, "flexGrow", 1);
    _$setProp(_el$36, "flexDirection", "column");
    _$setProp(_el$36, "width", "100%");
    _$insert(_el$36, _$createComponent(Show, {
      get when() {
        return rowKeys().length > 0;
      },
      get fallback() {
        return (() => {
          var _el$40 = _$createElement("box"),
            _el$41 = _$createElement("text");
          _$insertNode(_el$40, _el$41);
          _$setProp(_el$40, "paddingX", 1);
          _$setProp(_el$40, "paddingY", 1);
          _$insertNode(_el$41, _$createTextNode(`No Git worktrees for this folder. Press "a" to browse all Git repositories, or "n" inside a Git repo to create a worktree.`));
          _$setProp(_el$41, "selectable", false);
          _$setProp(_el$41, "wrapMode", "word");
          _$effect(_$p => _$setProp(_el$41, "fg", context.theme.text.muted, _$p));
          return _el$40;
        })();
      },
      get children() {
        return _$createComponent(For, {
          get each() {
            return rowKeys();
          },
          children: (rowKey, idx) => renderPanelRowByKey(rowKey, idx)
        });
      }
    }));
    _$insertNode(_el$37, _el$38);
    _$setProp(_el$37, "flexDirection", "column");
    _$setProp(_el$37, "paddingX", 1);
    _$setProp(_el$37, "paddingTop", 1);
    _$insert(_el$37, _$createComponent(Show, {
      get when() {
        return selectedPath();
      },
      children: path => (() => {
        var _el$43 = _$createElement("box");
        _$setProp(_el$43, "width", "100%");
        _$setProp(_el$43, "overflow", "hidden");
        _$setProp(_el$43, "onMouseOver", () => footerPathHover.onEnter());
        _$setProp(_el$43, "onMouseOut", () => footerPathHover.onLeave());
        _$insert(_el$43, _$createComponent(HoverMarqueeText, {
          renderer: getRenderer,
          get text() {
            return path();
          },
          get active() {
            return hoveredFooterPath();
          },
          get fg() {
            return _$memo(() => !!hoveredFooterPath())() ? context.theme.text.base : context.theme.text.muted;
          },
          flexShrink: 1
        }));
        return _el$43;
      })()
    }), _el$38);
    _$insertNode(_el$38, _$createTextNode(`j/k move · ⏎ open · o editor · n worktree · s session · p pin · x remove · a repos`));
    _$setProp(_el$38, "selectable", false);
    _$setProp(_el$38, "wrapMode", "word");
    _$effect(_p$ => {
      var _v$16 = props.panel.focused,
        _v$17 = context.theme.text.base,
        _v$18 = TextAttributes.BOLD,
        _v$19 = panelNewSessionHovered() ? resolveSidebarHoverBg(context.theme) : undefined,
        _v$20 = panelNewSessionHovered() ? context.theme.text.action.primary.selected : context.theme.text.base,
        _v$21 = TextAttributes.BOLD,
        _v$22 = context.theme.text.faint,
        _v$23 = context.theme.text.faint;
      _v$16 !== _p$.e && (_p$.e = _$setProp(_el$25, "focused", _v$16, _p$.e));
      _v$17 !== _p$.t && (_p$.t = _$setProp(_el$27, "fg", _v$17, _p$.t));
      _v$18 !== _p$.a && (_p$.a = _$setProp(_el$27, "attributes", _v$18, _p$.a));
      _v$19 !== _p$.o && (_p$.o = _$setProp(_el$30, "backgroundColor", _v$19, _p$.o));
      _v$20 !== _p$.i && (_p$.i = _$setProp(_el$31, "fg", _v$20, _p$.i));
      _v$21 !== _p$.n && (_p$.n = _$setProp(_el$31, "attributes", _v$21, _p$.n));
      _v$22 !== _p$.s && (_p$.s = _$setProp(_el$33, "fg", _v$22, _p$.s));
      _v$23 !== _p$.h && (_p$.h = _$setProp(_el$38, "fg", _v$23, _p$.h));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined,
      n: undefined,
      s: undefined,
      h: undefined
    });
    return _el$25;
  })();
};

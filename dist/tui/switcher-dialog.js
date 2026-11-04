import { effect as _$effect } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
import { use as _$use } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
/** @jsxImportSource @opentui/solid */
import { MouseButton, TextAttributes } from "@opentui/core";
import { For, Show, createEffect, createMemo, createSignal, onMount } from "solid-js";
import { dirBasename, filterWorkspaceTreeForSwitcher, formatSwitcherWorktreeLabel, rollupHiddenWorktreeStatus } from "../model.js";
import { createHoverKeySignal } from "./hover.js";
import { HoverMarqueeText } from "./marquee.js";
import { resolveDialogHoverBg, sameStringArray, statusGlyph, statusLabel, worktreeGlyph } from "./types.js";
export const WorkspaceSwitcherDialog = props => {
  const {
    ctrl
  } = props;
  const {
    context
  } = ctrl;
  const getRenderer = () => context.renderer;
  const dialogTheme = context.theme.surface("dialog");
  const footerTheme = context.theme.surface("dialog.footer");
  const initialCurrentSnap = ctrl.buildSnapshot({
    currentProjectOnly: true,
    onlyRelevantProjects: false
  });
  const startShowAll = props.initialShowAll ?? (ctrl.prefs.showAllGitProjects || initialCurrentSnap.projects.length === 0);
  const [showAll, setShowAll] = createSignal(startShowAll);
  const [query, setQuery] = createSignal("");
  const [selectedKey, setSelectedKey] = createSignal("");
  const rowHover = createHoverKeySignal();
  const hoveredKey = rowHover.hoveredKey;
  const footerHover = createHoverKeySignal();
  const hoveredFooterAction = footerHover.hoveredKey;
  let userMovedSelection = false;
  let inputRef;
  let scrollRef;
  const rowRefs = new Map();
  const handledEvents = new WeakSet();
  onMount(() => {
    void ctrl.refreshWorkspacesData({
      includeAllProjects: startShowAll
    }).catch(() => {});
    queueMicrotask(() => {
      inputRef?.focus();
    });
  });
  const snap = createMemo(() => {
    const all = showAll();
    const primary = ctrl.buildSnapshot({
      currentProjectOnly: !all,
      onlyRelevantProjects: false
    });
    if (!all && primary.projects.length === 0) {
      return ctrl.buildSnapshot({
        onlyRelevantProjects: false
      });
    }
    return primary;
  });
  const filtered = createMemo(() => filterWorkspaceTreeForSwitcher(snap().projects, query()));
  const projectIDs = createMemo(() => filtered().projects.map(p => p.project.id), [], {
    equals: sameStringArray
  });
  let closed = false;
  const closeDialog = () => {
    if (closed) return false;
    closed = true;
    context.ui.dialog.clear();
    return true;
  };
  const scrollRowIntoView = key => {
    if (closed) return;
    const el = rowRefs.get(key);
    if (el && !el.isDestroyed && scrollRef && !scrollRef.isDestroyed) {
      scrollRef.scrollChildIntoView(el, {
        align: "nearest",
        inset: 1
      });
    }
  };
  let prevTrimmedQuery = "";
  createEffect(() => {
    const rows = filtered().selectableRows;
    const trimmed = query().trim();
    const queryChanged = trimmed !== prevTrimmedQuery;
    prevTrimmedQuery = trimmed;
    if (rows.length === 0) {
      setSelectedKey("");
      return;
    }
    if (trimmed.length > 0) {
      const existing = rows.find(r => r.key === selectedKey());
      if (!queryChanged && existing) return;
      const bestMatch = rows.find(r => r.directlyMatched) ?? rows[0];
      setSelectedKey(bestMatch.key);
      queueMicrotask(() => scrollRowIntoView(bestMatch.key));
      return;
    }
    const preferred = rows.find(r => r.kind === "session" && r.session.isCurrent) ?? rows.find(r => r.kind === "worktree" && r.worktree.isCurrent);
    if (!userMovedSelection && preferred) {
      if (selectedKey() !== preferred.key) {
        setSelectedKey(preferred.key);
        queueMicrotask(() => scrollRowIntoView(preferred.key));
      }
      return;
    }
    const existing = rows.find(r => r.key === selectedKey());
    if (existing) return;
    const initial = preferred ?? rows[0];
    setSelectedKey(initial.key);
    queueMicrotask(() => scrollRowIntoView(initial.key));
  });
  const selectedRow = createMemo(() => {
    const rows = filtered().selectableRows;
    if (rows.length === 0) return undefined;
    const key = selectedKey();
    return rows.find(r => r.key === key) ?? rows[0];
  });
  const canRemoveSelected = createMemo(() => {
    const row = selectedRow();
    if (!row) return false;
    if (row.kind === "session") return true;
    return !row.worktree.isCanonical;
  });
  const moveSelection = delta => {
    const rows = filtered().selectableRows;
    if (rows.length === 0) return;
    userMovedSelection = true;
    const currentKey = selectedRow()?.key;
    const idx = currentKey ? rows.findIndex(r => r.key === currentKey) : -1;
    const start = idx === -1 ? 0 : idx;
    const nextIdx = ((start + delta) % rows.length + rows.length) % rows.length;
    const target = rows[nextIdx];
    if (target) {
      setSelectedKey(target.key);
      scrollRowIntoView(target.key);
    }
  };
  const activateSwitcherRow = row => {
    if (!row || !closeDialog()) return;
    if (row.kind === "session") {
      ctrl.activateSession(row.session.id, row.worktree.directory, row.project.id);
    } else {
      void ctrl.openWorktree(row.worktree.directory, row.worktree.primarySessionID, row.project.id);
    }
  };
  const triggerNewWorktree = () => {
    const row = selectedRow();
    const proj = row ? {
      id: row.project.id,
      name: row.project.name,
      canonical: row.project.canonical
    } : ctrl.findCurrentProject();
    if (!proj || !closeDialog()) return;
    void ctrl.createWorktreeFlow(proj);
  };
  const triggerNewSession = () => {
    const row = selectedRow();
    const dir = row?.worktree.directory ?? ctrl.resolveActiveDirectory();
    if (!dir || !closeDialog()) return;
    void ctrl.createSessionInDirectory(dir, `Started session in ${dirBasename(dir)}`, row?.project.id);
  };
  const triggerOpenEditor = () => {
    const row = selectedRow();
    const dir = row?.worktree.directory ?? ctrl.resolveActiveDirectory();
    if (!dir || !closeDialog()) return;
    void ctrl.openWorktreeInEditor(dir);
  };
  const triggerRemoveSelected = () => {
    const row = selectedRow();
    if (!row) return;
    if (row.kind === "session") {
      if (!closeDialog()) return;
      void ctrl.removeSessionFlow(row.session);
      return;
    }
    if (row.worktree.isCanonical || !closeDialog()) return;
    void ctrl.removeWorktreeFlow(row.project, row.worktree);
  };
  const triggerToggleAll = () => {
    if (closed) return;
    const next = !showAll();
    setShowAll(next);
    if (next) {
      void ctrl.refreshWorkspacesData({
        includeAllProjects: true
      }).catch(() => {});
    }
  };
  const consumeOnce = (event, fn) => {
    if (closed) return;
    if (event) {
      if (handledEvents.has(event) || event.defaultPrevented) return;
      handledEvents.add(event);
      event.preventDefault();
      event.stopPropagation();
    }
    fn();
  };
  context.keymap.layer(() => ({
    mode: "global",
    priority: 50,
    commands: [{
      bind: "up",
      run: (_input, event) => consumeOnce(event, () => moveSelection(-1))
    }, {
      bind: "down",
      run: (_input, event) => consumeOnce(event, () => moveSelection(1))
    }, {
      bind: "ctrl+p",
      run: (_input, event) => consumeOnce(event, () => moveSelection(-1))
    }, {
      bind: "ctrl+k",
      run: (_input, event) => consumeOnce(event, () => moveSelection(-1))
    }, {
      bind: "ctrl+j",
      run: (_input, event) => consumeOnce(event, () => moveSelection(1))
    }, {
      bind: "pageup",
      run: (_input, event) => consumeOnce(event, () => moveSelection(-6))
    }, {
      bind: "pagedown",
      run: (_input, event) => consumeOnce(event, () => moveSelection(6))
    }, {
      bind: "return",
      run: (_input, event) => consumeOnce(event, () => activateSwitcherRow(selectedRow()))
    }, {
      bind: "escape",
      run: (_input, event) => consumeOnce(event, () => {
        closeDialog();
      })
    }, {
      bind: "ctrl+n",
      run: (_input, event) => consumeOnce(event, () => triggerNewWorktree())
    }, {
      bind: "ctrl+s",
      run: (_input, event) => consumeOnce(event, () => triggerNewSession())
    }, {
      bind: "ctrl+o",
      run: (_input, event) => consumeOnce(event, () => triggerOpenEditor())
    }, {
      bind: "ctrl+x",
      run: (_input, event) => consumeOnce(event, () => triggerRemoveSelected())
    }, {
      bind: "ctrl+a",
      run: (_input, event) => consumeOnce(event, () => triggerToggleAll())
    }]
  }));
  const handleInputKeyDown = event => {
    if (handledEvents.has(event) || event.defaultPrevented) return;
    if (event.ctrl && !event.meta) {
      switch (event.name) {
        case "n":
          consumeOnce(event, () => triggerNewWorktree());
          return;
        case "s":
          consumeOnce(event, () => triggerNewSession());
          return;
        case "o":
          consumeOnce(event, () => triggerOpenEditor());
          return;
        case "x":
          consumeOnce(event, () => triggerRemoveSelected());
          return;
        case "a":
          consumeOnce(event, () => triggerToggleAll());
          return;
        case "p":
        case "k":
          consumeOnce(event, () => moveSelection(-1));
          return;
        case "j":
          consumeOnce(event, () => moveSelection(1));
          return;
      }
    }
    switch (event.name) {
      case "up":
        consumeOnce(event, () => moveSelection(-1));
        return;
      case "down":
        consumeOnce(event, () => moveSelection(1));
        return;
      case "pageup":
        consumeOnce(event, () => moveSelection(-6));
        return;
      case "pagedown":
        consumeOnce(event, () => moveSelection(6));
        return;
      case "return":
      case "enter":
        consumeOnce(event, () => activateSwitcherRow(selectedRow()));
        return;
      case "escape":
        consumeOnce(event, () => {
          closeDialog();
        });
        return;
    }
  };
  const dialogStatusColor = (status, isCurrent) => {
    if (status === "blocked") return dialogTheme.text.feedback.warning.base;
    if (status === "working") return dialogTheme.text.feedback.info.base;
    if (isCurrent) return dialogTheme.text.action.primary.selected;
    return dialogTheme.text.faint;
  };
  const focusedRowText = dialogTheme.text.action.primary.focused;
  const rowBg = key => {
    if (selectedRow()?.key === key) {
      return dialogTheme.background.action.primary.focused;
    }
    if (hoveredKey() === key) {
      return resolveDialogHoverBg(context.theme, dialogTheme);
    }
    return undefined;
  };
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("box"),
      _el$3 = _$createElement("text"),
      _el$4 = _$createElement("text"),
      _el$6 = _$createElement("box"),
      _el$7 = _$createElement("input"),
      _el$8 = _$createElement("scrollbox"),
      _el$9 = _$createElement("box"),
      _el$0 = _$createElement("box"),
      _el$1 = _$createElement("box"),
      _el$10 = _$createElement("text"),
      _el$12 = _$createElement("text"),
      _el$14 = _$createElement("box"),
      _el$15 = _$createElement("text"),
      _el$17 = _$createElement("text"),
      _el$19 = _$createElement("box"),
      _el$20 = _$createElement("text"),
      _el$22 = _$createElement("text"),
      _el$28 = _$createElement("box"),
      _el$29 = _$createElement("text"),
      _el$30 = _$createElement("text");
    _$insertNode(_el$, _el$2);
    _$insertNode(_el$, _el$6);
    _$insertNode(_el$, _el$8);
    _$insertNode(_el$, _el$0);
    _$setProp(_el$, "flexDirection", "column");
    _$setProp(_el$, "width", "100%");
    _$setProp(_el$, "paddingBottom", 1);
    _$setProp(_el$, "onMouseDown", () => {
      inputRef?.focus();
    });
    _$insertNode(_el$2, _el$3);
    _$insertNode(_el$2, _el$4);
    _$setProp(_el$2, "flexDirection", "row");
    _$setProp(_el$2, "justifyContent", "space-between");
    _$setProp(_el$2, "alignItems", "center");
    _$setProp(_el$2, "paddingX", 4);
    _$setProp(_el$2, "paddingBottom", 1);
    _$setProp(_el$3, "selectable", false);
    _$setProp(_el$3, "wrapMode", "none");
    _$insert(_el$3, () => showAll() ? "All Git Repositories" : "Repository Worktrees");
    _$insertNode(_el$4, _$createTextNode(`esc`));
    _$setProp(_el$4, "selectable", false);
    _$setProp(_el$4, "wrapMode", "none");
    _$insertNode(_el$6, _el$7);
    _$setProp(_el$6, "paddingX", 4);
    _$setProp(_el$6, "paddingBottom", 1);
    _$use(el => {
      inputRef = el;
    }, _el$7);
    _$setProp(_el$7, "focused", true);
    _$setProp(_el$7, "width", "100%");
    _$setProp(_el$7, "placeholder", "Filter branches, worktrees, or sessions...");
    _$setProp(_el$7, "backgroundColor", "transparent");
    _$setProp(_el$7, "focusedBackgroundColor", "transparent");
    _$setProp(_el$7, "onInput", val => {
      if (val.trim().length > 0) userMovedSelection = true;
      setQuery(val);
    });
    _$setProp(_el$7, "onKeyDown", handleInputKeyDown);
    _$insertNode(_el$8, _el$9);
    _$use(el => {
      scrollRef = el;
    }, _el$8);
    _$setProp(_el$8, "maxHeight", 18);
    _$setProp(_el$8, "width", "100%");
    _$setProp(_el$9, "flexDirection", "column");
    _$setProp(_el$9, "width", "100%");
    _$setProp(_el$9, "paddingX", 1);
    _$insert(_el$9, _$createComponent(Show, {
      get when() {
        return projectIDs().length > 0;
      },
      get fallback() {
        return (() => {
          var _el$32 = _$createElement("box"),
            _el$33 = _$createElement("text");
          _$insertNode(_el$32, _el$33);
          _$setProp(_el$32, "paddingX", 3);
          _$setProp(_el$32, "paddingY", 1);
          _$setProp(_el$33, "selectable", false);
          _$setProp(_el$33, "wrapMode", "word");
          _$insert(_el$33, () => query().trim() ? "No matching branches, worktrees, or sessions." : "No Git worktrees found. Press ctrl+a to browse all repositories or ctrl+n to create a worktree.");
          _$effect(_$p => _$setProp(_el$33, "fg", dialogTheme.text.muted, _$p));
          return _el$32;
        })();
      },
      get children() {
        return _$createComponent(For, {
          get each() {
            return projectIDs();
          },
          children: (projID, projIdx) => {
            const projGroupAccessor = createMemo(() => filtered().projects.find(p => p.project.id === projID));
            return _$createComponent(Show, {
              get when() {
                return projGroupAccessor();
              },
              children: projGroup => {
                const wtKeys = createMemo(() => projGroup().worktrees.map(w => w.key), [], {
                  equals: sameStringArray
                });
                return (() => {
                  var _el$34 = _$createElement("box"),
                    _el$35 = _$createElement("box"),
                    _el$36 = _$createElement("text"),
                    _el$37 = _$createElement("text"),
                    _el$38 = _$createTextNode(` `);
                  _$insertNode(_el$34, _el$35);
                  _$setProp(_el$34, "flexDirection", "column");
                  _$setProp(_el$34, "width", "100%");
                  _$insertNode(_el$35, _el$36);
                  _$insertNode(_el$35, _el$37);
                  _$setProp(_el$35, "flexDirection", "row");
                  _$setProp(_el$35, "justifyContent", "space-between");
                  _$setProp(_el$35, "alignItems", "center");
                  _$setProp(_el$35, "paddingX", 3);
                  _$setProp(_el$35, "width", "100%");
                  _$setProp(_el$36, "selectable", false);
                  _$setProp(_el$36, "wrapMode", "none");
                  _$setProp(_el$36, "truncate", true);
                  _$setProp(_el$36, "flexShrink", 1);
                  _$insert(_el$36, () => projGroup().project.pinned ? "★ " : "", null);
                  _$insert(_el$36, () => projGroup().project.name, null);
                  _$insertNode(_el$37, _el$38);
                  _$setProp(_el$37, "selectable", false);
                  _$setProp(_el$37, "wrapMode", "none");
                  _$insert(_el$37, () => projGroup().worktrees.length, _el$38);
                  _$insert(_el$37, () => projGroup().worktrees.length === 1 ? "worktree" : "worktrees", null);
                  _$insert(_el$34, _$createComponent(For, {
                    get each() {
                      return wtKeys();
                    },
                    children: (wtKey, wtIdx) => {
                      const wtGroupAccessor = createMemo(() => projGroup().worktrees.find(w => w.key === wtKey));
                      return _$createComponent(Show, {
                        get when() {
                          return wtGroupAccessor();
                        },
                        children: wtGroup => {
                          const wt = () => wtGroup().worktree;
                          const displayLabel = createMemo(() => formatSwitcherWorktreeLabel(wt()));
                          const hiddenRollup = createMemo(() => rollupHiddenWorktreeStatus(wt(), wtGroup().sessions));
                          const rowStatus = () => hiddenRollup().status;
                          const rowStatusDetail = () => hiddenRollup().detail;
                          const isWtSelected = () => selectedRow()?.key === wtKey;
                          const sessionIDs = createMemo(() => wtGroup().sessions.map(s => s.id), [], {
                            equals: sameStringArray
                          });
                          return (() => {
                            var _el$39 = _$createElement("box"),
                              _el$40 = _$createElement("box"),
                              _el$41 = _$createElement("box"),
                              _el$42 = _$createElement("text"),
                              _el$43 = _$createElement("box"),
                              _el$44 = _$createElement("box"),
                              _el$45 = _$createElement("text");
                            _$insertNode(_el$39, _el$40);
                            _$setProp(_el$39, "flexDirection", "column");
                            _$setProp(_el$39, "width", "100%");
                            _$insertNode(_el$40, _el$41);
                            _$insertNode(_el$40, _el$43);
                            _$use(el => {
                              if (el) rowRefs.set(wtKey, el);else rowRefs.delete(wtKey);
                            }, _el$40);
                            _$setProp(_el$40, "flexDirection", "row");
                            _$setProp(_el$40, "justifyContent", "space-between");
                            _$setProp(_el$40, "alignItems", "center");
                            _$setProp(_el$40, "width", "100%");
                            _$setProp(_el$40, "paddingX", 3);
                            _$setProp(_el$40, "onMouseOver", () => rowHover.onEnter(wtKey));
                            _$setProp(_el$40, "onMouseOut", () => rowHover.onLeave(wtKey));
                            _$setProp(_el$40, "onMouseUp", event => {
                              if (event.button !== undefined && event.button !== MouseButton.LEFT) {
                                return;
                              }
                              setSelectedKey(wtKey);
                              activateSwitcherRow({
                                kind: "worktree",
                                key: wtKey,
                                project: projGroup().project,
                                worktree: wt(),
                                directlyMatched: wtGroup().directlyMatched
                              });
                            });
                            _$insertNode(_el$41, _el$42);
                            _$setProp(_el$41, "flexDirection", "row");
                            _$setProp(_el$41, "columnGap", 1);
                            _$setProp(_el$41, "flexGrow", 1);
                            _$setProp(_el$41, "flexShrink", 1);
                            _$setProp(_el$41, "overflow", "hidden");
                            _$setProp(_el$42, "selectable", false);
                            _$setProp(_el$42, "wrapMode", "none");
                            _$insert(_el$42, () => worktreeGlyph(rowStatus(), wt().isCurrent));
                            _$insert(_el$41, _$createComponent(HoverMarqueeText, {
                              renderer: getRenderer,
                              get text() {
                                return displayLabel().title;
                              },
                              get active() {
                                return isWtSelected() || hoveredKey() === wtKey;
                              },
                              get fg() {
                                return _$memo(() => !!isWtSelected())() ? focusedRowText : dialogTheme.text.base;
                              },
                              get attributes() {
                                return TextAttributes.BOLD;
                              },
                              flexShrink: 1
                            }), null);
                            _$insert(_el$41, _$createComponent(Show, {
                              get when() {
                                return displayLabel().subtitle;
                              },
                              children: sub => (() => {
                                var _el$52 = _$createElement("box");
                                _$setProp(_el$52, "paddingLeft", 1);
                                _$setProp(_el$52, "flexShrink", 2);
                                _$setProp(_el$52, "overflow", "hidden");
                                _$setProp(_el$52, "shouldFill", false);
                                _$insert(_el$52, _$createComponent(HoverMarqueeText, {
                                  renderer: getRenderer,
                                  get text() {
                                    return sub();
                                  },
                                  get active() {
                                    return isWtSelected() || hoveredKey() === wtKey;
                                  },
                                  get fg() {
                                    return _$memo(() => !!isWtSelected())() ? focusedRowText : _$memo(() => !!wt().isCanonical)() ? dialogTheme.text.muted : dialogTheme.text.faint;
                                  },
                                  flexShrink: 2
                                }));
                                return _el$52;
                              })()
                            }), null);
                            _$insertNode(_el$43, _el$44);
                            _$setProp(_el$43, "flexDirection", "row");
                            _$setProp(_el$43, "columnGap", 1);
                            _$setProp(_el$43, "flexShrink", 0);
                            _$insertNode(_el$44, _el$45);
                            _$setProp(_el$44, "onMouseUp", event => {
                              if (!(isWtSelected() || hoveredKey() === wtKey)) {
                                return;
                              }
                              event.stopPropagation();
                              userMovedSelection = true;
                              setSelectedKey(wtKey);
                              if (!closeDialog()) return;
                              const curWt = wt();
                              void ctrl.createSessionInDirectory(curWt.directory, `Started session in ${dirBasename(curWt.directory)}`, projGroup().project.id);
                            });
                            _$setProp(_el$45, "selectable", false);
                            _$setProp(_el$45, "wrapMode", "none");
                            _$insert(_el$45, () => isWtSelected() || hoveredKey() === wtKey ? "+ new" : "     ");
                            _$insert(_el$43, _$createComponent(Show, {
                              get when() {
                                return statusLabel(rowStatus(), rowStatusDetail());
                              },
                              children: badge => (() => {
                                var _el$53 = _$createElement("text");
                                _$setProp(_el$53, "selectable", false);
                                _$setProp(_el$53, "wrapMode", "none");
                                _$insert(_el$53, badge);
                                _$effect(_$p => _$setProp(_el$53, "fg", isWtSelected() ? focusedRowText : dialogStatusColor(rowStatus(), wt().isCurrent), _$p));
                                return _el$53;
                              })()
                            }), null);
                            _$insert(_el$43, _$createComponent(Show, {
                              get when() {
                                return wt().dirtyCount > 0;
                              },
                              get children() {
                                var _el$46 = _$createElement("text"),
                                  _el$47 = _$createTextNode(`~`);
                                _$insertNode(_el$46, _el$47);
                                _$setProp(_el$46, "selectable", false);
                                _$setProp(_el$46, "wrapMode", "none");
                                _$insert(_el$46, () => wt().dirtyCount, null);
                                _$effect(_$p => _$setProp(_el$46, "fg", isWtSelected() ? focusedRowText : dialogTheme.text.muted, _$p));
                                return _el$46;
                              }
                            }), null);
                            _$insert(_el$43, _$createComponent(Show, {
                              get when() {
                                return wt().ahead > 0;
                              },
                              get children() {
                                var _el$48 = _$createElement("text"),
                                  _el$49 = _$createTextNode(`↑`);
                                _$insertNode(_el$48, _el$49);
                                _$setProp(_el$48, "selectable", false);
                                _$setProp(_el$48, "wrapMode", "none");
                                _$insert(_el$48, () => wt().ahead, null);
                                _$effect(_$p => _$setProp(_el$48, "fg", isWtSelected() ? focusedRowText : dialogTheme.text.faint, _$p));
                                return _el$48;
                              }
                            }), null);
                            _$insert(_el$43, _$createComponent(Show, {
                              get when() {
                                return wt().behind > 0;
                              },
                              get children() {
                                var _el$50 = _$createElement("text"),
                                  _el$51 = _$createTextNode(`↓`);
                                _$insertNode(_el$50, _el$51);
                                _$setProp(_el$50, "selectable", false);
                                _$setProp(_el$50, "wrapMode", "none");
                                _$insert(_el$50, () => wt().behind, null);
                                _$effect(_$p => _$setProp(_el$50, "fg", isWtSelected() ? focusedRowText : dialogTheme.text.faint, _$p));
                                return _el$50;
                              }
                            }), null);
                            _$insert(_el$39, _$createComponent(For, {
                              get each() {
                                return sessionIDs();
                              },
                              children: (sessID, sessIdx) => {
                                const sessKey = `session:${sessID}`;
                                const sessionAccessor = createMemo(() => wtGroup().sessions.find(s => s.id === sessID));
                                const isSessSelected = () => selectedRow()?.key === sessKey;
                                const isLast = () => sessIdx() === sessionIDs().length - 1;
                                return _$createComponent(Show, {
                                  get when() {
                                    return sessionAccessor();
                                  },
                                  children: session => (() => {
                                    var _el$54 = _$createElement("box"),
                                      _el$55 = _$createElement("box"),
                                      _el$56 = _$createElement("text"),
                                      _el$57 = _$createElement("text"),
                                      _el$58 = _$createElement("box");
                                    _$insertNode(_el$54, _el$55);
                                    _$insertNode(_el$54, _el$58);
                                    _$use(el => {
                                      if (el) rowRefs.set(sessKey, el);else rowRefs.delete(sessKey);
                                    }, _el$54);
                                    _$setProp(_el$54, "flexDirection", "row");
                                    _$setProp(_el$54, "justifyContent", "space-between");
                                    _$setProp(_el$54, "alignItems", "center");
                                    _$setProp(_el$54, "width", "100%");
                                    _$setProp(_el$54, "paddingLeft", 5);
                                    _$setProp(_el$54, "paddingRight", 3);
                                    _$setProp(_el$54, "onMouseOver", () => rowHover.onEnter(sessKey));
                                    _$setProp(_el$54, "onMouseOut", () => rowHover.onLeave(sessKey));
                                    _$setProp(_el$54, "onMouseUp", event => {
                                      setSelectedKey(sessKey);
                                      if (event.button === MouseButton.RIGHT) {
                                        event.stopPropagation();
                                        const curSess = session();
                                        const curWt = wt();
                                        const projID = projGroup().project.id;
                                        if (!closeDialog()) {
                                          return;
                                        }
                                        void ctrl.openSessionContextMenu(curSess, curWt.directory, projID);
                                        return;
                                      }
                                      if (event.button !== undefined && event.button !== MouseButton.LEFT) {
                                        return;
                                      }
                                      const matchedRow = filtered().selectableRows.find(r => r.key === sessKey);
                                      activateSwitcherRow(matchedRow ?? {
                                        kind: "session",
                                        key: sessKey,
                                        project: projGroup().project,
                                        worktree: wt(),
                                        session: session(),
                                        isLastSession: isLast(),
                                        directlyMatched: false
                                      });
                                    });
                                    _$insertNode(_el$55, _el$56);
                                    _$insertNode(_el$55, _el$57);
                                    _$setProp(_el$55, "flexDirection", "row");
                                    _$setProp(_el$55, "columnGap", 1);
                                    _$setProp(_el$55, "flexGrow", 1);
                                    _$setProp(_el$55, "flexShrink", 1);
                                    _$setProp(_el$55, "overflow", "hidden");
                                    _$setProp(_el$56, "selectable", false);
                                    _$setProp(_el$56, "wrapMode", "none");
                                    _$insert(_el$56, () => isLast() ? "└─" : "├─");
                                    _$setProp(_el$57, "selectable", false);
                                    _$setProp(_el$57, "wrapMode", "none");
                                    _$insert(_el$57, () => statusGlyph(session().status, session().isCurrent));
                                    _$insert(_el$55, _$createComponent(HoverMarqueeText, {
                                      renderer: getRenderer,
                                      get text() {
                                        return session().title;
                                      },
                                      get active() {
                                        return isSessSelected() || hoveredKey() === sessKey;
                                      },
                                      get fg() {
                                        return _$memo(() => !!isSessSelected())() ? focusedRowText : _$memo(() => !!(session().isCurrent || hoveredKey() === sessKey))() ? dialogTheme.text.base : dialogTheme.text.muted;
                                      },
                                      get attributes() {
                                        return _$memo(() => !!session().isCurrent)() ? TextAttributes.BOLD : TextAttributes.NONE;
                                      },
                                      flexShrink: 1
                                    }), null);
                                    _$setProp(_el$58, "flexDirection", "row");
                                    _$setProp(_el$58, "columnGap", 1);
                                    _$setProp(_el$58, "flexShrink", 0);
                                    _$insert(_el$58, _$createComponent(Show, {
                                      get when() {
                                        return statusLabel(session().status, session().statusDetail) ?? (session().isCurrent ? "active" : undefined);
                                      },
                                      children: badge => (() => {
                                        var _el$59 = _$createElement("text");
                                        _$setProp(_el$59, "selectable", false);
                                        _$setProp(_el$59, "wrapMode", "none");
                                        _$insert(_el$59, badge);
                                        _$effect(_$p => _$setProp(_el$59, "fg", isSessSelected() ? focusedRowText : session().status !== "idle" ? dialogStatusColor(session().status, session().isCurrent) : dialogTheme.text.faint, _$p));
                                        return _el$59;
                                      })()
                                    }));
                                    _$effect(_p$ => {
                                      var _v$26 = rowBg(sessKey),
                                        _v$27 = isSessSelected() ? focusedRowText : dialogTheme.text.faint,
                                        _v$28 = isSessSelected() ? focusedRowText : dialogStatusColor(session().status, session().isCurrent);
                                      _v$26 !== _p$.e && (_p$.e = _$setProp(_el$54, "backgroundColor", _v$26, _p$.e));
                                      _v$27 !== _p$.t && (_p$.t = _$setProp(_el$56, "fg", _v$27, _p$.t));
                                      _v$28 !== _p$.a && (_p$.a = _$setProp(_el$57, "fg", _v$28, _p$.a));
                                      return _p$;
                                    }, {
                                      e: undefined,
                                      t: undefined,
                                      a: undefined
                                    });
                                    return _el$54;
                                  })()
                                });
                              }
                            }), null);
                            _$effect(_p$ => {
                              var _v$21 = wtIdx() > 0 ? 1 : 0,
                                _v$22 = rowBg(wtKey),
                                _v$23 = isWtSelected() ? focusedRowText : dialogStatusColor(rowStatus(), wt().isCurrent),
                                _v$24 = TextAttributes.BOLD,
                                _v$25 = isWtSelected() ? focusedRowText : dialogTheme.text.action.primary.selected;
                              _v$21 !== _p$.e && (_p$.e = _$setProp(_el$39, "marginTop", _v$21, _p$.e));
                              _v$22 !== _p$.t && (_p$.t = _$setProp(_el$40, "backgroundColor", _v$22, _p$.t));
                              _v$23 !== _p$.a && (_p$.a = _$setProp(_el$42, "fg", _v$23, _p$.a));
                              _v$24 !== _p$.o && (_p$.o = _$setProp(_el$42, "attributes", _v$24, _p$.o));
                              _v$25 !== _p$.i && (_p$.i = _$setProp(_el$45, "fg", _v$25, _p$.i));
                              return _p$;
                            }, {
                              e: undefined,
                              t: undefined,
                              a: undefined,
                              o: undefined,
                              i: undefined
                            });
                            return _el$39;
                          })();
                        }
                      });
                    }
                  }), null);
                  _$effect(_p$ => {
                    var _v$17 = projIdx() > 0 ? 1 : 0,
                      _v$18 = dialogTheme.hue.accent[400],
                      _v$19 = TextAttributes.BOLD,
                      _v$20 = dialogTheme.text.faint;
                    _v$17 !== _p$.e && (_p$.e = _$setProp(_el$34, "marginTop", _v$17, _p$.e));
                    _v$18 !== _p$.t && (_p$.t = _$setProp(_el$36, "fg", _v$18, _p$.t));
                    _v$19 !== _p$.a && (_p$.a = _$setProp(_el$36, "attributes", _v$19, _p$.a));
                    _v$20 !== _p$.o && (_p$.o = _$setProp(_el$37, "fg", _v$20, _p$.o));
                    return _p$;
                  }, {
                    e: undefined,
                    t: undefined,
                    a: undefined,
                    o: undefined
                  });
                  return _el$34;
                })();
              }
            });
          }
        });
      }
    }));
    _$insertNode(_el$0, _el$1);
    _$insertNode(_el$0, _el$14);
    _$insertNode(_el$0, _el$19);
    _$insertNode(_el$0, _el$28);
    _$setProp(_el$0, "flexDirection", "row");
    _$setProp(_el$0, "columnGap", 3);
    _$setProp(_el$0, "paddingX", 4);
    _$setProp(_el$0, "paddingTop", 1);
    _$setProp(_el$0, "flexWrap", "wrap");
    _$insertNode(_el$1, _el$10);
    _$insertNode(_el$1, _el$12);
    _$setProp(_el$1, "flexDirection", "column");
    _$setProp(_el$1, "onMouseOver", () => footerHover.onEnter("worktree"));
    _$setProp(_el$1, "onMouseOut", () => footerHover.onLeave("worktree"));
    _$setProp(_el$1, "onMouseUp", () => triggerNewWorktree());
    _$insertNode(_el$10, _$createTextNode(`new worktree`));
    _$setProp(_el$10, "selectable", false);
    _$setProp(_el$10, "wrapMode", "none");
    _$insertNode(_el$12, _$createTextNode(`ctrl+n`));
    _$setProp(_el$12, "selectable", false);
    _$setProp(_el$12, "wrapMode", "none");
    _$insertNode(_el$14, _el$15);
    _$insertNode(_el$14, _el$17);
    _$setProp(_el$14, "flexDirection", "column");
    _$setProp(_el$14, "onMouseOver", () => footerHover.onEnter("session"));
    _$setProp(_el$14, "onMouseOut", () => footerHover.onLeave("session"));
    _$setProp(_el$14, "onMouseUp", () => triggerNewSession());
    _$insertNode(_el$15, _$createTextNode(`new session`));
    _$setProp(_el$15, "selectable", false);
    _$setProp(_el$15, "wrapMode", "none");
    _$insertNode(_el$17, _$createTextNode(`ctrl+s`));
    _$setProp(_el$17, "selectable", false);
    _$setProp(_el$17, "wrapMode", "none");
    _$insertNode(_el$19, _el$20);
    _$insertNode(_el$19, _el$22);
    _$setProp(_el$19, "flexDirection", "column");
    _$setProp(_el$19, "onMouseOver", () => footerHover.onEnter("editor"));
    _$setProp(_el$19, "onMouseOut", () => footerHover.onLeave("editor"));
    _$setProp(_el$19, "onMouseUp", () => triggerOpenEditor());
    _$insertNode(_el$20, _$createTextNode(`open editor`));
    _$setProp(_el$20, "selectable", false);
    _$setProp(_el$20, "wrapMode", "none");
    _$insertNode(_el$22, _$createTextNode(`ctrl+o`));
    _$setProp(_el$22, "selectable", false);
    _$setProp(_el$22, "wrapMode", "none");
    _$insert(_el$0, _$createComponent(Show, {
      get when() {
        return canRemoveSelected();
      },
      get children() {
        var _el$24 = _$createElement("box"),
          _el$25 = _$createElement("text"),
          _el$26 = _$createElement("text");
        _$insertNode(_el$24, _el$25);
        _$insertNode(_el$24, _el$26);
        _$setProp(_el$24, "flexDirection", "column");
        _$setProp(_el$24, "onMouseOver", () => footerHover.onEnter("remove"));
        _$setProp(_el$24, "onMouseOut", () => footerHover.onLeave("remove"));
        _$setProp(_el$24, "onMouseUp", () => triggerRemoveSelected());
        _$setProp(_el$25, "selectable", false);
        _$setProp(_el$25, "wrapMode", "none");
        _$insert(_el$25, () => selectedRow()?.kind === "session" ? "delete session" : "remove");
        _$insertNode(_el$26, _$createTextNode(`ctrl+x`));
        _$setProp(_el$26, "selectable", false);
        _$setProp(_el$26, "wrapMode", "none");
        _$effect(_p$ => {
          var _v$ = hoveredFooterAction() === "remove" ? dialogTheme.text.feedback.warning.base : footerTheme.text.base,
            _v$2 = footerTheme.text.muted;
          _v$ !== _p$.e && (_p$.e = _$setProp(_el$25, "fg", _v$, _p$.e));
          _v$2 !== _p$.t && (_p$.t = _$setProp(_el$26, "fg", _v$2, _p$.t));
          return _p$;
        }, {
          e: undefined,
          t: undefined
        });
        return _el$24;
      }
    }), _el$28);
    _$insertNode(_el$28, _el$29);
    _$insertNode(_el$28, _el$30);
    _$setProp(_el$28, "flexDirection", "column");
    _$setProp(_el$28, "onMouseOver", () => footerHover.onEnter("all"));
    _$setProp(_el$28, "onMouseOut", () => footerHover.onLeave("all"));
    _$setProp(_el$28, "onMouseUp", () => triggerToggleAll());
    _$setProp(_el$29, "selectable", false);
    _$setProp(_el$29, "wrapMode", "none");
    _$insert(_el$29, () => showAll() ? "current repo" : "all repos");
    _$insertNode(_el$30, _$createTextNode(`ctrl+a`));
    _$setProp(_el$30, "selectable", false);
    _$setProp(_el$30, "wrapMode", "none");
    _$effect(_p$ => {
      var _v$3 = dialogTheme.text.base,
        _v$4 = TextAttributes.BOLD,
        _v$5 = dialogTheme.text.muted,
        _v$6 = query(),
        _v$7 = dialogTheme.text.base,
        _v$8 = dialogTheme.text.base,
        _v$9 = dialogTheme.text.faint,
        _v$0 = dialogTheme.text.formfield.focused,
        _v$1 = hoveredFooterAction() === "worktree" ? dialogTheme.text.action.primary.selected : footerTheme.text.base,
        _v$10 = footerTheme.text.muted,
        _v$11 = hoveredFooterAction() === "session" ? dialogTheme.text.action.primary.selected : footerTheme.text.base,
        _v$12 = footerTheme.text.muted,
        _v$13 = hoveredFooterAction() === "editor" ? dialogTheme.text.action.primary.selected : footerTheme.text.base,
        _v$14 = footerTheme.text.muted,
        _v$15 = hoveredFooterAction() === "all" ? dialogTheme.text.action.primary.selected : footerTheme.text.base,
        _v$16 = footerTheme.text.muted;
      _v$3 !== _p$.e && (_p$.e = _$setProp(_el$3, "fg", _v$3, _p$.e));
      _v$4 !== _p$.t && (_p$.t = _$setProp(_el$3, "attributes", _v$4, _p$.t));
      _v$5 !== _p$.a && (_p$.a = _$setProp(_el$4, "fg", _v$5, _p$.a));
      _v$6 !== _p$.o && (_p$.o = _$setProp(_el$7, "value", _v$6, _p$.o));
      _v$7 !== _p$.i && (_p$.i = _$setProp(_el$7, "textColor", _v$7, _p$.i));
      _v$8 !== _p$.n && (_p$.n = _$setProp(_el$7, "focusedTextColor", _v$8, _p$.n));
      _v$9 !== _p$.s && (_p$.s = _$setProp(_el$7, "placeholderColor", _v$9, _p$.s));
      _v$0 !== _p$.h && (_p$.h = _$setProp(_el$7, "cursorColor", _v$0, _p$.h));
      _v$1 !== _p$.r && (_p$.r = _$setProp(_el$10, "fg", _v$1, _p$.r));
      _v$10 !== _p$.d && (_p$.d = _$setProp(_el$12, "fg", _v$10, _p$.d));
      _v$11 !== _p$.l && (_p$.l = _$setProp(_el$15, "fg", _v$11, _p$.l));
      _v$12 !== _p$.u && (_p$.u = _$setProp(_el$17, "fg", _v$12, _p$.u));
      _v$13 !== _p$.c && (_p$.c = _$setProp(_el$20, "fg", _v$13, _p$.c));
      _v$14 !== _p$.w && (_p$.w = _$setProp(_el$22, "fg", _v$14, _p$.w));
      _v$15 !== _p$.m && (_p$.m = _$setProp(_el$29, "fg", _v$15, _p$.m));
      _v$16 !== _p$.f && (_p$.f = _$setProp(_el$30, "fg", _v$16, _p$.f));
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
      r: undefined,
      d: undefined,
      l: undefined,
      u: undefined,
      c: undefined,
      w: undefined,
      m: undefined,
      f: undefined
    });
    return _el$;
  })();
};

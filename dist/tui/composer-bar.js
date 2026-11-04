import { effect as _$effect } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
/** @jsxImportSource @opentui/solid */
import { MouseButton, TextAttributes } from "@opentui/core";
import { Show, createEffect, createMemo } from "solid-js";
import { formatComposerWorkspaceBadge } from "../model.js";
import { createHoverFlagSignal } from "./hover.js";
import { HoverMarqueeText } from "./marquee.js";
import { resolveSidebarHoverBg } from "./types.js";
function isLeftClick(event) {
  return event.button === undefined || event.button === MouseButton.LEFT;
}

/**
 * Compact 1-line active workspace/branch bar rendered in `session.composer.top`
 * directly above the prompt composer so long repo names never clip the branch in
 * OpenCode's narrow 22-col left session bar, with a quick toggle for left-tab mode.
 */
export const WorkspaceComposerBar = props => {
  const {
    ctrl
  } = props;
  const {
    context
  } = ctrl;
  const getRenderer = () => context.renderer;
  const branchHover = createHoverFlagSignal();
  const branchHovered = branchHover.hovered;
  const modeHover = createHoverFlagSignal();
  const modeHovered = modeHover.hovered;
  const attentionHover = createHoverFlagSignal();
  const attentionHovered = attentionHover.hovered;
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
  const activeWorktree = createMemo(() => {
    const proj = currentProject();
    if (!proj) return undefined;
    const active = proj.worktrees.find(wt => wt.isCurrent);
    if (active) return active;
    const activeDir = ctrl.resolveActiveDirectory(props.sessionID);
    if (activeDir) {
      return proj.worktrees.find(wt => wt.directory === activeDir);
    }
    return proj.worktrees[0];
  });
  const otherBlockedWorktreeCount = createMemo(() => {
    const proj = currentProject();
    const activeWt = activeWorktree();
    if (!proj) return 0;
    return proj.worktrees.filter(wt => wt.directory !== activeWt?.directory && wt.status === "blocked").length;
  });
  const badge = createMemo(() => {
    const wt = activeWorktree();
    return wt ? formatComposerWorkspaceBadge(wt) : undefined;
  });
  const tabsEnabled = createMemo(() => Boolean(context.ui.tabs?.enabled()));
  const tabsModeLabel = createMemo(() => ctrl.leftTabsMode() === "grouped" ? "tabs: grouped" : "tabs: worktree");
  return _$createComponent(Show, {
    get when() {
      return badge();
    },
    children: info => (() => {
      var _el$ = _$createElement("box"),
        _el$2 = _$createElement("box"),
        _el$3 = _$createElement("box");
      _$insertNode(_el$, _el$2);
      _$setProp(_el$, "flexDirection", "row");
      _$setProp(_el$, "justifyContent", "space-between");
      _$setProp(_el$, "alignItems", "center");
      _$setProp(_el$, "width", "100%");
      _$setProp(_el$, "height", 1);
      _$setProp(_el$, "flexShrink", 0);
      _$setProp(_el$, "paddingLeft", 1);
      _$setProp(_el$, "paddingRight", 1);
      _$setProp(_el$, "gap", 2);
      _$setProp(_el$, "shouldFill", false);
      _$insertNode(_el$2, _el$3);
      _$setProp(_el$2, "flexDirection", "row");
      _$setProp(_el$2, "alignItems", "center");
      _$setProp(_el$2, "flexGrow", 1);
      _$setProp(_el$2, "flexShrink", 1);
      _$setProp(_el$2, "minWidth", 0);
      _$setProp(_el$2, "overflow", "hidden");
      _$setProp(_el$2, "gap", 1);
      _$setProp(_el$2, "shouldFill", false);
      _$setProp(_el$3, "flexDirection", "row");
      _$setProp(_el$3, "alignItems", "center");
      _$setProp(_el$3, "flexShrink", 1);
      _$setProp(_el$3, "minWidth", 0);
      _$setProp(_el$3, "overflow", "hidden");
      _$setProp(_el$3, "gap", 1);
      _$setProp(_el$3, "onMouseOver", () => branchHover.onEnter());
      _$setProp(_el$3, "onMouseOut", () => branchHover.onLeave());
      _$setProp(_el$3, "onMouseUp", event => {
        if (!isLeftClick(event)) return;
        event.stopPropagation();
        props.onOpenSwitcher();
      });
      _$insert(_el$3, _$createComponent(HoverMarqueeText, {
        renderer: getRenderer,
        get text() {
          return info().primaryText;
        },
        get active() {
          return branchHovered();
        },
        get fg() {
          return _$memo(() => !!branchHovered())() ? context.theme.text.action.primary.selected : context.theme.text.muted;
        },
        get attributes() {
          return _$memo(() => !!branchHovered())() ? TextAttributes.BOLD : TextAttributes.NONE;
        },
        flexShrink: 1
      }), null);
      _$insert(_el$3, _$createComponent(Show, {
        get when() {
          return info().gitBadge;
        },
        children: gitText => (() => {
          var _el$8 = _$createElement("text");
          _$setProp(_el$8, "selectable", false);
          _$setProp(_el$8, "wrapMode", "none");
          _$setProp(_el$8, "flexShrink", 0);
          _$insert(_el$8, gitText);
          _$effect(_$p => _$setProp(_el$8, "fg", branchHovered() ? context.theme.text.base : context.theme.text.faint, _$p));
          return _el$8;
        })()
      }), null);
      _$insert(_el$2, _$createComponent(Show, {
        get when() {
          return otherBlockedWorktreeCount() > 0;
        },
        get children() {
          var _el$4 = _$createElement("box"),
            _el$5 = _$createElement("text");
          _$insertNode(_el$4, _el$5);
          _$setProp(_el$4, "flexDirection", "row");
          _$setProp(_el$4, "flexShrink", 0);
          _$setProp(_el$4, "onMouseOver", () => attentionHover.onEnter());
          _$setProp(_el$4, "onMouseOut", () => attentionHover.onLeave());
          _$setProp(_el$4, "onMouseUp", event => {
            if (!isLeftClick(event)) return;
            event.stopPropagation();
            props.onOpenSwitcher();
          });
          _$setProp(_el$5, "selectable", false);
          _$setProp(_el$5, "wrapMode", "none");
          _$insert(_el$5, () => `⚠ ${otherBlockedWorktreeCount()}`);
          _$effect(_p$ => {
            var _v$ = attentionHovered() ? hoverBg() : undefined,
              _v$2 = attentionHovered(),
              _v$3 = context.theme.text.feedback.warning.base,
              _v$4 = TextAttributes.BOLD;
            _v$ !== _p$.e && (_p$.e = _$setProp(_el$4, "backgroundColor", _v$, _p$.e));
            _v$2 !== _p$.t && (_p$.t = _$setProp(_el$4, "shouldFill", _v$2, _p$.t));
            _v$3 !== _p$.a && (_p$.a = _$setProp(_el$5, "fg", _v$3, _p$.a));
            _v$4 !== _p$.o && (_p$.o = _$setProp(_el$5, "attributes", _v$4, _p$.o));
            return _p$;
          }, {
            e: undefined,
            t: undefined,
            a: undefined,
            o: undefined
          });
          return _el$4;
        }
      }), null);
      _$insert(_el$, _$createComponent(Show, {
        get when() {
          return tabsEnabled();
        },
        get children() {
          var _el$6 = _$createElement("box"),
            _el$7 = _$createElement("text");
          _$insertNode(_el$6, _el$7);
          _$setProp(_el$6, "flexDirection", "row");
          _$setProp(_el$6, "flexShrink", 0);
          _$setProp(_el$6, "onMouseOver", () => modeHover.onEnter());
          _$setProp(_el$6, "onMouseOut", () => modeHover.onLeave());
          _$setProp(_el$6, "onMouseUp", event => {
            if (!isLeftClick(event)) return;
            event.stopPropagation();
            void ctrl.toggleLeftTabsMode();
          });
          _$setProp(_el$7, "selectable", false);
          _$setProp(_el$7, "wrapMode", "none");
          _$insert(_el$7, tabsModeLabel);
          _$effect(_p$ => {
            var _v$5 = modeHovered() ? hoverBg() : undefined,
              _v$6 = modeHovered(),
              _v$7 = modeHovered() ? context.theme.text.action.primary.selected : context.theme.text.faint,
              _v$8 = modeHovered() ? TextAttributes.BOLD : TextAttributes.NONE;
            _v$5 !== _p$.e && (_p$.e = _$setProp(_el$6, "backgroundColor", _v$5, _p$.e));
            _v$6 !== _p$.t && (_p$.t = _$setProp(_el$6, "shouldFill", _v$6, _p$.t));
            _v$7 !== _p$.a && (_p$.a = _$setProp(_el$7, "fg", _v$7, _p$.a));
            _v$8 !== _p$.o && (_p$.o = _$setProp(_el$7, "attributes", _v$8, _p$.o));
            return _p$;
          }, {
            e: undefined,
            t: undefined,
            a: undefined,
            o: undefined
          });
          return _el$6;
        }
      }), null);
      _$effect(_p$ => {
        var _v$9 = branchHovered() ? hoverBg() : undefined,
          _v$0 = branchHovered();
        _v$9 !== _p$.e && (_p$.e = _$setProp(_el$3, "backgroundColor", _v$9, _p$.e));
        _v$0 !== _p$.t && (_p$.t = _$setProp(_el$3, "shouldFill", _v$0, _p$.t));
        return _p$;
      }, {
        e: undefined,
        t: undefined
      });
      return _el$;
    })()
  });
};

import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { use as _$use } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
/** @jsxImportSource @opentui/solid */

import { createEffect, createSignal, onCleanup } from "solid-js";
import { MARQUEE_GAP, computeMarqueeScrollX } from "../model.js";
/**
 * Single-line text label that clips cleanly at rest and scrolls continuously
 * in one direction (`scrollX` seamless ticker loop) while hovered or selected
 * when the label is wider than its available flex column.
 */
export const HoverMarqueeText = props => {
  let textRef;
  const [loopState, setLoopState] = createSignal();
  const activeLoop = () => {
    const cur = loopState();
    return cur && props.active && cur.baseText === props.text ? cur : undefined;
  };
  createEffect(() => {
    const currentText = props.text;
    if (!props.active) {
      setLoopState(undefined);
      if (textRef && !textRef.isDestroyed && textRef.scrollX !== 0) {
        textRef.scrollX = 0;
      }
      return;
    }
    const renderer = props.renderer();
    let elapsedMs = 0;
    let currentLoop;
    let resizeResetPending = false;
    const handleResize = () => {
      resizeResetPending = true;
      currentLoop = undefined;
      setLoopState(undefined);
      if (textRef && !textRef.isDestroyed && textRef.scrollX !== 0) {
        textRef.scrollX = 0;
      }
    };
    if (typeof renderer.on === "function") {
      renderer.on("resize", handleResize);
    }
    const ensureLoopState = requestHostRender => {
      if (!textRef || textRef.isDestroyed) return undefined;
      if (currentLoop && currentLoop.baseText === currentText) {
        return currentLoop;
      }
      const maxScroll = typeof textRef.maxScrollX === "number" ? textRef.maxScrollX : 0;
      const baseCols = typeof textRef.scrollWidth === "number" ? textRef.scrollWidth : 0;
      const viewportWidth = typeof textRef.width === "number" ? textRef.width : 0;
      if (maxScroll <= 0 || baseCols <= 0 || viewportWidth <= 0) {
        return undefined;
      }
      currentLoop = {
        baseText: currentText,
        periodCols: baseCols + MARQUEE_GAP.length,
        viewportWidth
      };
      setLoopState(currentLoop);
      if (requestHostRender) {
        renderer.requestRender();
      }
      return currentLoop;
    };
    ensureLoopState(false);
    const step = (deltaTime, requestHostRender = false) => {
      if (!textRef || textRef.isDestroyed) return;
      if (resizeResetPending) {
        resizeResetPending = false;
        elapsedMs = 0;
      }
      const state = ensureLoopState(requestHostRender);
      if (!state) {
        if (textRef.scrollX !== 0) textRef.scrollX = 0;
        return;
      }
      const maxScroll = typeof textRef.maxScrollX === "number" ? textRef.maxScrollX : 0;
      if (maxScroll <= 0) return;
      elapsedMs += deltaTime;
      const next = Math.min(computeMarqueeScrollX(elapsedMs, state.periodCols), maxScroll);
      if (textRef.scrollX !== next) {
        textRef.scrollX = next;
        if (requestHostRender) {
          renderer.requestRender();
        }
      }
    };
    const stop = typeof renderer.onAnimationTick === "function" ? renderer.onAnimationTick(16, deltaTime => {
      step(deltaTime, false);
    }) : (() => {
      const timer = setInterval(() => step(64, true), 64);
      return () => clearInterval(timer);
    })();
    onCleanup(() => {
      stop();
      if (typeof renderer.off === "function") {
        renderer.off("resize", handleResize);
      }
      currentLoop = undefined;
      setLoopState(undefined);
      if (textRef && !textRef.isDestroyed && textRef.scrollX !== 0) {
        textRef.scrollX = 0;
      }
    });
  });
  return (() => {
    var _el$ = _$createElement("text");
    _$use(el => {
      textRef = el;
    }, _el$);
    _$setProp(_el$, "selectable", false);
    _$setProp(_el$, "wrapMode", "none");
    _$setProp(_el$, "truncate", false);
    _$insert(_el$, (() => {
      var _c$ = _$memo(() => !!activeLoop());
      return () => _c$() ? `${props.text}${MARQUEE_GAP}${props.text}` : props.text;
    })());
    _$effect(_p$ => {
      var _v$ = activeLoop()?.viewportWidth ?? "auto",
        _v$2 = props.fg,
        _v$3 = props.attributes,
        _v$4 = props.flexShrink ?? 1;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$, "width", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$, "fg", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp(_el$, "attributes", _v$3, _p$.a));
      _v$4 !== _p$.o && (_p$.o = _$setProp(_el$, "flexShrink", _v$4, _p$.o));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined
    });
    return _el$;
  })();
};

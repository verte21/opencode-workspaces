import { effect as _$effect } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { use as _$use } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
/** @jsxImportSource @opentui/solid */

import { createEffect, onCleanup } from "solid-js";
import { computeMarqueeScrollX } from "../model.js";

/**
 * Single-line text label that clips cleanly at rest and smoothly scrolls
 * horizontally (`scrollX`) while hovered or selected when the label is
 * wider than its available flex column.
 */
export const HoverMarqueeText = props => {
  let textRef;
  createEffect(() => {
    void props.text;
    if (!props.active) {
      if (textRef && !textRef.isDestroyed && textRef.scrollX !== 0) {
        textRef.scrollX = 0;
      }
      return;
    }
    const renderer = props.renderer();
    let elapsedMs = 0;
    const step = (deltaTime, requestHostRender = false) => {
      if (!textRef || textRef.isDestroyed) return;
      const maxScroll = typeof textRef.maxScrollX === "number" ? textRef.maxScrollX : 0;
      if (maxScroll <= 0) {
        if (textRef.scrollX !== 0) textRef.scrollX = 0;
        return;
      }
      elapsedMs += deltaTime;
      const next = computeMarqueeScrollX(elapsedMs, maxScroll);
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
    _$insert(_el$, () => props.text);
    _$effect(_p$ => {
      var _v$ = props.fg,
        _v$2 = props.attributes,
        _v$3 = props.flexShrink ?? 1;
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$, "fg", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$, "attributes", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp(_el$, "flexShrink", _v$3, _p$.a));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$;
  })();
};

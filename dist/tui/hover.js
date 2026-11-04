import { createSignal } from "solid-js";
/**
 * Provides DOM-like `mouseenter` / `mouseleave` container semantics over
 * OpenTUI's bubbling `onMouseOver` / `onMouseOut` events. When the pointer
 * moves between two child renderables inside the same container, OpenTUI
 * dispatches `out` on the previous child before synchronously dispatching
 * `over` on the next child; deferring clear to a microtask prevents false
 * hover exits, `<Show>` blinking loops, and marquee timer resets.
 */
export function createHoverKeySignal() {
  const [hoveredKey, setHoveredKey] = createSignal("");
  let pendingClearKey = "";
  const onEnter = key => {
    pendingClearKey = "";
    if (hoveredKey() !== key) {
      setHoveredKey(key);
    }
  };
  const onLeave = key => {
    if (hoveredKey() !== key) return;
    pendingClearKey = key;
    queueMicrotask(() => {
      if (pendingClearKey === key && hoveredKey() === key) {
        pendingClearKey = "";
        setHoveredKey("");
      }
    });
  };
  return {
    hoveredKey,
    onEnter,
    onLeave
  };
}
export function createHoverFlagSignal() {
  const keyHover = createHoverKeySignal();
  return {
    hovered: () => keyHover.hoveredKey() === "1",
    onEnter: () => keyHover.onEnter("1"),
    onLeave: () => keyHover.onLeave("1")
  };
}

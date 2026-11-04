import { createSignal } from "solid-js"

export interface HoverKeyController {
  readonly hoveredKey: () => string
  readonly onEnter: (key: string) => void
  readonly onLeave: (key: string) => void
}

export interface HoverFlagController {
  readonly hovered: () => boolean
  readonly onEnter: () => void
  readonly onLeave: () => void
}

/**
 * Provides DOM-like `mouseenter` / `mouseleave` container semantics over
 * OpenTUI's bubbling `onMouseOver` / `onMouseOut` events. When the pointer
 * moves between two child renderables inside the same container, OpenTUI
 * dispatches `out` on the previous child before synchronously dispatching
 * `over` on the next child; deferring clear to a microtask prevents false
 * hover exits, `<Show>` blinking loops, and marquee timer resets.
 */
export function createHoverKeySignal(): HoverKeyController {
  const [hoveredKey, setHoveredKey] = createSignal("")
  let pendingClearKey = ""

  const onEnter = (key: string) => {
    pendingClearKey = ""
    if (hoveredKey() !== key) {
      setHoveredKey(key)
    }
  }

  const onLeave = (key: string) => {
    if (hoveredKey() !== key) return
    pendingClearKey = key
    queueMicrotask(() => {
      if (pendingClearKey === key && hoveredKey() === key) {
        pendingClearKey = ""
        setHoveredKey("")
      }
    })
  }

  return { hoveredKey, onEnter, onLeave }
}

export function createHoverFlagSignal(): HoverFlagController {
  const keyHover = createHoverKeySignal()
  return {
    hovered: () => keyHover.hoveredKey() === "1",
    onEnter: () => keyHover.onEnter("1"),
    onLeave: () => keyHover.onLeave("1"),
  }
}

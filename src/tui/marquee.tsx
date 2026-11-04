/** @jsxImportSource @opentui/solid */
import type { CliRenderer, RGBA, TextRenderable } from "@opentui/core"
import { createEffect, createSignal, onCleanup } from "solid-js"
import { MARQUEE_GAP, computeMarqueeScrollX } from "../model.js"

interface ActiveLoopState {
  readonly baseText: string
  readonly periodCols: number
  readonly viewportWidth: number
}

/**
 * Single-line text label that clips cleanly at rest and scrolls continuously
 * in one direction (`scrollX` seamless ticker loop) while hovered or selected
 * when the label is wider than its available flex column.
 */
export const HoverMarqueeText = (props: {
  readonly renderer: () => CliRenderer
  readonly text: string
  readonly active: boolean
  readonly fg: string | RGBA
  readonly attributes?: number
  readonly flexShrink?: number
}) => {
  let textRef: TextRenderable | undefined
  const [loopState, setLoopState] = createSignal<ActiveLoopState>()

  const activeLoop = () => {
    const cur = loopState()
    return cur && props.active && cur.baseText === props.text ? cur : undefined
  }

  createEffect(() => {
    const currentText = props.text
    if (!props.active) {
      setLoopState(undefined)
      if (textRef && !textRef.isDestroyed && textRef.scrollX !== 0) {
        textRef.scrollX = 0
      }
      return
    }

    const renderer = props.renderer()
    let elapsedMs = 0
    let currentLoop: ActiveLoopState | undefined
    let resizeResetPending = false

    const handleResize = () => {
      resizeResetPending = true
      currentLoop = undefined
      setLoopState(undefined)
      if (textRef && !textRef.isDestroyed && textRef.scrollX !== 0) {
        textRef.scrollX = 0
      }
    }
    if (typeof renderer.on === "function") {
      renderer.on("resize", handleResize)
    }

    const ensureLoopState = (
      requestHostRender: boolean,
    ): ActiveLoopState | undefined => {
      if (!textRef || textRef.isDestroyed) return undefined
      if (currentLoop && currentLoop.baseText === currentText) {
        return currentLoop
      }
      const maxScroll =
        typeof textRef.maxScrollX === "number" ? textRef.maxScrollX : 0
      const baseCols =
        typeof textRef.scrollWidth === "number" ? textRef.scrollWidth : 0
      const viewportWidth =
        typeof textRef.width === "number" ? textRef.width : 0
      if (maxScroll <= 0 || baseCols <= 0 || viewportWidth <= 0) {
        return undefined
      }
      currentLoop = {
        baseText: currentText,
        periodCols: baseCols + MARQUEE_GAP.length,
        viewportWidth,
      }
      setLoopState(currentLoop)
      if (requestHostRender) {
        renderer.requestRender()
      }
      return currentLoop
    }

    ensureLoopState(false)

    const step = (deltaTime: number, requestHostRender = false) => {
      if (!textRef || textRef.isDestroyed) return
      if (resizeResetPending) {
        resizeResetPending = false
        elapsedMs = 0
      }
      const state = ensureLoopState(requestHostRender)
      if (!state) {
        if (textRef.scrollX !== 0) textRef.scrollX = 0
        return
      }
      const maxScroll =
        typeof textRef.maxScrollX === "number" ? textRef.maxScrollX : 0
      if (maxScroll <= 0) return

      elapsedMs += deltaTime
      const next = Math.min(
        computeMarqueeScrollX(elapsedMs, state.periodCols),
        maxScroll,
      )
      if (textRef.scrollX !== next) {
        textRef.scrollX = next
        if (requestHostRender) {
          renderer.requestRender()
        }
      }
    }

    const stop =
      typeof renderer.onAnimationTick === "function"
        ? renderer.onAnimationTick(16, (deltaTime) => {
            step(deltaTime, false)
          })
        : (() => {
            const timer = setInterval(() => step(64, true), 64)
            return () => clearInterval(timer)
          })()

    onCleanup(() => {
      stop()
      if (typeof renderer.off === "function") {
        renderer.off("resize", handleResize)
      }
      currentLoop = undefined
      setLoopState(undefined)
      if (textRef && !textRef.isDestroyed && textRef.scrollX !== 0) {
        textRef.scrollX = 0
      }
    })
  })

  return (
    <text
      ref={(el) => {
        textRef = el
      }}
      width={activeLoop()?.viewportWidth ?? "auto"}
      fg={props.fg}
      attributes={props.attributes}
      selectable={false}
      wrapMode="none"
      truncate={false}
      flexShrink={props.flexShrink ?? 1}
    >
      {activeLoop()
        ? `${props.text}${MARQUEE_GAP}${props.text}`
        : props.text}
    </text>
  )
}

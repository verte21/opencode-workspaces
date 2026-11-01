/** @jsxImportSource @opentui/solid */
import type { CliRenderer, RGBA, TextRenderable } from "@opentui/core"
import { createEffect, onCleanup } from "solid-js"
import { computeMarqueeScrollX } from "../model.js"

/**
 * Single-line text label that clips cleanly at rest and smoothly scrolls
 * horizontally (`scrollX`) while hovered or selected when the label is
 * wider than its available flex column.
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

  createEffect(() => {
    void props.text
    if (!props.active) {
      if (textRef && !textRef.isDestroyed && textRef.scrollX !== 0) {
        textRef.scrollX = 0
      }
      return
    }

    const renderer = props.renderer()
    let elapsedMs = 0
    const step = (deltaTime: number, requestHostRender = false) => {
      if (!textRef || textRef.isDestroyed) return
      const maxScroll =
        typeof textRef.maxScrollX === "number" ? textRef.maxScrollX : 0
      if (maxScroll <= 0) {
        if (textRef.scrollX !== 0) textRef.scrollX = 0
        return
      }
      elapsedMs += deltaTime
      const next = computeMarqueeScrollX(elapsedMs, maxScroll)
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
      fg={props.fg}
      attributes={props.attributes}
      selectable={false}
      wrapMode="none"
      truncate={false}
      flexShrink={props.flexShrink ?? 1}
    >
      {props.text}
    </text>
  )
}

/** @jsxImportSource @opentui/solid */
import type { CliRenderer, RGBA } from "@opentui/core";
/**
 * Single-line text label that clips cleanly at rest and smoothly scrolls
 * horizontally (`scrollX`) while hovered or selected when the label is
 * wider than its available flex column.
 */
export declare const HoverMarqueeText: (props: {
    readonly renderer: () => CliRenderer;
    readonly text: string;
    readonly active: boolean;
    readonly fg: string | RGBA;
    readonly attributes?: number;
    readonly flexShrink?: number;
}) => import("solid-js").JSX.Element;

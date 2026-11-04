export interface HoverKeyController {
    readonly hoveredKey: () => string;
    readonly onEnter: (key: string) => void;
    readonly onLeave: (key: string) => void;
}
export interface HoverFlagController {
    readonly hovered: () => boolean;
    readonly onEnter: () => void;
    readonly onLeave: () => void;
}
/**
 * Provides DOM-like `mouseenter` / `mouseleave` container semantics over
 * OpenTUI's bubbling `onMouseOver` / `onMouseOut` events. When the pointer
 * moves between two child renderables inside the same container, OpenTUI
 * dispatches `out` on the previous child before synchronously dispatching
 * `over` on the next child; deferring clear to a microtask prevents false
 * hover exits, `<Show>` blinking loops, and marquee timer resets.
 */
export declare function createHoverKeySignal(): HoverKeyController;
export declare function createHoverFlagSignal(): HoverFlagController;

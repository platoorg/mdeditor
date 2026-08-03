import { iconForFullscreen } from "./icons";

export interface FullscreenState {
  readonly fullscreen: boolean;
  readonly bodyOverflow: "" | "hidden";
  readonly title: string;
  readonly icon: string;
}

const EXIT_TITLE = "Exit fullscreen (Esc)";
const ENTER_TITLE = "Fullscreen writing mode";

function stateFor(fullscreen: boolean): FullscreenState {
  return {
    fullscreen,
    bodyOverflow: fullscreen ? "hidden" : "",
    title: fullscreen ? EXIT_TITLE : ENTER_TITLE,
    icon: iconForFullscreen(fullscreen),
  };
}

/** Pure state transition for clicking the fullscreen toggle button. */
export function toggleFullscreen(currentlyFullscreen: boolean): FullscreenState {
  return stateFor(!currentlyFullscreen);
}

/** The state to apply when Escape is pressed while fullscreen is active. */
export function exitFullscreen(): FullscreenState {
  return stateFor(false);
}

/** Whether a keydown event should trigger exiting fullscreen mode. */
export function shouldExitOnKeydown(key: string, currentlyFullscreen: boolean): boolean {
  return key === "Escape" && currentlyFullscreen;
}

import { describe, expect, it } from "vitest";
import { COLLAPSE_ICON, EXPAND_ICON } from "../src/icons";
import { exitFullscreen, shouldExitOnKeydown, toggleFullscreen } from "../src/fullscreen";

describe("toggleFullscreen", () => {
  it("enters fullscreen from the non-fullscreen state", () => {
    const state = toggleFullscreen(false);
    expect(state).toEqual({
      fullscreen: true,
      bodyOverflow: "hidden",
      title: "Exit fullscreen (Esc)",
      icon: COLLAPSE_ICON,
    });
  });

  it("exits fullscreen from the fullscreen state", () => {
    const state = toggleFullscreen(true);
    expect(state).toEqual({
      fullscreen: false,
      bodyOverflow: "",
      title: "Fullscreen writing mode",
      icon: EXPAND_ICON,
    });
  });
});

describe("exitFullscreen", () => {
  it("always yields the non-fullscreen state regardless of current state", () => {
    expect(exitFullscreen().fullscreen).toBe(false);
    expect(exitFullscreen().bodyOverflow).toBe("");
    expect(exitFullscreen().icon).toBe(EXPAND_ICON);
  });
});

describe("shouldExitOnKeydown", () => {
  it("exits on Escape while fullscreen", () => {
    expect(shouldExitOnKeydown("Escape", true)).toBe(true);
  });

  it("does not exit on Escape when not fullscreen", () => {
    expect(shouldExitOnKeydown("Escape", false)).toBe(false);
  });

  it("does not exit on other keys while fullscreen", () => {
    expect(shouldExitOnKeydown("Enter", true)).toBe(false);
  });
});

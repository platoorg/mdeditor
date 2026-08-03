import { describe, expect, it } from "vitest";
import { COLLAPSE_ICON, EXPAND_ICON, iconForFullscreen } from "../src/icons";

describe("iconForFullscreen", () => {
  it("returns the expand icon when not fullscreen", () => {
    expect(iconForFullscreen(false)).toBe(EXPAND_ICON);
  });

  it("returns the collapse icon when fullscreen", () => {
    expect(iconForFullscreen(true)).toBe(COLLAPSE_ICON);
  });

  it("returns two distinct, non-empty icons", () => {
    expect(EXPAND_ICON).not.toEqual(COLLAPSE_ICON);
    expect(EXPAND_ICON.length).toBeGreaterThan(0);
    expect(COLLAPSE_ICON.length).toBeGreaterThan(0);
  });
});

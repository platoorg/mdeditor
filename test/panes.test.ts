import { describe, expect, it } from "vitest";
import { computePaneVisibility, isActiveTab } from "../src/panes";

describe("computePaneVisibility", () => {
  it("shows only the target pane", () => {
    const result = computePaneVisibility(["write", "preview"], "preview");
    expect(result.get("write")).toBe("none");
    expect(result.get("preview")).toBe("");
  });

  it("hides every pane when the target matches none of them", () => {
    const result = computePaneVisibility(["write", "preview"], "nonexistent");
    expect(result.get("write")).toBe("none");
    expect(result.get("preview")).toBe("none");
  });

  it("handles an empty pane list", () => {
    const result = computePaneVisibility([], "preview");
    expect(result.size).toBe(0);
  });

  it("handles duplicate pane ids by keying on the last occurrence", () => {
    const result = computePaneVisibility(["a", "a"], "a");
    expect(result.size).toBe(1);
    expect(result.get("a")).toBe("");
  });
});

describe("isActiveTab", () => {
  it("is true when the tab's target matches the clicked target", () => {
    expect(isActiveTab("md-preview-body", "md-preview-body")).toBe(true);
  });

  it("is false otherwise", () => {
    expect(isActiveTab("md-write-body", "md-preview-body")).toBe(false);
  });
});

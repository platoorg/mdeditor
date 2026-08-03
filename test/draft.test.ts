import { describe, expect, it } from "vitest";
import {
  draftDiscardId,
  draftPutPayload,
  emptyNoteView,
  restoredMessage,
  restoredNoteView,
  savedNoteView,
  shouldRestoreDraft,
} from "../src/draft";

describe("shouldRestoreDraft", () => {
  it("is false when there is no draft", () => {
    expect(shouldRestoreDraft(null, "hello")).toBe(false);
  });

  it("is false when the draft matches the server value", () => {
    expect(shouldRestoreDraft({ value: "hello" }, "hello")).toBe(false);
  });

  it("is true when the draft differs from the server value", () => {
    expect(shouldRestoreDraft({ value: "draft text" }, "hello")).toBe(true);
  });

  it("is true when the draft is non-empty and the server value is empty", () => {
    expect(shouldRestoreDraft({ value: "draft text" }, "")).toBe(true);
  });
});

describe("draftDiscardId", () => {
  it("namespaces the id by field name", () => {
    expect(draftDiscardId("body")).toBe("md-discard-body");
  });

  it("does not attempt to escape or reject unusual field names — callers must render", () => {
    // the value stays a plain string; safety comes from how it's rendered
    // (see index.ts: it is only ever assigned to element.id, never
    // interpolated into an HTML string), not from sanitizing it here.
    expect(draftDiscardId('a" onmouseover="x')).toBe('md-discard-a" onmouseover="x');
  });
});

describe("restoredMessage", () => {
  it("has no suffix when there is no timestamp", () => {
    expect(restoredMessage(undefined, () => "should not be called")).toBe("Draft restored.");
  });

  it("appends the formatted timestamp when present", () => {
    expect(restoredMessage("2026-01-01T00:00:00Z", () => "Jan 1, 2026")).toBe(
      "Draft restored from Jan 1, 2026.",
    );
  });

  it("delegates formatting entirely to the injected formatter", () => {
    const iso = "2026-06-15T12:30:00Z";
    let received = "";
    restoredMessage(iso, (v) => {
      received = v;
      return "formatted";
    });
    expect(received).toBe(iso);
  });
});

describe("restoredNoteView / savedNoteView / emptyNoteView", () => {
  it("builds a restored view with message and discard id", () => {
    const view = restoredNoteView("body", "2026-01-01T00:00:00Z", () => "Jan 1");
    expect(view).toEqual({
      kind: "restored",
      message: "Draft restored from Jan 1.",
      discardId: "md-discard-body",
    });
  });

  it("builds a saved view with no data payload", () => {
    expect(savedNoteView()).toEqual({ kind: "saved" });
  });

  it("builds an empty view with no data payload", () => {
    expect(emptyNoteView()).toEqual({ kind: "empty" });
  });
});

describe("draftPutPayload", () => {
  it("serializes the value under a value key", () => {
    expect(draftPutPayload("hello")).toBe('{"value":"hello"}');
  });

  it("round-trips through JSON.parse", () => {
    expect(JSON.parse(draftPutPayload("with \"quotes\" and \n newline"))).toEqual({
      value: 'with "quotes" and \n newline',
    });
  });
});

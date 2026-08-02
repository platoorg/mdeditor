export interface Draft {
  readonly value: string;
  readonly updated_at?: string;
}

/** A restored/saved draft note is rendered as plain text + one link — never
 * raw HTML — so a field name or timestamp can never break out of markup
 * (the original implementation built this via string-concatenated innerHTML,
 * which made a `discardId` derived from an attacker-controlled field name an
 * injection point). */
export type DraftNoteView =
  | { readonly kind: "empty" }
  | { readonly kind: "restored"; readonly message: string; readonly discardId: string }
  | { readonly kind: "saved" };

/** Decides whether a fetched draft differs from the value already on the page. */
export function shouldRestoreDraft(draft: Draft | null, serverValue: string): boolean {
  return draft !== null && draft.value !== serverValue;
}

/** Deterministic id for the discard link, scoped to the field it belongs to. */
export function draftDiscardId(fieldName: string): string {
  return "md-discard-" + fieldName;
}

/** Human-readable restore message. `formatTimestamp` is injected so this stays pure. */
export function restoredMessage(
  updatedAt: string | undefined,
  formatTimestamp: (iso: string) => string,
): string {
  const suffix = updatedAt ? " from " + formatTimestamp(updatedAt) : "";
  return `Draft restored${suffix}.`;
}

export function restoredNoteView(
  fieldName: string,
  updatedAt: string | undefined,
  formatTimestamp: (iso: string) => string,
): DraftNoteView {
  return {
    kind: "restored",
    message: restoredMessage(updatedAt, formatTimestamp),
    discardId: draftDiscardId(fieldName),
  };
}

export function savedNoteView(): DraftNoteView {
  return { kind: "saved" };
}

export function emptyNoteView(): DraftNoteView {
  return { kind: "empty" };
}

/** JSON body for the autosave PUT request. */
export function draftPutPayload(value: string): string {
  return JSON.stringify({ value });
}

/** Default timestamp formatter — isolated so callers can inject a
 * deterministic one in tests instead of depending on runtime locale. */
export function defaultFormatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

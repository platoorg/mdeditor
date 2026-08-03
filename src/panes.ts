export type PaneDisplay = "" | "none";

/**
 * Given every pane id in a tab group and the id of the pane that should
 * become visible, returns the CSS `display` value each pane should get.
 */
export function computePaneVisibility(
  paneIds: readonly string[],
  targetId: string,
): ReadonlyMap<string, PaneDisplay> {
  return new Map(paneIds.map((id) => [id, id === targetId ? "" : "none"]));
}

/** Whether a given tab's target matches the tab the user clicked. */
export function isActiveTab(tabTarget: string, clickedTarget: string): boolean {
  return tabTarget === clickedTarget;
}

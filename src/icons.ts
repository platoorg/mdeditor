export const EXPAND_ICON =
  '<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M1 1h5v2H3v3H1zm11 0h5v5h-2V3h-3zM1 12h2v3h3v2H1zm14 3h-3v2h5v-5h-2z"/></svg>';

export const COLLAPSE_ICON =
  '<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M6 1H4v3H1v2h5zm6 0h2v3h3v2h-5zM6 17H4v-3H1v-2h5zm6 0h2v-3h3v-2h-5z"/></svg>';

export function iconForFullscreen(isFullscreen: boolean): string {
  return isFullscreen ? COLLAPSE_ICON : EXPAND_ICON;
}

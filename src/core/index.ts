// Public entry for TypeScript consumers (exWriter bundles this with Vite).
// Go consumers get the compiled widget from static/ instead.
export {
  create,
  renderLines,
  headingLevel,
  listContinuation,
  wrapSelection,
  WRAP_PAIRS,
} from './editor';
export type {
  CreateOptions,
  Editor,
  EditorSelection,
  LineRange,
  SetValueOptions,
} from './editor';

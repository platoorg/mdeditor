import { build } from "esbuild";

// static/ is what the Go package embeds and what go-get consumers receive,
// so the built files are committed (CI checks they're up to date).
const banner = "/* GENERATED - do not edit by hand. Source: src/. Run `npm run build` to regenerate. */";

await build({
  entryPoints: ["src/widget/index.ts"],
  bundle: true,
  outfile: "static/markdown-editor.js",
  format: "iife",
  target: "es2020",
  legalComments: "none",
  banner: { js: banner },
});

await build({
  entryPoints: ["src/widget/widget.css"],
  bundle: true,
  outfile: "static/markdown-editor.css",
  legalComments: "none",
  banner: { css: banner },
});

console.log("built static/markdown-editor.{js,css}");

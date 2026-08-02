import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  outfile: "static/markdown-editor.js",
  format: "iife",
  target: "es2020",
  legalComments: "none",
  banner: {
    js: "// GENERATED — do not edit by hand. Source: src/*.ts. Run `npm run build` to regenerate.",
  },
});

console.log("built static/markdown-editor.js");

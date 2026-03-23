import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts"
    },
    format: ["esm"],
    platform: "node",
    target: "node22",
    outDir: "dist",
    clean: true,
    dts: true,
    sourcemap: true,
    splitting: false,
    noExternal: [/@stackcanon\//]
  },
  {
    entry: {
      "bin/stackcn": "src/bin/stackcn.ts"
    },
    format: ["esm"],
    platform: "node",
    target: "node22",
    outDir: "dist",
    clean: false,
    dts: false,
    sourcemap: true,
    splitting: false,
    noExternal: [/@stackcanon\//]
  }
]);

import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

/** Folders written by the asset collector and read by the app at runtime. */
const LOCAL_DIRS = ["data", "assets"];

const MIME: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

/**
 * Serve the collector output (data/, assets/) in dev, and copy it into the build.
 * They live at the project root rather than public/ so the collector stays separate from the UI.
 */
function localAssets(): Plugin {
  let outDir = "dist";
  return {
    name: "local-assets",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? "").split("?")[0]);
        const dir = LOCAL_DIRS.find((d) => url.startsWith(`/${d}/`));
        if (!dir) return next();
        const base = path.join(root, dir);
        const file = path.join(root, url);
        if (!file.startsWith(base + path.sep) || !existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader("Content-Type", MIME[path.extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      for (const dir of LOCAL_DIRS) {
        const from = path.join(root, dir);
        if (existsSync(from)) cpSync(from, path.join(outDir, dir), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  // Relative base so the build works at any path (e.g. GitHub Pages /Maple/).
  base: "./",
  publicDir: false,
  // Keep bundled files apart from the collector's assets/ folder.
  build: { assetsDir: "static" },
  plugins: [react(), tailwindcss(), localAssets()],
});

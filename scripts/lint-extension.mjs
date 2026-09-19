import { cp, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import lint from "../node_modules/web-ext/lib/cmd/lint.js";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceFiles = [
  "manifest.json",
  "api.js",
  "connection.js",
  "popup.css",
  "popup.html",
  "popup.js",
  "assets",
];
const lintSource = await mkdtemp(join(tmpdir(), "match13-extension-lint-"));

try {
  await Promise.all(sourceFiles.map((file) => cp(join(projectRoot, file), join(lintSource, file), { recursive: true })));

  const result = await lint({
    sourceDir: lintSource,
    artifactsDir: lintSource,
    boring: false,
    ignoreFiles: [],
    metadata: false,
    output: "text",
    privileged: false,
    selfHosted: false,
    verbose: true,
    warningsAsErrors: false,
  }, { shouldExitProgram: false });

  const errors = result?.summary?.errors ?? result?.summary?.error ?? 0;
  if (errors > 0) {
    throw new Error(`web-ext lint found ${errors} error${errors === 1 ? "" : "s"}`);
  }
} finally {
  await rm(lintSource, { recursive: true, force: true });
}

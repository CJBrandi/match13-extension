import { cp, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceFiles = ["manifest.json", "api.js", "background.js", "popup.css", "popup.html", "popup.js"];
const lintSource = await mkdtemp(join(tmpdir(), "match13-extension-lint-"));

try {
  await Promise.all(sourceFiles.map((file) => cp(join(projectRoot, file), join(lintSource, file))));

  const webExt = join(projectRoot, "node_modules", "web-ext", "bin", "web-ext.js");
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [webExt, "lint", "--no-config-discovery", "--source-dir", lintSource, "--verbose"], {
      cwd: projectRoot,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });

  if (result.code !== 0) {
    throw new Error(`web-ext lint exited with ${result.signal ?? result.code}`);
  }
} finally {
  await rm(lintSource, { recursive: true, force: true });
}

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("keeps an explicit Firefox popup width on both root elements", async () => {
  const css = await readFile(new URL("../popup.css", import.meta.url), "utf8");

  assert.match(css, /html\s*{[^}]*\bwidth:\s*640px;/s);
  assert.match(css, /body\s*{[^}]*\bwidth:\s*640px;/s);
  assert.doesNotMatch(css, /html\s*{[^}]*\bmax-width:\s*100vw;/s);
});

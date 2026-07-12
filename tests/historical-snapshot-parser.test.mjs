import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import ts from "typescript";

const require = createRequire(import.meta.url);

async function loadParser() {
  const source = await readFile("lib/history/snapshot-parser.ts", "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const mod = { exports: {} };

  vm.runInNewContext(js, { module: mod, exports: mod.exports, require });
  return mod.exports;
}

test("historical HTML parser reads per-post ms-xs view spans", async () => {
  const { parseHistoricalSnapshotContent } = await loadParser();
  const html = `
    <title>Profile (u/example)</title>
    <shreddit-post id="t3_alpha" permalink="/r/test/comments/alpha/alpha/"
      created-timestamp="2026-07-02T18:43:29.410000+0000" post-title="Alpha"
      subreddit-name="test" score="1" comment-count="0">
      <shreddit-post-overflow-menu post-id="t3_alpha"></shreddit-post-overflow-menu>
      <div class="py-xs mt-2xs">
        <span class="flex align-middle font-semibold">
          <svg icon-name="show"></svg>
          <span class="ms-xs">
            21 views
          </span>
        </span>
      </div>
    </shreddit-post>
    <shreddit-post id="t3_beta" permalink="/r/test/comments/beta/beta/"
      created-timestamp="2026-07-02T18:50:29.410000+0000" post-title="Beta"
      subreddit-name="test" score="2" comment-count="1">
      <span class="ms-xs">6.2K views</span>
    </shreddit-post>
  `;

  const parsed = parseHistoricalSnapshotContent(html);

  assert.equal(parsed.posts.length, 2);
  assert.equal(parsed.posts[0].redditId, "t3_alpha");
  assert.equal(parsed.posts[0].viewCount, 21);
  assert.equal(parsed.posts[1].redditId, "t3_beta");
  assert.equal(parsed.posts[1].viewCount, 6200);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function text(path) {
  return readFile(path, "utf8");
}

test("browser import route validates payloads before parsing", async () => {
  const route = await text("app/api/analyze/import/route.ts");
  assert.match(route, /validateImportRequest/);
  assert.match(route, /parseBrowserImport\(validated\.value\.raw\)/);
});

test("product ops route validates actions before mutating", async () => {
  const route = await text("app/api/product/ops/route.ts");
  assert.match(route, /validateProductOpsAction/);
  assert.match(route, /handleProductOpsAction\(user\.id, validated\.value\)/);
});

test("product ops schema is migration-owned", async () => {
  const schemaHelper = await text("lib/product/schema.ts");
  assert.doesNotMatch(schemaHelper, /CREATE TABLE/i);
  const migration = await text("prisma/migrations/20260708210000_product_ops_foundation/migration.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "WorkspaceSetting"/);
});

test("planner queue process recovers stale locks", async () => {
  const route = await text("app/api/planner/jobs/process/route.ts");
  assert.match(route, /recoverStalePlannerJobs/);
  const recovery = await text("lib/planner/recovery.ts");
  assert.match(recovery, /status: "RUNNING"/);
  assert.match(recovery, /status: "QUEUED"/);
});

test("extension does not request cookie access", async () => {
  const manifest = JSON.parse(await text("extension/manifest.json"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal((manifest.permissions ?? []).includes("cookies"), false);
});

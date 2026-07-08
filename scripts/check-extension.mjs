import { readFile } from "node:fs/promises";

const requiredFiles = ["extension/manifest.json", "extension/background.js", "extension/README.md"];
const requiredBackgroundTokens = [
  "PAIDPOLITELY_PING",
  "PAIDPOLITELY_SCAN_REDDIT_PROFILE",
  "fetchRedditListing",
  "scanRedditProfileFromTab",
];

async function fileText(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`Missing required extension file: ${path}`);
  }
}

for (const path of requiredFiles) {
  await fileText(path);
}

const manifest = JSON.parse(await fileText("extension/manifest.json"));
if (manifest.manifest_version !== 3) {
  throw new Error("Extension must remain Manifest V3.");
}

const permissions = new Set(manifest.permissions ?? []);
if (permissions.has("cookies")) {
  throw new Error("Extension must not request cookies permission.");
}

const background = await fileText("extension/background.js");
for (const token of requiredBackgroundTokens) {
  if (!background.includes(token)) {
    throw new Error(`Extension background is missing protocol token: ${token}`);
  }
}

console.log("Extension static checks passed.");

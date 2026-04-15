#!/usr/bin/env node

/**
 * Push existing Keells snapshot to the Worker KV.
 * Usage:
 *   WORKER_URL=https://... SNAPSHOT_API_KEY=... npm run keells:push
 *   npm run keells:push -- --url https://... --key SECRET
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const IMPORT_FILE = path.join(PROJECT_ROOT, "data", "keells.meat.import.json");

function parseArgs(argv) {
  const options = {
    url: null,
    key: null,
    file: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--url") options.url = argv[++i];
    else if (arg === "--key") options.key = argv[++i];
    else if (arg === "--file") options.file = argv[++i];
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const pushUrl = options.url || process.env.WORKER_URL;
  const pushKey = options.key || process.env.SNAPSHOT_API_KEY;
  const filePath = options.file || IMPORT_FILE;

  if (!pushUrl || !pushKey) {
    console.error("Missing WORKER_URL or SNAPSHOT_API_KEY.");
    console.error("Set via env vars or pass --url <url> --key <key>");
    process.exitCode = 1;
    return;
  }

  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    console.error(`Cannot read snapshot file: ${filePath}`);
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  const snapshot = JSON.parse(raw);
  console.log(`Read snapshot from: ${path.relative(PROJECT_ROOT, filePath)}`);
  console.log(`  provider: ${snapshot.provider}, category: ${snapshot.category}`);
  console.log(`  items:    ${snapshot.items?.length ?? 0}`);
  console.log();

  console.log(`Pushing snapshot to ${pushUrl}/api/snapshots...`);
  const resp = await fetch(`${pushUrl}/api/snapshots`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${pushKey}`,
      "Content-Type": "application/json",
    },
    body: raw,
  });

  if (resp.ok) {
    const result = await resp.json();
    console.log(`Pushed: ${result.items} items to ${result.provider}/${result.category}`);
  } else {
    console.error(`Push failed: ${resp.status} ${resp.statusText}`);
    const text = await resp.text();
    if (text) console.error(text);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

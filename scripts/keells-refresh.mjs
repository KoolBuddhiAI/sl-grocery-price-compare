#!/usr/bin/env node

/**
 * One-shot Keells data refresh.
 *
 * Usage (from clipboard on macOS):
 *   pbpaste | npm run keells:refresh
 *
 * Usage (from a file):
 *   npm run keells:refresh -- --file data/keells.browser-raw.capture.json
 *
 * Options:
 *   --file <path>            Read raw JSON from file instead of stdin
 *   --captured-at <iso>      Override capture timestamp (default: now)
 *   --source-status <status> ok | partial | blocked_or_unstable | not_found (default: ok)
 *   --dry-run                Print transformed JSON without writing
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const IMPORT_FILE = path.join(PROJECT_ROOT, "data", "keells.meat.import.json");

// Re-use the existing transform logic
const { transformRawKeellsRecords } = await import("./keells-browser-export.mjs");

function parseArgs(argv) {
  const options = {
    filePath: null,
    capturedAt: new Date().toISOString(),
    sourceStatus: "ok",
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--file") {
      options.filePath = argv[++i];
    } else if (arg === "--captured-at") {
      options.capturedAt = argv[++i];
    } else if (arg === "--source-status") {
      options.sourceStatus = argv[++i];
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    }
  }

  return options;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  // Read raw JSON from file or stdin
  let rawText;
  if (options.filePath) {
    rawText = await fs.readFile(options.filePath, "utf8");
    console.log(`Reading raw JSON from: ${options.filePath}`);
  } else if (!process.stdin.isTTY) {
    rawText = await readStdin();
    console.log("Reading raw JSON from stdin (pipe/clipboard)...");
  } else {
    console.error(
      "No input provided. Either pipe JSON via stdin or use --file <path>.\n\n" +
        "Examples:\n" +
        "  pbpaste | npm run keells:refresh\n" +
        "  npm run keells:refresh -- --file data/keells.browser-raw.capture.json\n"
    );
    process.exitCode = 1;
    return;
  }

  const rawInput = JSON.parse(rawText);
  const itemCount = Array.isArray(rawInput) ? rawInput.length : rawInput?.items?.length ?? "?";
  console.log(`Parsed ${itemCount} raw items.`);

  // Transform
  const snapshot = transformRawKeellsRecords(rawInput, {
    capturedAt: options.capturedAt,
    sourceStatus: options.sourceStatus,
  });

  console.log(`Transformed ${snapshot.items.length} items (captured_at: ${snapshot.captured_at}).`);

  if (options.dryRun) {
    console.log("\n--- DRY RUN (not writing) ---\n");
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  // Write to import file
  await fs.writeFile(IMPORT_FILE, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`Wrote snapshot to: ${path.relative(PROJECT_ROOT, IMPORT_FILE)}`);

  // Run tests
  console.log("\nRunning tests...\n");
  try {
    execSync("node --test", { cwd: PROJECT_ROOT, stdio: "inherit" });
    console.log("\nAll tests passed.");
  } catch {
    console.error("\nTests failed. Check output above.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

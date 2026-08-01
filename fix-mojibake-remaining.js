#!/usr/bin/env node
/**
 * fix-mojibake-remaining.js
 *
 * Repairs a leftover mojibake em-dash ("—" that got corrupted into
 * something like "â€"") on specific lines of users.service.ts.
 * It recovers the original character automatically (by reinterpreting
 * the corrupted bytes as UTF-8), so there's no risk of typos — this is
 * safer than retyping the dash by hand.
 *
 * Usage (run from EduSaas-backend root):
 *   node fix-mojibake-remaining.js --dry-run
 *   node fix-mojibake-remaining.js
 */

const fs = require("fs");
const path = require("path");

const DRY_RUN = process.argv.includes("--dry-run");

const TARGETS = {
  "src/modules/users/users.service.ts": [16, 58, 103, 137, 162],
};

let linesChanged = 0;
let filesChanged = 0;

for (const [relPath, lineNumbers] of Object.entries(TARGETS)) {
  const fullPath = path.join(process.cwd(), relPath);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  SKIP (file not found): ${relPath}`);
    continue;
  }

  const original = fs.readFileSync(fullPath, "utf8");
  const usesCRLF = original.includes("\r\n");
  const lines = original.split(/\r\n|\n/);
  let fileTouched = false;

  for (const lineNo of lineNumbers) {
    const idx = lineNo - 1;
    if (idx < 0 || idx >= lines.length) {
      console.log(`⚠️  SKIP ${relPath}:${lineNo} — out of range`);
      continue;
    }

    const originalLine = lines[idx];

    // Recover the original UTF-8 text by reinterpreting the corrupted
    // characters as raw bytes (latin1) and re-decoding as UTF-8.
    const repaired = Buffer.from(originalLine, "latin1").toString("utf8");

    if (repaired === originalLine) {
      console.log(`ℹ️  ${relPath}:${lineNo} — no mojibake detected, left as is`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`\n--- ${relPath}:${lineNo} ---`);
      console.log(`- ${originalLine}`);
      console.log(`+ ${repaired}`);
    }

    lines[idx] = repaired;
    fileTouched = true;
    linesChanged++;
  }

  if (fileTouched && !DRY_RUN) {
    const eol = usesCRLF ? "\r\n" : "\n";
    fs.writeFileSync(fullPath, lines.join(eol), "utf8");
    filesChanged++;
  } else if (fileTouched) {
    filesChanged++;
  }
}

console.log("\n──────────────────────────────────────────");
if (DRY_RUN) {
  console.log(`DRY RUN — nothing was written to disk.`);
  console.log(`Would change ${linesChanged} line(s) across ${filesChanged} file(s).`);
  console.log(`\nRun again without --dry-run to apply the changes.`);
} else {
  console.log(`Done. Changed ${linesChanged} line(s) across ${filesChanged} file(s).`);
  console.log(`\nRun "git diff" to review, then commit if it looks good.`);
}

// scan-arabic-comments.js
// READ-ONLY. Does not modify any file. Run from inside a project folder
// (e.g. EduSaas-backend or EduSaas-frontend / edu-saas--backend / edu-saas-platform):
//
//   node scan-arabic-comments.js
//
// It walks every .ts / .tsx / .js / .jsx / .prisma file (skipping
// node_modules, .git, .next, dist, build), extracts // and /* */ comments,
// and flags any comment that contains:
//   - Arabic script characters (real Arabic), OR
//   - common mojibake patterns (broken UTF-8 shown as Ã.../â€.../Ø...)
//
// Output: prints a report to the terminal AND saves it to
// arabic-comments-report.json (also read/write only for this new file —
// your existing code files are never touched).

const fs = require("fs");
const path = require("path");

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".turbo"]);
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".prisma"]);

const ARABIC_RE = /[\u0600-\u06FF]/;
const MOJIBAKE_RE = /Ã.|â€.|Ø./;

function walk(dir, results) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (EXTENSIONS.has(ext)) results.push(path.join(dir, entry.name));
    }
  }
}

function extractComments(content) {
  // Very simple line-based scan: good enough for flagging, not a full parser.
  // Matches // line comments and /* block */ comments (single or multi-line).
  const comments = [];
  const lines = content.split(/\r\n|\n/);

  let inBlock = false;
  let blockStartLine = 0;
  let blockBuffer = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inBlock) {
      blockBuffer.push(line);
      const endIdx = line.indexOf("*/");
      if (endIdx !== -1) {
        comments.push({ line: blockStartLine + 1, text: blockBuffer.join("\n") });
        inBlock = false;
        blockBuffer = [];
      }
      continue;
    }

    const blockStart = line.indexOf("/*");
    const lineCommentStart = line.indexOf("//");

    if (blockStart !== -1 && (lineCommentStart === -1 || blockStart < lineCommentStart)) {
      const endIdx = line.indexOf("*/", blockStart);
      if (endIdx !== -1) {
        comments.push({ line: i + 1, text: line.slice(blockStart, endIdx + 2) });
      } else {
        inBlock = true;
        blockStartLine = i;
        blockBuffer = [line.slice(blockStart)];
      }
      continue;
    }

    if (lineCommentStart !== -1) {
      // crude guard against // inside a string literal — not perfect, good enough for flagging
      const before = line.slice(0, lineCommentStart);
      const quoteCount = (before.match(/["'`]/g) || []).length;
      if (quoteCount % 2 === 0) {
        comments.push({ line: i + 1, text: line.slice(lineCommentStart) });
      }
    }
  }

  return comments;
}

const results = [];
walk(".", results);

const report = [];

for (const file of results) {
  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const comments = extractComments(content);
  for (const c of comments) {
    if (ARABIC_RE.test(c.text) || MOJIBAKE_RE.test(c.text)) {
      report.push({ file: file.replace(/^\.[\\/]/, ""), line: c.line, comment: c.text.trim() });
    }
  }
}

console.log(`\nScanned ${results.length} files. Found ${report.length} flagged comment(s).\n`);
console.log("──────────────────────────────────────────");
for (const r of report) {
  console.log(`${r.file}:${r.line}`);
  console.log(`  ${r.comment}`);
  console.log("");
}
console.log("──────────────────────────────────────────");

fs.writeFileSync("arabic-comments-report.json", JSON.stringify(report, null, 2), "utf8");
console.log(`\n📄 Full report also saved to: arabic-comments-report.json`);
console.log(`Nothing else was changed — this script only read files.\n`);

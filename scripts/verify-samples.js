/**
 * Verification script for Code Count ground truth samples.
 * Usage: node scripts/verify-samples.js
 */
const fs = require("fs");
const path = require("path");

function analyzeFileSync(p) {
  try {
    const content = fs.readFileSync(p, "utf8");
    const lines = content.split("\n");
    const totalChars = content.length;

    // Simulate "fast" mode logic from src/analyzer.ts
    let activeImports = 0;
    let inactiveImports = 0;
    const importKeywordRegex = /\b(?:import|require|export|from)\b/;
    const activeRegexGroups = [
      /^\s*import\b/,
      /^\s*export\b.*\bfrom\s+['"]/,
      /^\s*(?:const|let|var)\s+.*=\s*require\s*\(/,
      /^\s*require\s*\(/,
      /^\s*from\s+['"].*['"]\s*;?$/,
    ];
    const commentLineRegex = /^\s*(?:\/\/|\/\*|\*|#|<!--)/;

    for (const line of lines) {
      if (importKeywordRegex.test(line)) {
        if (commentLineRegex.test(line)) {
          inactiveImports++;
        } else {
          let isActive = false;
          for (const rx of activeRegexGroups) {
            if (rx.test(line)) {
              isActive = true;
              break;
            }
          }
          if (isActive) activeImports++;
          else inactiveImports++;
        }
      }
    }

    const multiLineRegex = /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g;
    const singleLineRegex = /\/\/.*$|#.*$|<!--.*-->/gm;

    const multiMatches = content.match(multiLineRegex) || [];
    const multiCommentLen = multiMatches.reduce((acc, m) => acc + m.length, 0);

    const cleanedForSingle = content.replace(multiLineRegex, "");
    const singleMatches = cleanedForSingle.match(singleLineRegex) || [];
    const singleCommentLen = singleMatches.reduce((acc, m) => acc + m.length, 0);

    const commentChars = multiCommentLen + singleCommentLen;
    const codeChars = Math.max(0, totalChars - commentChars);

    let commentLineCount = 0;
    let blankLineCount = 0;
    const singleLineCommentRegex = /^\s*(?:\/\/|\/\*|\*\/|\*|#|<!--|-->)/;
    let inMultiLineComment = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "") {
        blankLineCount++;
        continue;
      }
      if (inMultiLineComment) {
        commentLineCount++;
        if (trimmed.includes("*/") || trimmed.includes("-->")) {
          inMultiLineComment = false;
        }
        continue;
      }
      if (/^\s*\/\*/.test(line) || /^\s*<!--/.test(line)) {
        commentLineCount++;
        if (!(trimmed.includes("*/") || trimmed.includes("-->"))) {
          inMultiLineComment = true;
        }
        continue;
      }
      if (singleLineCommentRegex.test(line)) {
        commentLineCount++;
      }
    }

    const codeLineCount = Math.max(0, lines.length - commentLineCount - blankLineCount);

    return {
      total: lines.length,
      code: codeLineCount,
      comment: commentLineCount,
      blank: blankLineCount,
      imports: { active: activeImports, inactive: inactiveImports }
    };
  } catch (e) {
    console.error(`Error analyzing ${p}:`, e);
    return null;
  }
}

const SAMPLES_DIR = path.join(__dirname, "..", "samples");
const RESULTS_DIR = path.join(SAMPLES_DIR, "test-results");

const samples = [
  "python-flask/app.py",
  "basic-example/src/index.ts"
];

let allPassed = true;

console.log("🚀 Starting verification of Code Count samples...\n");

for (const relPath of samples) {
  const fullPath = path.join(SAMPLES_DIR, relPath);
  const resultName = relPath.split("/").pop() + ".json";
  const groundTruthPath = path.join(RESULTS_DIR, resultName);

  if (!fs.existsSync(fullPath)) {
    console.warn(`⚠️ Warning: Sample file not found: ${fullPath}`);
    continue;
  }
  if (!fs.existsSync(groundTruthPath)) {
    console.warn(`⚠️ Warning: Ground truth not found: ${groundTruthPath}`);
    continue;
  }

  const actual = analyzeFileSync(fullPath);
  const expected = JSON.parse(fs.readFileSync(groundTruthPath, "utf8")).overall;

  console.log(`Checking: ${relPath}`);
  
  const diffs = [];
  if (actual.total !== expected.totalLines) diffs.push(`Total lines: actual=${actual.total}, expected=${expected.totalLines}`);
  if (actual.code !== expected.codeLines) diffs.push(`Code lines: actual=${actual.code}, expected=${expected.codeLines}`);
  if (actual.comment !== expected.commentLines) diffs.push(`Comment lines: actual=${actual.comment}, expected=${expected.commentLines}`);
  if (actual.blank !== expected.blankLines) diffs.push(`Blank lines: actual=${actual.blank}, expected=${expected.blankLines}`);

  if (diffs.length > 0) {
    console.error(`❌ FAILED: ${relPath}`);
    diffs.forEach(d => console.error(`   - ${d}`));
    allPassed = false;
  } else {
    console.log(`✅ PASSED: ${relPath}`);
  }
  console.log("");
}

if (allPassed) {
  console.log("✨ All samples verified successfully!");
} else {
  console.error("💥 Verification failed for some samples.");
  process.exit(1);
}

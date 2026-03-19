import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileInfo, CodeCountResult } from './types';

export class CodeAnalyzer {
    public static analyzeFileSync(p: string): FileInfo {
        try {
            const content = fs.readFileSync(p, "utf8");
            const config = vscode.workspace.getConfiguration("codeCount");
            const mode = config.get<string>("importAnalysisMode") || "fast";

            const lines = content.split("\n");
            const totalChars = content.length;

            let activeImports = 0;
            let inactiveImports = 0;

            if (mode === "fast") {
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
            } else {
                const matches = content.match(
                    /^import\s+|^require\s*\(|^const\s+.*\s*=\s*require\(/gm,
                );
                activeImports = matches ? matches.length : 0;
            }

            const multiLineRegex = /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g;
            const singleLineRegex = /\/\/.*$|#.*$|<!--.*-->/gm;

            const multiMatches = content.match(multiLineRegex) || [];
            const multiCommentLen = multiMatches.reduce(
                (acc, m) => acc + m.length,
                0
            );

            const cleanedForSingle = content.replace(multiLineRegex, "");
            const singleMatches = cleanedForSingle.match(singleLineRegex) || [];
            const singleCommentLen = singleMatches.reduce(
                (acc, m) => acc + m.length,
                0,
            );

            const commentChars = multiCommentLen + singleCommentLen;
            const codeChars = Math.max(0, totalChars - commentChars);

            // Count line types
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
                path: p,
                extension: path.extname(p).toLowerCase(),
                total: lines.length,
                code: codeLineCount,
                comment: commentLineCount,
                blank: blankLineCount,
                imports: { active: activeImports, inactive: inactiveImports },
                chars: {
                    code: codeChars,
                    comment: commentChars,
                    total: totalChars,
                },
            };
        } catch {
            return {
                path: p,
                extension: path.extname(p).toLowerCase(),
                total: 0,
                code: 0,
                comment: 0,
                blank: 0,
                imports: { active: 0, inactive: 0 },
                chars: { code: 0, comment: 0, total: 0 },
            };
        }
    }
}

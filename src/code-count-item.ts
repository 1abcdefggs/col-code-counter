import * as vscode from "vscode";
import * as path from "path";
import { CodeAnalyzer } from "./analyzer";

/**
 * File item displayed in the Code Count explorer.
 */
export class CodeCountItem extends vscode.TreeItem {
  constructor(
    public readonly uri: vscode.Uri,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly cachedStats: {
      lines: number;
      imports: { active: number; inactive: number };
      codeChars: number;
      commentChars: number;
      totalChars: number;
      fileCount?: number;
    } | null,
    private readonly showImports: boolean = false,
    private readonly paddingStyle: string = "exact",
    public readonly isUnscanned: boolean = false,
    public readonly isGitignored: boolean = false, // Add this new property
  ) {
    const isFile = collapsibleState === vscode.TreeItemCollapsibleState.None;
    let label = path.basename(uri.fsPath);

    super(label, collapsibleState);
    this.resourceUri = uri;

    if (this.isGitignored) {
      this.contextValue = "codeCount.isGitignored";
    }

    let lineStr = "";
    let lineStats = {
      lines: 0,
      imports: { active: 0, inactive: 0 },
    };

    if (this.cachedStats) {
      lineStats.lines = this.cachedStats.lines || 0;
      lineStats.imports = this.cachedStats.imports || {
        active: 0,
        inactive: 0,
      };
    } else if (isFile && !this.isUnscanned) {
      const stats = CodeAnalyzer.analyzeFileSync(uri.fsPath);
      lineStats.lines = stats.total;
      lineStats.imports = stats.imports || { active: 0, inactive: 0 };
    }

    const { lines, imports } = lineStats;

    // Premium UI: Number abbreviation or Exact Numbers.
    if (this.isUnscanned) {
      if (this.paddingStyle === "zero" || this.paddingStyle === "exact") {
        lineStr = "--------";
      } else {
        lineStr = "---".padStart(6, "\u2007");
      }
    } else {
      if (this.paddingStyle === "zero") {
        lineStr = String(lines).padStart(8, "0");
      } else if (this.paddingStyle === "exact") {
        lineStr = String(lines).padStart(8, "\u2007");
      } else {
        let formattedLines = "";
        if (lines >= 1_000) {
          const kValue = lines / 1_000;
          formattedLines =
            kValue >= 100
              ? Math.round(kValue) + "K"
              : kValue.toFixed(1).replace(/\.0$/, "") + "K";
        } else {
          formattedLines = String(lines);
        }
        lineStr = formattedLines.padStart(6, "\u2007");
      }
    }

    // VS Code's tree rendering places files slightly to the right of directories.
    // We add two Hair Spaces (U+200A U+200A) to directories to perfectly align the left edge (+1 pixel from previous).
    const alignmentTweak = isFile ? "" : "\u200A\u200A";

    const lineThreshold =
      vscode.workspace.getConfiguration("codeCount").get<number>("threshold") ||
      200;

    if (this.isUnscanned) {
      this.label = `${alignmentTweak}${lineStr} • ${label}`;
    } else {
      this.label = `${alignmentTweak}${lineStr} ${label}`;
    }

    if (isFile) {
      this.description =
        this.showImports && !this.isUnscanned
          ? `Imports: ${imports.active} (+${imports.inactive} text)`
          : "";

      const charInfo = this.cachedStats
        ? `\nCode: ${this.cachedStats.codeChars} Chars\nComments: ${this.cachedStats.commentChars} Chars\nTotal: ${this.cachedStats.totalChars} Chars`
        : "";
      this.tooltip = this.isUnscanned
        ? "File discovered, but contents not yet analyzed. Click RUN to calculate lines."
        : `Lines: ${lines}${this.showImports ? `, Imports: ${imports.active} (+${imports.inactive} inactive)` : ""}${charInfo}${this.isGitignored ? " (Ignored by .gitignore)" : ""}`;
      this.command = {
        command: "vscode.open",
        title: "Open",
        arguments: [uri],
      };
    } else {
      const charInfo = this.cachedStats
        ? `\nCode: ${this.cachedStats.codeChars} Chars\nComments: ${this.cachedStats.commentChars} Chars\nTotal: ${this.cachedStats.totalChars} Chars`
        : "";
      this.tooltip = this.isUnscanned
        ? "Directory discovered, pending recursive analysis. Click RUN to calculate total lines."
        : `Total Lines: ${lines}${charInfo}${this.isGitignored ? " (Ignored by .gitignore)" : ""}`;
    }
  }
}

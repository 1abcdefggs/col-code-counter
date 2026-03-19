import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { minimatch } from "minimatch";
import { GitignoreManager } from "./gitignore/manager";
import { ProjectProfile } from "./profiles/types";
import { profiles } from "./profiles";
import { DiscoveryNode } from "./discovery-types";
import { FileReportEntry } from "./variants/analysis-report-view";
import { CodeCountItem } from "./code-count-item";
import { CodeAnalyzer } from "./analyzer";
import { CodeCache, CodeCacheEntry, CodeCountSnapshot } from "./types";

/**
 * Provider that mirrors the workspace and flags bloated files.
 */
export class CodeCountProvider
  implements
    vscode.TreeDataProvider<vscode.TreeItem>,
    vscode.FileDecorationProvider
{
  private _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _onDidFileDecorationDataChange = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this._onDidFileDecorationDataChange.event;

  public provideFileDecoration(uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
    const root = this._customRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    const relPath = path.relative(root, uri.fsPath).replace(/\\/g, "/");
    
    let isDir = false;
    try {
        isDir = fs.lstatSync(uri.fsPath).isDirectory();
    } catch (e) { }

    const ignoreReason = this.shouldIgnore(path.basename(uri.fsPath), relPath, isDir);
    if (ignoreReason) {
      return {
        badge: ignoreReason.charAt(0).toUpperCase(),
        tooltip: `Code Count: Ignored (${ignoreReason})`,
        color: new vscode.ThemeColor("descriptionForeground")
      };
    }
    return undefined;
  }

  private _onDidDiscoverFile = new vscode.EventEmitter<{
    path: string;
    status: string;
    percent?: number;
    current?: number;
    total?: number;
  }>();
  readonly onDidDiscoverFile = this._onDidDiscoverFile.event;

  public getFlattenedDiscovery(): DiscoveryNode[] {
      const flat: DiscoveryNode[] = [];
      const traverse = (nodes: DiscoveryNode[]) => {
          for (const n of nodes) {
              flat.push(n);
              if (n.children) traverse(n.children);
          }
      };
      traverse(this._discoveryTree);
      return flat;
  }

  public _stats: {
    avg: number;
    max: number;
    min: number;
    totalFiles: number;
    lastScanTimestamp?: string;
  } | null = null;
  public _isAnalyzing = false;
  public _hasDiscovered = false;
  public _hasAnalyzed = false;

  // Centralized Exclusion State
  public _isBulkExclusionEnabled: boolean = true;
  public _isGitignoreEnabled: boolean = true;
  public _isProfileExcludeEnabled: boolean = true;
  public _isDependencyExcludeEnabled: boolean = true;
  public _autoAnalyzerEnabled: boolean = true;
  public _dotExclusions = {
    dotFold: true,
    dotFile: true,
    underscoreFold: true,
    underscoreFile: true
  };
  public _disabledGitignoreSources: Set<string> = new Set();
  public _manualExclusions: Set<string> = new Set();
  public _manualInclusions: Set<string> = new Set();
  public _expandedPaths: Set<string> = new Set();
  public _isManualLogicEnabled: boolean = false;
  private _manualRuleFunc: ((path: string, isDir: boolean) => boolean) | null = null;

  private _progressMessage: string = "";
  public _cache: CodeCache = {};
  public _dirCache: Record<string, any> = {};
  private _igManager: GitignoreManager | null = null;
  private _matchedProfile: ProjectProfile | null = null;
  private _discoveryTree: DiscoveryNode[] = [];
  public _lastDebugError: string = "None";
  private _baselineSnapshot: Map<string, { lines: number; mtime: number; reason: string }> = new Map();
  private _baselineTimestamp: string = "";
  private _outputChannel: vscode.OutputChannel;
  private _customRoot: string | undefined;

  public async setCustomRoot(newRoot: string | undefined) {
    let normalizedRoot = newRoot;
    if (normalizedRoot && process.platform === 'win32' && normalizedRoot.startsWith('/') && normalizedRoot.charAt(2) === ':') {
      normalizedRoot = normalizedRoot.substring(1);
    }
    if (normalizedRoot) {
      normalizedRoot = path.normalize(normalizedRoot).replace(/\\/g, '/');
    }
    this._customRoot = normalizedRoot;
    await this.context.workspaceState.update("codeCountCustomRoot", normalizedRoot);
    this.refresh(true); // Clear cache when changing root to avoid data mixup
    this._onDidChangeTreeData.fire(); // FORCE SIDEBAR SYNC
  }

  public getCustomRoot(): string | undefined {
    return this._customRoot;
  }

  public getGitignoreManager(): GitignoreManager | null {
    return this._igManager;
  }

  public getDiscoveryTree(): DiscoveryNode[] {
    return this._discoveryTree;
  }

  public getDetectedProfile(): ProjectProfile | null {
    return this._matchedProfile;
  }

  public log(message: string) {
    this._outputChannel.appendLine(
      `[${new Date().toLocaleTimeString()}] ${message}`,
    );
  }

  public getDisplayName(): string {
    return (
      vscode.extensions.getExtension("visual-lab.code-count-ai-context")
        ?.packageJSON?.displayName || "Code Count Monitor"
    );
  }

  public getAllTrackedFilesWithStats(): FileReportEntry[] {
    const root = this._customRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    return Object.entries(this._cache).map(([filePath, entry]) => ({
      relPath: path.relative(root, filePath).replace(/\\/g, "/"),
      totalLines: entry.lines,
      codeLines: entry.codeLines || 0,
      commentLines: entry.commentLines || 0,
      blankLines: entry.blankLines || 0,
    }));
  }

  public updateHasResultsContext() {
    const hasData = this._stats !== null && this._stats !== undefined;
    vscode.commands.executeCommand(
      "setContext",
      "codeCount.hasResults",
      hasData,
    );
  }

  constructor(private context: vscode.ExtensionContext) {
    this._outputChannel = vscode.window.createOutputChannel("Code Count");

    // Load initial TOON baseline
    const savedToon = this.context.workspaceState.get<string>("codeCountBaselineTOON");
    if (savedToon) {
       this._loadBaselineFromTOON(savedToon);
    }
    this.log("Initializing Provider...");

    // Load exclusion states from workspaceState
    this._isBulkExclusionEnabled = this.context.workspaceState.get<boolean>("codeCountBulkExclusionEnabled", true);
    this._isGitignoreEnabled = this.context.workspaceState.get<boolean>("codeCountGitignoreEnabled", true);
    this._isProfileExcludeEnabled = this.context.workspaceState.get<boolean>("codeCountProfileExcludeEnabled", true);
    this._isDependencyExcludeEnabled = this.context.workspaceState.get<boolean>("codeCountDependencyExcludeEnabled", true);
    this._autoAnalyzerEnabled = this.context.workspaceState.get<boolean>("codeCountAutoAnalyzerEnabled", true);
    this._dotExclusions = this.context.workspaceState.get<any>("codeCountDotExclusions", this._dotExclusions);
    this._disabledGitignoreSources = new Set(this.context.workspaceState.get<string[]>("codeCountDisabledGitignoreSources", []));
    this._manualExclusions = new Set(this.context.workspaceState.get<string[]>("codeCountManualExclusions", []));
    this._manualInclusions = new Set(this.context.workspaceState.get<string[]>("codeCountManualInclusions", []));

    // Load persisted custom root
    this._customRoot = this.context.workspaceState.get<string>("codeCountCustomRoot");

    // Load cache from workspace state
    this._cache =
      this.context.workspaceState.get<CodeCache>("codeCountCache") || {};
    this._stats =
      this.context.workspaceState.get<any>("codeCountGlobalStats") || null;

    // LEGACY CACHE FIX: Convert numeric 'imports' to { active, inactive }
    for (const filePath in this._cache) {
      if (typeof (this._cache[filePath].imports as any) === "number") {
        const val = this._cache[filePath].imports as any as number;
        this._cache[filePath].imports = { active: val, inactive: 0 };
      }
    }
    this.updateHasResultsContext();
    this.rebuildDirCache();
  }

  private rebuildDirCache() {
    this._dirCache = {};
    const root = this._customRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return;

    for (const [filePath, stats] of Object.entries(this._cache)) {
      let currentDir = path.dirname(filePath);
      while (currentDir.startsWith(root)) {
        if (!this._dirCache[currentDir]) {
          this._dirCache[currentDir] = {
            lines: 0,
            codeChars: 0,
            commentChars: 0,
            totalChars: 0,
            imports: { active: 0, inactive: 0 },
            fileCount: 0,
          };
        }
        const dStats = this._dirCache[currentDir];
        dStats.lines += stats.lines;
        dStats.codeChars += stats.codeChars || 0;
        dStats.commentChars += stats.commentChars || 0;
        dStats.totalChars += stats.totalChars || 0;
        dStats.imports.active += stats.imports?.active || 0;
        dStats.imports.inactive += stats.imports?.inactive || 0;
        dStats.fileCount += 1;

        if (currentDir === root) break;
        const parent = path.dirname(currentDir);
        if (parent === currentDir) break;
        currentDir = parent;
      }
    }
  }

  public getAnalysisReportData(): { trackedFiles: FileReportEntry[], excludedFiles: { path: string, reason: string }[] } {
    const root = this._customRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    const trackedFiles = this.getAllTrackedFilesWithStats();
    const excludedFiles: { path: string, reason: string }[] = [];
    
    // Scan all files in the discovery tree to find excluded ones
    const flatTree = this.getFlattenedDiscovery();
    for (const node of flatTree) {
      if (!node.isDir && node.ignoreReason) {
        excludedFiles.push({
          path: node.relPath,
          reason: node.ignoreReason
        });
      }
    }
    
    return { trackedFiles, excludedFiles };
  }

  public async saveSnapshotToState() {
    await this.context.workspaceState.update("codeCountCache", this._cache);
    await this.context.workspaceState.update("codeCountGlobalStats", this._stats);
  }

  public getContext(): vscode.ExtensionContext {
    return this.context;
  }

  refresh(clearCache: boolean = false) {
    if (clearCache) {
      this._stats = null;
      this._cache = {};
      this._dirCache = {};
      this._manualExclusions.clear();
      this._manualInclusions.clear();
      this._expandedPaths.clear();
      this._baselineSnapshot.clear();
      this._baselineTimestamp = "";
      this._isBulkExclusionEnabled = true;
      this._isGitignoreEnabled = true;
      this._isProfileExcludeEnabled = true;
      this._isDependencyExcludeEnabled = true;
      this._dotExclusions = { dotFold: true, dotFile: true, underscoreFold: true, underscoreFile: true };
      this._disabledGitignoreSources.clear();

      this.context.workspaceState.update("codeCountCache", undefined);
      this.context.workspaceState.update("codeCountGlobalStats", undefined);
      this.context.workspaceState.update("codeCountManualExclusions", undefined);
      this.context.workspaceState.update("codeCountManualInclusions", undefined);
      this.context.workspaceState.update("codeCountExpandedPaths", undefined);
      this.context.workspaceState.update("codeCountBaselineTOON", undefined);
      this.context.workspaceState.update("codeCountBaselineTimestamp", undefined);
      this.context.workspaceState.update("codeCountBulkExclusionEnabled", undefined);
      this.context.workspaceState.update("codeCountGitignoreEnabled", undefined);
      this.context.workspaceState.update("codeCountProfileExcludeEnabled", undefined);
      this.context.workspaceState.update("codeCountDependencyExcludeEnabled", undefined);
      this.context.workspaceState.update("codeCountDotExclusions", undefined);
      this.context.workspaceState.update("codeCountDisabledGitignoreSources", undefined);

      const config = vscode.workspace.getConfiguration("codeCount");
      config.update("manualExclusions", undefined, vscode.ConfigurationTarget.Workspace);
      config.update("manualInclusions", undefined, vscode.ConfigurationTarget.Workspace);
    }
    this._cache = this.context.workspaceState.get<CodeCache>("codeCountCache") || {};
    this._stats = this.context.workspaceState.get<any>("codeCountGlobalStats") || null;
    this.updateHasResultsContext();
    this._isAnalyzing = false;
    this._onDidChangeTreeData.fire();
  }

  async updateFileStats(uri: vscode.Uri) {
    const config = vscode.workspace.getConfiguration("codeCount");
    const enabled = config.get<boolean>("enabled") ?? true;
    if (!enabled) return;

    if (this.shouldIgnore(path.basename(uri.fsPath), undefined, false)) return;

    try {
      const filePath = uri.fsPath;
      if (!fs.existsSync(filePath) || fs.lstatSync(filePath).isDirectory()) return;

      const stat = fs.statSync(filePath);
      const cached = this._cache[filePath];
      const result = CodeAnalyzer.analyzeFileSync(filePath);
      const resultLines = result.total;
      const resultCodeChars = result.chars?.code || 0;
      const resultCommentChars = result.chars?.comment || 0;
      const resultTotalChars = result.chars?.total || 0;
      const resultImports = result.imports || { active: 0, inactive: 0 };

      const oldLines = cached?.lines || 0;
      const oldCodeChars = cached?.codeChars || 0;
      const oldCommentChars = cached?.commentChars || 0;
      const oldTotalChars = cached?.totalChars || 0;
      const oldImports = cached?.imports || { active: 0, inactive: 0 };
      const diffLines = resultLines - oldLines;
      const diffCodeChars = resultCodeChars - oldCodeChars;
      const diffCommentChars = resultCommentChars - oldCommentChars;
      const diffTotalChars = resultTotalChars - oldTotalChars;
      const diffImpActive = resultImports.active - oldImports.active;
      const diffImpInactive = resultImports.inactive - oldImports.inactive;
      const isNewFile = !cached;

      this._cache[filePath] = {
        mtimeMs: stat.mtimeMs,
        lines: resultLines,
        imports: resultImports,
        codeChars: resultCodeChars,
        commentChars: resultCommentChars,
        totalChars: resultTotalChars,
        codeLines: result.code,
        commentLines: result.comment,
        blankLines: result.blank,
      };

      const root = this._customRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (root) {
        let currentDir = path.dirname(filePath);
        while (currentDir.startsWith(root)) {
          if (!this._dirCache[currentDir]) {
            this._dirCache[currentDir] = { lines: 0, codeChars: 0, commentChars: 0, totalChars: 0, imports: { active: 0, inactive: 0 }, fileCount: 0 };
          }
          const dStats = this._dirCache[currentDir];
          dStats.lines += diffLines;
          dStats.codeChars += diffCodeChars;
          dStats.commentChars += diffCommentChars;
          dStats.totalChars += diffTotalChars;
          dStats.imports.active += diffImpActive;
          dStats.imports.inactive += diffImpInactive;
          if (isNewFile) dStats.fileCount += 1;
          if (currentDir === root) break;
          const parent = path.dirname(currentDir);
          if (parent === currentDir) break;
          currentDir = parent;
        }
      }

      if (this._stats) {
        let totalLines = 0; let totalFiles = 0; let maxLines = 0; let minLines = Infinity;
        for (const c of Object.values(this._cache)) {
          totalLines += c.lines; totalFiles++;
          if (c.lines > maxLines) maxLines = c.lines;
          if (c.lines < minLines) minLines = c.lines;
        }
        this._stats = { avg: totalFiles > 0 ? totalLines / totalFiles : 0, max: maxLines, min: minLines === Infinity ? 0 : minLines, totalFiles };
      }

      await this.context.workspaceState.update("codeCountCache", this._cache);
      if (this._stats) await this.context.workspaceState.update("codeCountGlobalStats", this._stats);
      this._onDidChangeTreeData.fire();
    } catch {}
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    const root = this._customRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return [];

    if (!element) {
      if (!this._stats) {
        const cachedGlobalStats = this.context.workspaceState.get<any>("codeCountGlobalStats");
        if (cachedGlobalStats) this._stats = cachedGlobalStats;
      }
      const isUnscanned = !this._stats && !this._isAnalyzing;
      const items: vscode.TreeItem[] = [];
      if (this._stats) {
        items.push(new DashboardItem(this._stats, path.basename(root), root));
      }
      items.push(...this.getDirItems(root, isUnscanned));
      return items;
    }

    if (element instanceof DashboardItem) {
      return [
        new StatDetailItem("Average lines", `${element.stats.avg.toFixed(1)}L`),
        new StatDetailItem("Maximum lines", `${element.stats.max}L`),
        new StatDetailItem("Minimum lines", `${element.stats.min}L`),
        new StatDetailItem("Analyzed files", `${element.stats.totalFiles}`),
      ];
    }

    if (element instanceof CodeCountItem) {
      return this.getDirItems(element.uri.fsPath, element.isUnscanned);
    }

    return [];
  }

  private getDirItems(dir: string, isUnscanned: boolean = false): CodeCountItem[] {
    const config = vscode.workspace.getConfiguration("codeCount");
    const showImports = config.get<boolean>("showImports") ?? false;
    const paddingStyle = config.get<string>("paddingStyle") ?? "exact";
    const root = this._customRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";

    try {
      // Auto-load .gitignore if found in this directory to ensure Tree View filter is accurate
      const localGitignore = path.join(dir, ".gitignore");
      if (fs.existsSync(localGitignore) && this._igManager) {
        this._igManager.addGitignore(dir);
      }

      return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => {
          const fullPath = path.join(dir, e.name);
          const relativePath = root ? path.relative(root, fullPath).replace(/\\/g, "/") : undefined;
          const isDirectory = e.isDirectory();
          const ignoreReason = this.shouldIgnore(e.name, relativePath, isDirectory);
          const isGitignored = ignoreReason === "Git";

          // Filter out items that should be completely ignored.
          // If it's ignored by Git but DOTlogic is also in play, we want to show it but dim the badge.
          if (ignoreReason && ignoreReason !== "Git") {
            return false;
          }
          return true;
        })
        .map((e) => {
          const isDir = e.isDirectory();
          const filePath = path.join(dir, e.name);

const relativePath = root ? path.relative(root, filePath).replace(/\\/g, "/") : undefined;
          const ignoreReason = this.shouldIgnore(e.name, relativePath, isDir);
          const isGitignored = ignoreReason === "Git";

          let cachedStats = null;

          if (!isDir) {
            const cacheHit = this._cache[filePath];
            if (cacheHit) {
              cachedStats = { lines: cacheHit.lines, imports: cacheHit.imports, codeChars: cacheHit.codeChars || 0, commentChars: cacheHit.commentChars || 0, totalChars: cacheHit.totalChars || 0 };
            }
          } else {
            const dStats = this._dirCache[filePath];
            cachedStats = dStats
              ? { lines: dStats.lines, imports: dStats.imports, codeChars: dStats.codeChars, commentChars: dStats.commentChars, totalChars: dStats.totalChars, fileCount: dStats.fileCount }
              : { lines: 0, imports: { active: 0, inactive: 0 }, codeChars: 0, commentChars: 0, totalChars: 0, fileCount: 0 };
          }

          return new CodeCountItem(
            vscode.Uri.file(filePath),
            isDir ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
            cachedStats, showImports, paddingStyle, isUnscanned, isGitignored,
          );
        });
    } catch (e: any) {
      this.log("getDirItems failed: " + e?.message);
      return [];
    }
  }

  public shouldIgnore(filename: string, relativePath?: string, isDir?: boolean): string | null {
    const config = vscode.workspace.getConfiguration("codeCount");
    const isBulk = this._isBulkExclusionEnabled;
    const lowName = filename.toLowerCase();

    const checkIsFolder = () => {
      if (isDir !== undefined) return isDir;
      if (!relativePath) return false;
      const root = this._customRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
      if (!root) return false;
      try {
        const p = path.join(root, relativePath);
        return fs.existsSync(p) && fs.lstatSync(p).isDirectory();
      } catch { return false; }
    };

    const isFolder = checkIsFolder();

    if (this.isHardExclude(filename, relativePath)) return "Hard";

    const pathParts = relativePath ? relativePath.split('/') : [filename];

    if (isBulk && this._isProfileExcludeEnabled && (config.get<boolean>("ignoreSystem") ?? true)) {
      const systemItems = [".git", ".vscode", ".DS_Store", "Thumbs.db"];
      if (pathParts.some(part => systemItems.some(s => part.toLowerCase() === s.toLowerCase()))) return "Profile";
    }

    if (isBulk && this._isProfileExcludeEnabled && (config.get<boolean>("ignoreBuild") ?? true) && this._matchedProfile) {
      const profileIgnoreFolders = this._matchedProfile.ignoreFolders || [];
      if (relativePath && profileIgnoreFolders.some((f: string) => relativePath === f || relativePath.startsWith(f + '/'))) return "Profile";
      if (pathParts.some(part => profileIgnoreFolders.some(f => part.toLowerCase() === f.toLowerCase()))) return "Profile";
    }

    if (isBulk && this._isDependencyExcludeEnabled && (config.get<boolean>("ignoreVenv") ?? true) && this._matchedProfile) {
      const profileDependencyFolders = this._matchedProfile.dependencyFolders || ["node_modules"];
      if (relativePath && profileDependencyFolders.some((d: string) => relativePath === d || relativePath.startsWith(d + '/'))) return "Dep";
      if (pathParts.some(part => profileDependencyFolders.some(d => part.toLowerCase() === d.toLowerCase()))) return "Dep";
    }

    const ignoreFiles = config.get<string[]>("ignoreFiles") || [];
    for (const pattern of ignoreFiles) {
      if (minimatch(filename, pattern)) return "UserConfig";
    }

    if (isBulk && this._isGitignoreEnabled && (config.get<boolean>("ignoreGitignored") ?? true) && relativePath && this._igManager) {
      // Ensure the path is tested as a directory if it is one
      const testPath = isFolder ? (relativePath.endsWith('/') ? relativePath : relativePath + '/') : relativePath;
      if (this._igManager.isIgnored(testPath)) {
        return "Git";
      }
    }

    if (isBulk) {
      if (filename.startsWith('.')) {
        if (isFolder) { if (this._dotExclusions.dotFold) return "Dot"; }
        else { if (this._dotExclusions.dotFile) return "Dot"; }
      }
      if (filename.startsWith('_')) {
        if (isFolder) { if (this._dotExclusions.underscoreFold) return "Dot"; }
        else { if (this._dotExclusions.underscoreFile) return "Dot"; }
      }

      if (this._isManualLogicEnabled && this._manualRuleFunc) {
        try {
          if (this._manualRuleFunc(relativePath || filename, isFolder)) return "Manual";
        } catch (e) { console.error("Manual rule Error:", e); }
      }
    }

    return null;
  }

  public isHardExclude(filename: string, _relativePath?: string): boolean {
    const lowName = filename.toLowerCase();
    return ["node_modules", ".git", ".next", ".nuxt", ".expo"].includes(lowName);
  }

  public detectProjectProfile(rootPath: string): { matchedProfile: ProjectProfile | null; matchedFile?: string; matchedDetail?: string } {
    for (const profile of profiles) {
      try {
        if (profile.customDetect) {
          const detail = (profile as any).customDetect(rootPath, fs, path);
          if (detail) {
            return { matchedProfile: profile, matchedFile: rootPath, matchedDetail: typeof detail === 'string' ? detail : profile.name };
          }
        } else {
          for (const file of profile.detectFiles) {
            if (fs.existsSync(path.join(rootPath, file))) {
              return { matchedProfile: profile, matchedFile: file, matchedDetail: file };
            }
          }
        }
      } catch (e) {
        this.log(`Error detecting profile ${profile.name}: ${e}`);
      }
    }
    return { matchedProfile: null };
  }

  public async runBackgroundScan(rootPath: string, resetBaseline: boolean = false, discoveryOnly: boolean = false) {
    let root = rootPath;
    if (process.platform === 'win32' && root.startsWith('/') && root.charAt(2) === ':') root = root.substring(1);
    root = path.normalize(root);

    if (this._isAnalyzing) { this.log("Scan already in progress. Skipping."); return; }
    this._isAnalyzing = true;
    this._onDidChangeTreeData.fire();
    this.log(`Step A: Starting scan for root: ${root}`);

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: resetBaseline ? (discoveryOnly ? "Code Count Step A: Discovery" : "Code Count Step B: Full Analysis") : "Code Count Step A: Rescan", cancellable: false },
      async (progress) => {　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　　
        let fileList: string[] = [];

        if (this._isManualLogicEnabled) this._updateManualRules();

        this._igManager = new GitignoreManager(root);

        const { matchedProfile } = this.detectProjectProfile(root);
        this._matchedProfile = matchedProfile;

        const discover = (dir: string, parentChildren: DiscoveryNode[]) => {
          const localGitignore = path.join(dir, ".gitignore");
          if (fs.existsSync(localGitignore)) this._igManager?.addGitignore(dir);

          let entries: fs.Dirent[] = [];
          try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
          catch (err: any) { this.log(`WARNING: Could not read directory ${dir}: ${err.message}`); return; }

          for (const e of entries) {
            const fullPath = path.join(dir, e.name);
            const relativePath = path.relative(root, fullPath).replace(/\\/g, "/");
            const isDirectory = e.isDirectory();
            const isHard = this.isHardExclude(e.name, relativePath);
            const ignoreReason = this.shouldIgnore(e.name, relativePath, isDirectory);

            const node: DiscoveryNode = { name: e.name, relPath: relativePath, isDir: isDirectory, children: [] };
            if (ignoreReason) node.ignoreReason = ignoreReason;
            parentChildren.push(node);

            if (isDirectory) {
              this._onDidDiscoverFile.fire({ path: relativePath, status: ignoreReason ? "SKIPPED" : "SCANNING" });
              if (!isHard) discover(fullPath, node.children);
              else this.log(`Step A: Hard-Excluding ${relativePath}`);
            } else if (e.isFile()) {
              if (ignoreReason) this._onDidDiscoverFile.fire({ path: relativePath, status: "SKIPPED" });
              else {
                fileList.push(fullPath);
                this._onDidDiscoverFile.fire({ path: relativePath, status: "INDEXED" });
              }
            }
          }
        };

        this._discoveryTree = [];
        this._lastDebugError = "Running...";
        try {
          if (!fs.existsSync(root)) {
            this.log(`ERROR: Root path does not exist: ${root}`);
            this._lastDebugError = `Root path does not exist: ${root}`;
          } else {
            discover(root, this._discoveryTree);
            this.log(`Step A: Discovery completed. Found ${this._discoveryTree.length} top-level nodes.`);
            this._lastDebugError = this._discoveryTree.length === 0
              ? "Tree is empty after discover()!"
              : `Completed successfully. Nodes: ${this._discoveryTree.length}`;
          }
        } catch (err: any) {
          this.log(`ERROR during discovery: ${err.message}`);
          this._lastDebugError = `Outer catch error: ${err.message}`;
        }

        if (discoveryOnly) {
          this._isAnalyzing = false;
          this._onDidDiscoverFile.fire({ path: "--- DISCOVERY COMPLETE ---", status: "DISCOVER_DONE" });
          this._onDidChangeTreeData.fire();
          return;
        }

        const total = fileList.length;
        let totals = { sum: 0, max: 0, min: Infinity, count: 0 };

        for (let i = 0; i < total; i++) {
          const filePath = fileList[i];
          const stats = CodeAnalyzer.analyzeFileSync(filePath);
          const mtimeMs = fs.existsSync(filePath) ? fs.statSync(filePath).mtimeMs : 0;
          this._cache[filePath] = {
            mtimeMs,
            lines: stats.total,
            imports: stats.imports || { active: 0, inactive: 0 },
            codeChars: stats.chars?.code || 0,
            commentChars: stats.chars?.comment || 0,
            totalChars: stats.chars?.total || 0,
            codeLines: stats.code,
            commentLines: stats.comment,
            blankLines: stats.blank,
          };
          totals.sum += stats.total; totals.count++;
          if (stats.total > totals.max) totals.max = stats.total;
          if (stats.total < totals.min) totals.min = stats.total;

          if (i % 25 === 0 || i === total - 1) {
            const percent = total > 0 ? Math.round(((i + 1) / total) * 100) : 100;
            progress.report({ message: `${percent}% (${i + 1}/${total} files)`, increment: total > 0 ? (25 / total) * 100 : 100 });
            this._onDidDiscoverFile.fire({ path: filePath, status: "ANALYZING", percent, current: i + 1, total });
          }
          if (i % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        }

        this._stats = { avg: totals.count > 0 ? totals.sum / totals.count : 0, max: totals.max, min: totals.min === Infinity ? 0 : totals.min, totalFiles: totals.count, lastScanTimestamp: new Date().toISOString() };
        this.rebuildDirCache();
        await this.context.workspaceState.update("codeCountGlobalStats", this._stats);
        await this.context.workspaceState.update("codeCountCache", this._cache);
        this.updateHasResultsContext();
        this._hasAnalyzed = true;
        this._isAnalyzing = false;
        this._onDidDiscoverFile.fire({ path: "--- ANALYSIS COMPLETE ---", status: "FINISHED" });
        this._onDidChangeTreeData.fire();
      }
    ).then(() => { this._isAnalyzing = false; }, (err) => {
      this.log("Background scan threw unhandled rejection: " + err);
      this._isAnalyzing = false;
    });
  }

  private _updateManualRules() {
    try {
      const mp = path.join(this.context.extensionPath, "src", "manual", "custom-rules.ts");
      if (fs.existsSync(mp)) {
        const content = fs.readFileSync(mp, "utf-8");
        const match = content.match(/export function shouldExclude\s*\([^)]*\)\s*(?::\s*boolean\s*)?\{([\s\S]*)\}/);
        if (match) {
          let body = match[1].trim();
          this._manualRuleFunc = new Function("path", "isDir", body) as any;
        } else this._manualRuleFunc = null;
      } else this._manualRuleFunc = null;
    } catch (e: any) {
      console.error("Failed to load manual rules:", e);
      this._manualRuleFunc = null;
    }
  }

  private _loadBaselineFromTOON(toon: string | undefined) {
    this._baselineSnapshot.clear();
    if (!toon || !toon.startsWith("!CC:v1;")) return;

    const lines = toon.split("\n");
    const header = lines[0].split(";");
    this._baselineTimestamp = header[1] || "";

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const segments = line.split(":");
      if (segments.length < 2) continue;

      const relPath = segments[0];
      const data = segments[1].split(";");

      this._baselineSnapshot.set(relPath, {
        lines: parseInt(data[0]) || 0,
        mtime: parseInt(data[1]) || 0,
        reason: data[2] || ""
      });
    }
  }

  public getBaselineInfo() {
    return {
      timestamp: this._baselineTimestamp,
      fileCount: this._baselineSnapshot.size
    };
  }

  public getDelta(relPath: string, currentLines: number): number | null {
    const base = this._baselineSnapshot.get(relPath);
    if (!base) return null;
    return currentLines - base.lines;
  }

  public async captureBaseline() {
    const root = this._customRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    if (!root) return;

    const timestamp = new Date().toISOString();
    let toon = `!CC:v1;${timestamp};${root}\n`;

    for (const relPath in this._cache) {
      const entry = this._cache[relPath];
      toon += `${relPath}:${entry.lines};${entry.mtimeMs};\n`;
    }

    await this.context.workspaceState.update("codeCountBaselineTOON", toon);
    this._loadBaselineFromTOON(toon);
    vscode.window.showInformationMessage(`Baseline captured: ${Object.keys(this._cache).length} files.`);
    this._onDidChangeTreeData.fire();
  }

  public generateMarkdownReport(mode: "essential" | "full" = "full"): string {
    const config = vscode.workspace.getConfiguration("codeCount");
    const threshold = config.get<number>("threshold") || 200;
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    const projectName = path.basename(root);

    const appName = this.getDisplayName();
    const generatedAt = new Date().toISOString();
    
    return `*Generated by ${appName}*\n\n# Code Count Report\n\nProject: ${projectName}\nGenerated: ${generatedAt}`;
  }
}
// ── Internal helper tree-item classes ──────────────────────────────────────



export class DashboardItem extends vscode.TreeItem {
  constructor(
    public readonly stats: any,
    public readonly projectName: string = "",
    public readonly projectRoot: string = "",
  ) {
    super("📊 Workspace Summary", vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "dashboard";
    const config = vscode.workspace.getConfiguration("codeCount");
    const enabled = config.get<boolean>("enabled") ?? true;
    this.description = (projectName ? `📁 ${projectName}` : "") + (enabled ? "" : " (PAUSED)");
    this.tooltip = (projectRoot ? `Project: ${projectRoot}\nOverall workspace line count statistics` : "Overall workspace line count statistics") + (enabled ? "" : "\n\nMonitoring is currently PAUSED.");
  }
}

export class StatDetailItem extends vscode.TreeItem {
  constructor(label: string, value: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = value;
  }
}




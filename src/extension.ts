import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";

import { minimatch } from "minimatch";
import { profiles } from "./profiles";
import { ProjectProfile } from "./profiles/types";
import { systemExcludes } from "./excludes";
import { GitignoreManager } from "./gitignore/manager";
import { getStrategistViewHtml } from "./variants/strategist-view";
import { DiscoveryNode, ReportNode } from "./discovery-types";
import { getAnalysisReportHtml, generateReportMarkdown, FileReportEntry } from "./variants/analysis-report-view";
import { CodeCountProvider } from "./provider";
type WelcomeState =
  | "report"
  | "welcome"
  | "setup-discovery"
  | "setup-filter"
  | "setup-preview";

class WebviewReportProvider {
  public static currentPanel: WebviewReportProvider | undefined;
  public static analysisPanel: WebviewReportProvider | undefined;
  
  public static async applyExplorerLayout() {
    try {
      await vscode.commands.executeCommand('vscode.setEditorLayout', {
        orientation: 0,
        groups: [
          { size: 0.25 },
          { size: 0.75 }
        ]
      });
    } catch (e) {
      console.warn("Failed to set editor layout:", e);
    }
  }

  private readonly _panel: vscode.WebviewPanel;
  private _igManager: GitignoreManager | null = null;
  private _savedState: any = null;
  private _disposables: vscode.Disposable[] = [];
  private _isManualLogicEnabled: boolean = false;

  private constructor(
    panel: vscode.WebviewPanel,
    private provider: CodeCountProvider,
    private readonly _context: vscode.ExtensionContext,
  ) {
    this._panel = panel;
    this._isManualLogicEnabled = !!this._context.workspaceState.get('isManualLogicEnabled', false);
    this.provider._isManualLogicEnabled = this._isManualLogicEnabled;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Listen for real discovery events from provider
    this.provider.onDidDiscoverFile(
      (data) => {
        this._panel.webview.postMessage({
          command: "discoveryUpdate",
          ...data,
        });

        // STEP B SYNC: When discovery or analysis is finished, force UI update to show tree
        if (data.status === "FINISHED" || data.status === "DISCOVER_DONE") {
          setTimeout(() => {
            this.update("setup-filter");
          }, 300);
        }
      },
      null,
      this._disposables,
    );

    // Initial load from configuration handled by provider constructor

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        console.log('[WEBVIEW][extension.ts] onDidReceiveMessage:', message && message.command ? message.command : message);
        switch (message.command) {
          case 'selectSample':
            {
              const samplePath = message.path;
              if (samplePath && fs.existsSync(samplePath)) {
                await this.provider.setCustomRoot(samplePath);
                this.update('setup-discovery');
              }
            }
            break;

          case 'changePath':
            const options: vscode.OpenDialogOptions = {
              canSelectMany: false,
              canSelectFolders: true,
              canSelectFiles: false,
              openLabel: 'Select Folder for Analysis'
            };
            const uri = await vscode.window.showOpenDialog(options);
            if (uri && uri[0]) {
              const newPath = uri[0].fsPath;
              await this.provider.setCustomRoot(newPath);
              // Switch to the discovery view first so the user can verify the path
              this.update('setup-discovery');
            }
            break;

          case 'openPath':
          case 'openFile':
            try {
              const root = message.isExtensionPath
                ? this._context.extensionPath
                : (this.provider.getCustomRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "");
              const targetPath = message.path;
              const fullPath = path.isAbsolute(targetPath)
                ? targetPath
                : path.join(root, targetPath);

              if (fs.existsSync(fullPath)) {
                if (fs.lstatSync(fullPath).isDirectory()) {
                  vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(fullPath));
                } else {
                  const doc = await vscode.workspace.openTextDocument(
                    vscode.Uri.file(fullPath),
                  );
                  const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
                  await WebviewReportProvider.applyExplorerLayout();

                  if (message.query) {
                    const text = doc.getText();
                    // Search for either id: "..." or id: '...' or id: `...`
                    const searchStr = `id: "${message.query}"`;
                    let index = text.indexOf(searchStr);

                    if (index === -1) {
                      // Try single quotes just in case
                      const searchStrAlt = `id: '${message.query}'`;
                      index = text.indexOf(searchStrAlt);
                    }

                    if (index !== -1) {
                      const pos = doc.positionAt(index);
                      editor.selection = new vscode.Selection(pos, pos);
                      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
                    }
                  }
                }
              } else {
                vscode.window.showErrorMessage(`File not found: ${fullPath}`);
              }
            } catch (e) {
              vscode.window.showErrorMessage(
                `Failed to open file or folder: ${message.path}`,
              );
            }
            return;

          case 'revealPath':
            try {
              const targetPath = message.path;
              if (!targetPath) return;

              let fullPath = targetPath;
              if (!path.isAbsolute(targetPath)) {
                const root = this.provider.getCustomRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
                fullPath = path.join(root, targetPath);
              }

              if (!fs.existsSync(fullPath)) {
                // If it's a dir-like path and missing, try to create it (especially for storage)
                if (!path.extname(fullPath)) {
                  fs.mkdirSync(fullPath, { recursive: true });
                }
              }

              if (fs.existsSync(fullPath)) {
                const uri = vscode.Uri.file(fullPath);
                await vscode.commands.executeCommand("revealInExplorer", uri);
              }
            } catch (e) {
              vscode.window.showErrorMessage(`Failed to reveal path: ${message.path}`);
            }
            return;

          case 'openConfig':
            try {
              const reason = message.reason;
              const relPath = message.path;
              const root = this.provider.getCustomRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";

              let targetFilePath = "";
              let lineNum = 1;

              if (reason === 'git') {
                const igMgr = this.provider.getGitignoreManager();
                if (igMgr) {
                  // Case 1: Clicked on a specific ignored file
                  const sourceDir = igMgr.getIgnoringSource(relPath);
                  if (sourceDir !== null) {
                    targetFilePath = path.join(root, sourceDir, '.gitignore');
                    lineNum = igMgr.findRuleLine(sourceDir, relPath);
                  } else {
                    // Case 2: Clicked on the .gitignore header itself
                    // In this case, relPath is the directory containing the .gitignore
                    const fullGitignorePath = path.join(root, relPath, '.gitignore');
                    if (fs.existsSync(fullGitignorePath)) {
                      targetFilePath = fullGitignorePath;
                      lineNum = 1;
                    }
                  }
                }
              } else {
                // For 'prof' or 'dep', first check if it's a project file (VIA)
                const projectPath = path.join(root, relPath);
                if (fs.existsSync(projectPath)) {
                  targetFilePath = projectPath;
                } else {
                  // Then check if it's an extension-internal file (DEF)
                  const extPath = path.join(this._context.extensionPath, relPath);
                  if (fs.existsSync(extPath)) {
                    targetFilePath = extPath;
                  }
                }
              }

              if (targetFilePath && fs.existsSync(targetFilePath)) {
                const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(targetFilePath));
                const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
                await WebviewReportProvider.applyExplorerLayout();

                if (message.query) {
                  const text = doc.getText();
                  const lines = text.split('\n');
                  const query = message.query;

                  // Search for the ID (e.g., id: "nextjs")
                  // We use a regex to handle different quoting styles or no quotes
                  const idRegex = new RegExp(`id:\\s*["'\`]?${query}["'\`]?`, 'i');
                  const targetLineIdx = lines.findIndex(l => idRegex.test(l));

                  if (targetLineIdx !== -1) {
                    lineNum = targetLineIdx + 1;
                  }
                }

                if (lineNum > 1) {
                  const position = new vscode.Position(lineNum - 1, 0);
                  editor.selection = new vscode.Selection(position, position);
                  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
                  // Highlight the line briefly
                  const lineRange = doc.lineAt(lineNum - 1).range;
                  editor.selection = new vscode.Selection(lineRange.start, lineRange.end);
                }
              } else {
                vscode.window.showErrorMessage(`Configuration file not found.`);
              }
            } catch (e) {
              vscode.window.showErrorMessage(`Failed to open configuration.`);
            }
            return;
          case 'generateGitignore':
            this.provider.log("Webview Request: generateGitignore");
            try {
              const root = this.provider.getCustomRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
              if (!root) throw new Error("No workspace root found.");

              // 1. Determine template name based on detected profile
              let profile = this.provider.getDetectedProfile();
              if (!profile) {
                const { matchedProfile } = this.provider.detectProjectProfile(root);
                profile = matchedProfile;
              }
              const currentProfileId = profile?.id || 'generic';
              const templateMap: Record<string, string> = {
                'javascript': 'Node',
                'typescript': 'Node',
                'python': 'Python',
                'go': 'Go',
                'rust': 'Rust',
                'java': 'Java',
                'cpp': 'C++',
                'csharp': 'VisualStudio',
                'php': 'PHP',
                'ruby': 'Ruby',
                'swift': 'Swift',
                'kotlin': 'Kotlin',
                'dart': 'Dart',
                'elixir': 'Elixir'
              };
              const templateName = templateMap[currentProfileId] || null;

              let gitignoreContent = "";
              let fetchedFromGithub = false;

              // 2. Try fetching from GitHub
              if (templateName) {
                try {
                  const fetchTemplate = (name: string): Promise<string> => {
                    return new Promise((resolve, reject) => {
                      const options = {
                        hostname: 'api.github.com',
                        path: `/gitignore/templates/${name}`,
                        headers: { 'User-Agent': 'vscode-code-count-extension' }
                      };
                      https.get(options, (res: any) => {
                        let data = '';
                        res.on('data', (chunk: any) => data += chunk);
                        res.on('end', () => {
                          try {
                            const json = JSON.parse(data);
                            resolve(json.source || "");
                          } catch (e) { resolve(""); }
                        });
                      }).on('error', reject);
                    });
                  };
                  gitignoreContent = await fetchTemplate(templateName);
                  if (gitignoreContent) fetchedFromGithub = true;
                } catch (e) {
                  console.error("GitHub API failed, falling back to local generation");
                }
              }

              // 3. Fallback: Generate based on profile settings
              if (!gitignoreContent) {
                const ignores = [
                  ...(profile?.ignoreFolders || []),
                  ...(profile?.dependencyFolders || [])
                ];
                gitignoreContent = "# .gitignore generated by Code Count\n" +
                  ignores.map(f => `/${f}/`).join('\n') +
                  "\n\n# Local / OS files\n.DS_Store\nThumbs.db\n.vscode/";
              }

              // 4. Write file and notify
              const filePath = path.join(root, '.gitignore');
              fs.writeFileSync(filePath, gitignoreContent);

              vscode.window.showInformationMessage(
                fetchedFromGithub
                  ? `.gitignore generated using GitHub ${templateName} template.`
                  : `.gitignore generated from project profile.`
              );

              // 5. Trigger refresh and re-scan to discover the new file
              await this.provider.refresh(true);
              await this.provider.runBackgroundScan(root, true); // Re-run discovery

              // 6. Push latest state to webview
              this.update('setup-filter');

            } catch (e: any) {
              vscode.window.showErrorMessage(`Failed to generate .gitignore: ${e.message}`);
            }
            return;
          case "commitReviewResult":
            try {
              const config = vscode.workspace.getConfiguration("codeCount");
              // Update workspace configuration
              await config.update("manualExclusions", message.exclusions, vscode.ConfigurationTarget.Workspace);
              await config.update("manualInclusions", message.inclusions, vscode.ConfigurationTarget.Workspace);

              if (message.disabledGitSources) {
                this._savedState = this._savedState || { view: 'setup-filter', selection: [], toggles: {} };
                this._savedState.toggles = this._savedState.toggles || {};
                this._savedState.toggles.disabledGitSources = message.disabledGitSources;
                this.provider._disabledGitignoreSources = new Set(message.disabledGitSources);
              }

              vscode.window.showInformationMessage("Exclusions saved for this workspace.");

              // Force refresh the interface to rerender dots and git with proper USER badges
              this.update("setup-filter");
            } catch (e) {
              vscode.window.showErrorMessage(`Failed to save exclusions: ${e}`);
            }
            return;
          case "updateThreshold":
            try {
              const config = vscode.workspace.getConfiguration("codeCount");
              await config.update(
                "threshold",
                message.value,
                vscode.ConfigurationTarget.Workspace,
              );
              // Refresh the appropriate view based on which panel received the message
              if (this === WebviewReportProvider.analysisPanel) {
                this.updateAnalysisReport();
              } else {
                this.update();
              }
            } catch (e) {
              vscode.window.showErrorMessage(
                `Failed to update threshold: ${e}`,
              );
            }
            return;
          case "startAnalysis":
            console.log("[DEBUG] startAnalysis command received");
            const rootForAnalysis = this.provider.getCustomRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            console.log("[DEBUG] rootForAnalysis:", rootForAnalysis);
            if (rootForAnalysis) {
              console.log("[DEBUG] Starting background scan...");
              try {
                await this.provider.runBackgroundScan(rootForAnalysis, true, false); // Step B: Full Analysis
                console.log("[DEBUG] Background scan completed successfully");
                console.log("[DEBUG] Calling showFullAnalysisReport...");
                await WebviewReportProvider.showFullAnalysisReport(this.provider, this._context);
                console.log("[DEBUG] showFullAnalysisReport completed");
              } catch (error) {
                console.error("[DEBUG] Error during analysis:", error);
                vscode.window.showErrorMessage(`Analysis failed: ${error}`);
              }
            } else {
              console.log("[DEBUG] No root path found for analysis");
              vscode.window.showErrorMessage("No workspace folder found for analysis");
            }
            return;
          case "startSetup":
            // Changes: Run discovery only when the user clicks the button.
            this.provider._hasAnalyzed = false;
            const rootForScan = this.provider.getCustomRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (rootForScan) {
              // Ensure the terminal state is ready
              this._panel.webview.postMessage({ command: 'discoveryUpdate', status: 'STARTING', path: rootForScan });
              await this.provider.runBackgroundScan(rootForScan, true, true); // Step A: Discovery Only
              // The listener in constructor will handle transition to 'setup-filter' automatically.
            }
            return;
          case "addProjectIgnore":
            try {
              const folder = message.folder;
              if (folder) {
                const config = vscode.workspace.getConfiguration("codeCount");
                const current = config.get<string[]>("projectOverrides") || [];
                if (!current.includes(folder)) {
                  await config.update(
                    "projectOverrides",
                    [...current, folder],
                    vscode.ConfigurationTarget.Global, // Store in Global for simplicity, scoped to this project if logic allowed but User requested extension storage
                  );
                }
              }
              // Re-render current state
              this.update("setup-filter");
            } catch (e) {
              vscode.window.showErrorMessage(`Failed to add exclusion: ${e}`);
            }
            return;
          case "completeDiscovery":
            this.provider._hasDiscovered = true;
            this.update("setup-filter");
            return;
          case 'applyFilter':
            if (!this._savedState) this._savedState = { view: 'setup-filter', selection: [], toggles: {} };
            this._savedState.selection = message.folders || [];
            this._savedState.toggles = message.toggles || {};
            if (this._savedState.toggles.disabledGitSources) {
              this.provider._disabledGitignoreSources = new Set(this._savedState.toggles.disabledGitSources);
            } else {
              this.provider._disabledGitignoreSources.clear();
            }
            this._panel!.webview.html = this._getSetupPreviewHtml();
            return;
          case "backToWelcome":
            this.update("welcome");
            return;
          case "backDiscovery":
            this.update("setup-discovery");
            return;
          case "backToFilter":
            this.update("setup-filter");
            return;
          case "runFinalScan":
            await this.provider
              .getContext()
              .workspaceState.update("hasCompletedSetup", true);
            vscode.commands.executeCommand("codeCount.refresh");
            await WebviewReportProvider.showFullAnalysisReport(this.provider, this._context);
            return;
          case "exportMarkdown":
            vscode.commands.executeCommand("codeCount.exportReport");
            return;
          case "showReport":
            await WebviewReportProvider.showFullAnalysisReport(this.provider, this._context);
            return;
          case "backToStrategist":
            WebviewReportProvider.createOrShow(this.provider, this._context);
            return;
          case "re-setup":
            this.update("setup-discovery");
            setTimeout(() => {
              this.update("setup-filter");
            }, 1000);
            return;
          case 'updateBulkSync':
            this.provider._isBulkExclusionEnabled = !!message.active;
            await this._context.workspaceState.update('codeCountBulkExclusionEnabled', this.provider._isBulkExclusionEnabled);
            this.update('setup-filter');
            return;
          case 'updateManualOverride':
            {
              const { path: overridePath, excluded, included } = message;
              this._applyManualOverrideRecursively(overridePath, !!excluded, !!included);
              this.update('setup-filter');
            }
            return;
          case 'resetManualOverrides':
            try {
              this.provider._manualExclusions.clear();
              this.provider._manualInclusions.clear();
              const settings = vscode.workspace.getConfiguration("codeCount");
              await settings.update("manualExclusions", [], vscode.ConfigurationTarget.Workspace);
              await settings.update("manualInclusions", [], vscode.ConfigurationTarget.Workspace);
              this.update('setup-filter');
            } catch (e) {
              console.error("Failed to reset overrides:", e);
            }
            return;
          case 'updateGitSync':
            {
              const { src, active } = message;
              if (active) {
                this.provider._disabledGitignoreSources.delete(src);
              } else {
                this.provider._disabledGitignoreSources.add(src);
              }
              await this._context.workspaceState.update('codeCountDisabledGitignoreSources', Array.from(this.provider._disabledGitignoreSources));
              this.update('setup-filter');
            }
            return;
          case 'updateStackSync':
            this.provider._isProfileExcludeEnabled = !!message.active;
            this.provider._isDependencyExcludeEnabled = !!message.active;
            await this._context.workspaceState.update('codeCountProfileExcludeEnabled', this.provider._isProfileExcludeEnabled);
            await this._context.workspaceState.update('codeCountDependencyExcludeEnabled', this.provider._isDependencyExcludeEnabled);
            this.update('setup-filter');
            return;
          case 'updateProfileSync':
            this.provider._isProfileExcludeEnabled = !!message.active;
            await this._context.workspaceState.update('codeCountProfileExcludeEnabled', this.provider._isProfileExcludeEnabled);
            this.update('setup-filter');
            return;
          case 'updateDependencySync':
            this.provider._isDependencyExcludeEnabled = !!message.active;
            await this._context.workspaceState.update('codeCountDependencyExcludeEnabled', this.provider._isDependencyExcludeEnabled);
            this.update('setup-filter');
            return;
          case 'toggleAutoAnalyzer':
            this.provider._autoAnalyzerEnabled = !!message.active;
            await this._context.workspaceState.update('codeCountAutoAnalyzerEnabled', this.provider._autoAnalyzerEnabled);
            this.update('setup-filter');
            // Check if analysis needs to run when turned ON
            if (this.provider._autoAnalyzerEnabled && !this.provider._isAnalyzing) {
              // We could run analysis here, but let's wait until manual triggers unless specs say otherwise. Actually, specs say "Run full analysis automatically upon loading Strategist View", we handle that in update/refresh logic.
            }
            return;
          case 'updateGitignoreSync':
            this.provider._isGitignoreEnabled = !!message.active;
            await this._context.workspaceState.update('codeCountGitignoreEnabled', this.provider._isGitignoreEnabled);
            this.update('setup-filter');
            return;
          case 'updateDotMasterSync':
            this.provider._dotExclusions.dotFold = !!message.active;
            this.provider._dotExclusions.underscoreFold = !!message.active;
            this.provider._dotExclusions.dotFile = !!message.active;
            this.provider._dotExclusions.underscoreFile = !!message.active;
            await this._context.workspaceState.update('codeCountDotExclusions', this.provider._dotExclusions);
            this.update('setup-filter');
            return;
          case 'updateDotSync':
            {
              const { type, enabled } = message;
              if (type === 'dotFold') this.provider._dotExclusions.dotFold = enabled;
              if (type === 'dotFile') this.provider._dotExclusions.dotFile = enabled;
              if (type === 'underscoreFold') this.provider._dotExclusions.underscoreFold = enabled;
              if (type === 'underscoreFile') this.provider._dotExclusions.underscoreFile = enabled;
              await this._context.workspaceState.update('codeCountDotExclusions', this.provider._dotExclusions);
              this.update('setup-filter');
            }
            return;
          // --- Strategist View command aliases ---
          case 'toggleGitignore':
            this.provider._isGitignoreEnabled = !!message.value;
            await this._context.workspaceState.update('codeCountGitignoreEnabled', this.provider._isGitignoreEnabled);
            this.update('setup-filter');
            return;
          case 'toggleProfileExclude':
            this.provider._isProfileExcludeEnabled = !!message.value;
            await this._context.workspaceState.update('codeCountProfileExcludeEnabled', this.provider._isProfileExcludeEnabled);
            this.update('setup-filter');
            return;
          case 'toggleDependencyExclude':
            this.provider._isDependencyExcludeEnabled = !!message.value;
            await this._context.workspaceState.update('codeCountDependencyExcludeEnabled', this.provider._isDependencyExcludeEnabled);
            this.update('setup-filter');
            return;
          case 'updateDotExclusion':
            {
              const key = message.key as 'dotFold' | 'dotFile' | 'underscoreFold' | 'underscoreFile';
              if (key in this.provider._dotExclusions) {
                this.provider._dotExclusions[key] = !!message.value;
              }
              await this._context.workspaceState.update('codeCountDotExclusions', this.provider._dotExclusions);
              this.update('setup-filter');
            }
            return;
          case 'toggleGitignoreSource':
            {
              const src = message.relPath || message.path;
              if (message.value) {
                this.provider._disabledGitignoreSources.delete(src);
              } else {
                this.provider._disabledGitignoreSources.add(src);
              }
              await this._context.workspaceState.update('codeCountDisabledGitignoreSources', Array.from(this.provider._disabledGitignoreSources));
              this.provider.refresh();
              this.update('setup-filter');
            }
            return;
          case 'peekGitignore':
            try {
              const filePath = message.path;
              if (filePath && fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                const escaped = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const root = this.provider.getCustomRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
                const relId = path.relative(root, path.dirname(filePath)).replace(/\\/g, '/') || '.';
                this._panel?.webview.postMessage({ command: 'peekResult', id: relId, content: escaped });
              }
            } catch (e) {
              console.error('Failed to peek gitignore:', e);
            }
            return;
          case 'toggleManual':
            {
              const relPath = message.path;
              const shouldExclude = !!message.value;
              this._applyManualOverrideRecursively(relPath, shouldExclude, !shouldExclude);
              this.update('setup-filter');
            }
            return;
          case 'toggleExpansion':
            {
              const relPath = message.path;
              if (this.provider._expandedPaths.has(relPath)) {
                this.provider._expandedPaths.delete(relPath);
              } else {
                this.provider._expandedPaths.add(relPath);
              }
              this.update('setup-filter');
            }
            return;
          case 'collapseAll':
            {
              this.provider._expandedPaths.clear();
              await this._context.workspaceState.update('codeCountExpandedPaths', []);
              this.update('setup-filter');
            }
            return;
          case "openGitignore":
            try {
              const root =
                this.provider.getCustomRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
              const gp = path.join(root, ".gitignore");
              if (fs.existsSync(gp)) {
                const doc = await vscode.workspace.openTextDocument(gp);
                await vscode.window.showTextDocument(doc);
              }
            } catch (e) { }
            return;
          case "openSourceFile":
            try {
              const root = message.path;
              const file = message.file;
              if (!root || !file) return;

              const fullPath = path.isAbsolute(file) ? file : path.join(root, file);
              if (fs.existsSync(fullPath)) {
                const doc = await vscode.workspace.openTextDocument(fullPath);
                await vscode.window.showTextDocument(doc, { preview: true });
              }
            } catch (e) { }
            return;
          case "changeWorkspaceFolder":
            try {
              const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
              const defaultUri = root ? vscode.Uri.file(path.dirname(root)) : undefined;

              const result = await vscode.window.showOpenDialog({
                canSelectFolders: true,
                canSelectFiles: false,
                canSelectMany: false,
                openLabel: "Select Project Folder",
                defaultUri: defaultUri,
              });
              if (result && result.length > 0) {
                vscode.commands.executeCommand(
                  "vscode.openFolder",
                  result[0],
                  false,
                );
              }
            } catch (e) {
              vscode.window.showErrorMessage(`Failed to change project: ${e}`);
            }
            return;
          case "fetchFilesForFolder":
            try {
              const root =
                vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
              const folderRelPath = message.path;
              const folderFullPath = path.join(root, folderRelPath);

              if (
                fs.existsSync(folderFullPath) &&
                fs.lstatSync(folderFullPath).isDirectory()
              ) {
                const files = fs
                  .readdirSync(folderFullPath, { withFileTypes: true })
                  .filter((dirent) => dirent.isFile())
                  .map((dirent) => {
                    const name = dirent.name;
                    const relPath = folderRelPath
                      ? `${folderRelPath}/${name}`
                      : name;
                    const relPathWithSlash = relPath;

                    const isGitignored = this._igManager
                      ? this._igManager.isIgnored(relPathWithSlash)
                      : false;
                    const ext = path.extname(name).toLowerCase() || "(no ext)";

                    return {
                      name,
                      relPath,
                      isFile: true,
                      isGitignored,
                      ext,
                    };
                  });

                this._panel.webview.postMessage({
                  command: "folderFiles",
                  path: folderRelPath,
                  files,
                });
              }
            } catch (e) { }
            return;
          case "restartSetup":
            this.update("setup-discovery");
            return;
          case "toggleManualLogic":
            this._isManualLogicEnabled = !!message.active;
            this.provider._isManualLogicEnabled = this._isManualLogicEnabled;
            this._context.workspaceState.update('isManualLogicEnabled', this._isManualLogicEnabled);
            this.update("setup-filter");
            return;
          case "openManual":
            try {
              // The custom rules file exists within the extension's source, not the target project.
              const projectMp = path.join(this._context.extensionPath, "src", "manual", "custom-rules.ts");

              if (fs.existsSync(projectMp)) {
                const doc = await vscode.workspace.openTextDocument(projectMp);
                const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
                await WebviewReportProvider.applyExplorerLayout();
              } else {
                vscode.window.showErrorMessage("Custom rules file not found in extension: " + projectMp);
              }
            } catch (e) { }
            return;
          case 'captureBaseline':
            await this.provider.captureBaseline();
            this.update('setup-filter');
            return;
          case "saveCustomProfile":
            try {
              const root =
                vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
              const profilePath = path.join(root, "cc-profile.json");
              const profileData = {
                name: "Custom Project Profile",
                description:
                  "Auto-generated from user selection in Code Count Setup Guide",
                timestamp: new Date().toISOString(),
                ignoreFiles: message.selection || [],
              };
              fs.writeFileSync(
                profilePath,
                JSON.stringify(profileData, null, 2),
              );
              vscode.window.showInformationMessage(
                `✅ Custom profile saved to cc-profile.json`,
              );
            } catch (e) {
              vscode.window.showErrorMessage(
                `Failed to save custom profile: ${e}`,
              );
            }
            return;
          case "error":
            this.provider.log(`Webview JS Error: ${message.text}`);
            return;
          case 'refresh':
            vscode.commands.executeCommand("codeCount.refresh");
            return;
          case 'confirmBulkDisable':
            vscode.window.showWarningMessage(
              'Disabling bulk exclusion may list many items and cause performance issues. Continue?',
              'Yes',
              'No'
            ).then(selection => {
              if (selection === 'Yes') {
                this.provider._isBulkExclusionEnabled = false;
                this._context.workspaceState.update('codeCountBulkExclusionEnabled', false);
                this.update('setup-filter');
              } else {
                // Send message to revert the checkbox
                this._panel.webview.postMessage({ command: 'revertBulkSwitch' });
              }
            });
            return;
        }
      },
      null,
      this._disposables,
    );
    this.update();
  }

  public static createOrShow(
    provider: CodeCountProvider,
    context: vscode.ExtensionContext,
    mode: WelcomeState = "report",
  ) {
    if (WebviewReportProvider.currentPanel) {
      WebviewReportProvider.currentPanel._panel.reveal(
        vscode.ViewColumn.One,
      );
      WebviewReportProvider.currentPanel.update(mode);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "codeCountReport",
      "Code Audit Report",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    WebviewReportProvider.currentPanel = new WebviewReportProvider(
      panel,
      provider,
      context,
    );
    WebviewReportProvider.currentPanel.update(mode);
  }

  public static async showFullAnalysisReport(
    provider: CodeCountProvider,
    context: vscode.ExtensionContext,
  ) {
    // If no analysis data exists, run a background scan first
    try {
      const files = provider.getAllTrackedFilesWithStats();
      if (!files || files.length === 0) {
        const root = provider.getCustomRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (root) {
          await provider.runBackgroundScan(root, true, false);
        }
      }
    } catch (e) {
      console.warn("Pre-scan for full report failed", e);
    }

    if (WebviewReportProvider.analysisPanel) {
      WebviewReportProvider.analysisPanel._panel.reveal(vscode.ViewColumn.Beside);
      WebviewReportProvider.analysisPanel.updateAnalysisReport();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "codeCountFullReport",
      "STEP C",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    WebviewReportProvider.analysisPanel = new WebviewReportProvider(
      panel,
      provider,
      context,
    );

    panel.onDidDispose(() => {
      WebviewReportProvider.analysisPanel = undefined;
    }, null, []);

    WebviewReportProvider.analysisPanel.updateAnalysisReport();
    await WebviewReportProvider.applyReportLayout();
  }

  private updateAnalysisReport() {
    const root = this.provider.getCustomRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    const projectName = path.basename(root);
    const files = (this.provider as any).getAllTrackedFilesWithStats();
    const config = vscode.workspace.getConfiguration("codeCount");
    const threshold = config.get<number>("threshold") || 200;
    this._panel.webview.html = getAnalysisReportHtml(root, files, projectName, threshold);
  }



  public update(mode: WelcomeState = "report") {
    if (mode === "setup-discovery") {
      this._panel.webview.html = this._getSetupDiscoveryHtml();
      this._panel.title = "🔎 COL:STEP A Discovering Project";
    } else if (mode === "setup-filter" || mode === "report") {
      const root = this.provider.getCustomRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
      try {
        const gitignoreData = this._getGitignoreDataForStrategist(root);

        // Ensure the manager has the latest disabled sources before rendering
        const igMgr = this.provider.getGitignoreManager();
        if (igMgr) {
          igMgr.setDisabledSources(this.provider._disabledGitignoreSources);
        }

        this._panel.webview.html = getStrategistViewHtml(
          root,
          this.provider.getDiscoveryTree(),
          igMgr,
          this._detectProjectProfile(),
          gitignoreData,
          {
            isProfileExcludeEnabled: this.provider._isProfileExcludeEnabled,
            isDependencyExcludeEnabled: this.provider._isDependencyExcludeEnabled,
            isGitignoreEnabled: this.provider._isGitignoreEnabled,
            isManualLogicEnabled: this.provider._isManualLogicEnabled,
            isBulkExclusionEnabled: this.provider._isBulkExclusionEnabled,
            disabledGitignoreSources: Array.from(this.provider._disabledGitignoreSources),
            dotExclusions: this.provider._dotExclusions,
            manualExclusions: Array.from(this.provider._manualExclusions),
            manualInclusions: Array.from(this.provider._manualInclusions),
            hasAnalyzed: this.provider._hasAnalyzed || false,
            isAnalyzing: this.provider._isAnalyzing || false,
            isAutoAnalyzerEnabled: this.provider._autoAnalyzerEnabled,
            lastDebugError: this.provider._lastDebugError || "None",
            baselineInfo: { timestamp: Date.now(), fileCount: 0 },
            getDelta: (relP: string, lines: number) => this.provider.getDelta(relP, lines),
            expandedPaths: Array.from(this.provider._expandedPaths),
          },
        );
        this._panel.title = `⚙️ LOC:STEP B`;
      } catch (err: any) {
        vscode.window.showErrorMessage("Failed to render Strategist View: " + err.message);
        this._panel.webview.html = `<html><body><h2>Error rendering view</h2><pre>${err.stack}</pre></body></html>`;
      }
    } else if (mode === "setup-preview") {
      this._panel.webview.html = this._getSetupPreviewHtml();
      this._panel.title = "🔍 Code Count: Scan Preview";
    }
  }

  public static async applyReportLayout() {
    // Splits editor into 30% (Strategist) and 70% (Report) columns
    try {
      await vscode.commands.executeCommand('vscode.setEditorLayout', {
        orientation: 0,
        groups: [
          { size: 0.3 }, // Strategist in Col 1
          { size: 0.7 }  // Report in Col 2
        ]
      });
    } catch (e) {
      console.warn("Failed to set report layout:", e);
    }
  }

  private async _applyManualOverrideRecursively(targetPath: string, shouldExclude: boolean, shouldInclude: boolean) {
    const updateSets = (p: string) => {
      if (shouldExclude) {
        this.provider._manualExclusions.add(p);
        this.provider._manualInclusions.delete(p);
      } else if (shouldInclude) {
        this.provider._manualInclusions.add(p);
        this.provider._manualExclusions.delete(p);
      } else {
        this.provider._manualExclusions.delete(p);
        this.provider._manualInclusions.delete(p);
      }
    };

    updateSets(targetPath);

    // Recursive propagation
    const allNodes = this.provider.getFlattenedDiscovery();
    for (const node of allNodes) {
      if (node.relPath.startsWith(targetPath + '/')) {
        updateSets(node.relPath);
      }
    }

    // Persist to Workspace Config (Settings)
    const settings = vscode.workspace.getConfiguration("codeCount");
    await settings.update("manualExclusions", Array.from(this.provider._manualExclusions), vscode.ConfigurationTarget.Workspace);
    await settings.update("manualInclusions", Array.from(this.provider._manualInclusions), vscode.ConfigurationTarget.Workspace);

    // Also persist to workspaceState for immediate context
    await this._context.workspaceState.update('codeCountManualExclusions', Array.from(this.provider._manualExclusions));
    await this._context.workspaceState.update('codeCountManualInclusions', Array.from(this.provider._manualInclusions));
  }

  public dispose() {
    WebviewReportProvider.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }

  private _getGitignoreDataForStrategist(root: string): any[] {
    const ig = this.provider.getGitignoreManager() || new GitignoreManager(root);
    const sources = ig.getAllSources();
    return sources.map(src => {
      const filePath = src === "." ? path.join(root, ".gitignore") : path.join(root, src, ".gitignore");
      let content = "Error reading .gitignore";
      let summary = "No rules found";
      let ruleCount = 0;
      try {
        if (fs.existsSync(filePath)) {
          content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
          ruleCount = lines.length;
          summary = lines.slice(0, 5).join(", ") + (lines.length > 5 ? "..." : "");
        }
      } catch (e) { }
      return {
        relPath: src,
        fullPath: filePath,
        ruleCount,
        content,
        summary,
        disabled: this.provider._disabledGitignoreSources.has(src)
      };
    });
  }

  /**
   * Centralizes the HTML boilerplate, CSS, and Design System tokens.
   */
  private _getCommonHtml(body: string, title: string = "Code Count"): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<script>
  window.openPath = (path, isFile = false, isExtensionPath = false, query = '') => {
    var vscode = acquireVsCodeApi();
    vscode.postMessage({ 
      command: 'openPath', 
      path: path, 
      isFile: isFile, 
      isExtensionPath: isExtensionPath,
      query: query
    });
  };
</script>
<style>
  .click-path { color: var(--accent); cursor: pointer; text-decoration: underline; opacity: 0.8; transition: opacity 0.2s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; vertical-align: bottom; }
  .click-path:hover { opacity: 1; }
  :root {
    --glass-bg: var(--vscode-sideBar-background, rgba(255,255,255,0.03));
    --glass-border: var(--vscode-panel-border, rgba(255,255,255,0.1));
    --accent: var(--vscode-button-background, #007acc);
    --accent-fg: var(--vscode-button-foreground, #ffffff);
    --text-muted: var(--vscode-descriptionForeground, #858585);
    
    /* Font Scale (User Defined) */
    --font-s: 14px;
    --font-m: 17px;
    --font-l: 22px;

    /* Spacing */
    --gap-s: 8px;
    --gap-m: 16px;
    --gap-l: 32px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif);
    font-size: var(--font-s);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: var(--gap-m);
    line-height: 1.5;
    overflow-x: hidden;
  }
  .container { max-width: 640px; margin: 0 auto; }
  
  /* Area: Hero */
.hero {
  margin-bottom: var(--gap-l);
  padding: 24px;
  border-radius: 12px;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(8px);
  position: relative;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
}
.hero-bg-icon {
  position: absolute;
  top: -20px;
  right: -20px;
  font-size: 160px;
  opacity: 0.05;
  pointer-events: none;
  filter: blur(2px);
}
.hero-icon-large {
  font-size: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  background: rgba(255,255,255,0.03);
  border-radius: 16px;
  border: 1px solid var(--glass-border);
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}
.hero h1 { font-size: var(--font-l); margin-bottom: 4px; font-weight: 600; letter-spacing: -0.5px; }
.badge {
  display: inline-flex;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(0, 122, 204, 0.15);
  color: #4fc3f7;
  font-size: 10px;
  font-weight: 700;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.meta-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
.meta-label { 
  color: var(--text-muted); 
  font-weight: 800; 
  font-size: 9px; 
  padding: 1px 4px; 
  border-radius: 2px; 
  background: rgba(255,255,255,0.05);
  letter-spacing: 0.5px;
}
.meta-link { 
  color: var(--accent); 
  text-decoration: none; 
  cursor: pointer; 
  opacity: 0.8; 
  word-break: break-all;
  white-space: normal;
}
.meta-link:hover { opacity: 1; text-decoration: underline; }
.btn-tiny {
  background: transparent;
  border: 1px solid var(--glass-border);
  color: var(--text-muted);
  padding: 0 6px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 600;
  cursor: pointer;
}
.btn-tiny:hover { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
  .project-info { color: var(--text-muted); font-size: 1.1em; opacity: 0.85; margin-top: 8px; padding-bottom: 4px; }
  .project-info strong { color: var(--vscode-foreground); font-weight: 600; }

  /* Area: Card */
  .card {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 8px;
    padding: var(--gap-m);
    margin-bottom: 24px;
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .card-title { font-weight: 700; font-size: 12px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px; }

  /* Component: Step */
  .steps { display: flex; flex-direction: column; gap: 12px; margin-bottom: var(--gap-l); }
  .step {
    display: flex;
    gap: var(--gap-m);
    padding: var(--gap-m);
    border-radius: 8px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
  }
  .step-num {
    width: 28px; height: 28px;
    border-radius: 6px;
    background: var(--accent);
    color: var(--accent-fg);
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 14px; flex-shrink: 0;
  }
  .step-content h3 { font-size: 14px; margin-bottom: 4px; font-weight: 600; }
  .step-content p { color: var(--text-muted); font-size: var(--font-s); line-height: 1.4; }

  /* Utility: Switch */
  .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; }
  .toggle-label { display: flex; flex-direction: column; }
  .toggle-main { font-weight: 600; font-size: 14px; }
  .toggle-desc { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
  .switch { position: relative; display: inline-block; width: 34px; height: 18px; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #333; transition: .4s; border-radius: 18px; }
  .slider:before { position: absolute; content: ""; height: 12px; width: 12px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
  input:checked + .slider { background-color: var(--accent); }
  input:checked + .slider:before { transform: translateX(16px); }

  .run-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--gap-m);
    margin: 40px 0;
    padding: var(--gap-l);
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(0, 122, 204, 0.1) 0%, transparent 100%);
    border: 1px dashed var(--accent);
  }
  .btn-primary {
    background: var(--accent);
    color: var(--accent-fg);
    border: none;
    padding: 12px 32px;
    border-radius: 6px;
    font-weight: 600;
    font-size: 15px;
    cursor: pointer;
    display: flex; align-items: center; gap: 8px;
    transition: filter 0.2s;
  }
  .btn-primary:hover { filter: brightness(1.2); }
  
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 24px; }
  .grid-card {
    padding: 12px;
    border-radius: 8px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    text-align: center;
  }
  .grid-icon { font-size: 20px; margin-bottom: 4px; }
  .grid-label { font-size: 12px; font-weight: 600; }
</style>
</head>
<body>
<div class="container">
  ${body}
</div>
</body>
</html>`;
  }



  private _uiHero(title: string, subtitle: string, stats: any) {
    const { root, matchedFile, profileId, profileSource, icon } = stats;
    const name = path.basename(root);
    const safeRoot = (root || "").replace(/\\/g, '/');
    
    // Check if current root is a sample directory
    const isSample = safeRoot.toLowerCase().includes('/test-project-samples/');
    const badgeText = isSample ? "SAMPLE PLAYGROUND" : "LOC CODE COUNTER";
    const badgeClass = isSample ? "badge sample-badge" : "badge";

    return `
      <div class="hero">
        <div class="hero-bg-icon">${icon}</div>
        <div style="display: flex; gap: 20px; align-items: center; position: relative; z-index: 1;">
          <div class="hero-icon-large">${icon}</div>
          <div>
            <div class="${badgeClass}">${badgeText}</div>
            <h1>${title}</h1>
            <div class="project-info">
              ${subtitle} &middot; <strong>${name}</strong>
            </div>
          </div>
        </div>
        
        <div style="margin-top: 20px; border-top: 1px solid var(--glass-border); padding-top: 16px; position: relative; z-index: 1;">
          <div class="meta-row" style="font-size: 14px;">
            <span class="meta-label">SOURCE</span>
            <span class="meta-link" title="${safeRoot}">${safeRoot}</span>
            <button class="btn-tiny" onclick="vscode.postMessage({command:'changePath'})">CHANGE</button>
            <button class="btn-tiny" style="color: #4fc3f7; border-color: rgba(79, 195, 247, 0.3);" onclick="vscode.postMessage({command:'backDiscovery'})">SAMPLES</button>
          </div>
          <div class="meta-row" style="margin-top: 4px; font-size: 14px;">
            <span class="meta-label">VIA</span>
            <span class="meta-link" onclick="openPath('${matchedFile.replace(/\\/g, '/')}', true, false)">${path.basename(matchedFile)}</span>
            <span class="meta-label" style="margin-left: 8px;">DEF</span>
            <span class="meta-link" onclick="openPath('${profileSource.replace(/\\/g, '/')}', true, true)">${profileId}</span>
          </div>
        </div>
      </div>
    `;
  }

  private _detectProjectProfile() {
    const root = this.provider.getCustomRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    
    // Only detect profile if we have a valid root path
    if (!root || root === "") {
      return {
        matchedProfile: { id: 'none', icon: '🔍', name: 'No Project' },
        matchedFile: "",
        matchedDetail: "no-project",
        root: ""
      };
    }
    
    const result = this.provider.detectProjectProfile(root);
    const matchedProfile = result.matchedProfile || profiles.find(p => p.id === 'generic') || profiles[0];
    
    return {
      matchedProfile,
      matchedFile: result.matchedFile || root,
      matchedDetail: result.matchedDetail || "standard",
      root: root
    };
  }

  private _getSamples(): { name: string; path: string; description: string }[] {
    const DESCRIPTIONS: Record<string, string> = {
      'test-standard': 'Standard TS/Node setup.',
      'test-deep-tree': 'Deeply nested tree test.',
      'test-edge-filenames': 'Emojis, Spaces, Japanese names.',
      'test-react-jsx': 'React JSX structure.',
      'test-python-flask': 'Python project layout.',
      'test-rust-cargo': 'Rust/Cargo integration.',
      'test-exclusions': 'Exclusion rules (Git/Profile).',
      'test-json-output': 'Pre-computed JSON data.'
    };

    try {
      const samplesPath = path.join(this._context.extensionPath, 'test-project-samples');
      if (fs.existsSync(samplesPath)) {
        return fs.readdirSync(samplesPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => ({
            name: dirent.name,
            path: path.join(samplesPath, dirent.name).replace(/\\/g, '/'),
            description: DESCRIPTIONS[dirent.name] || 'Sample project.'
          }));
      }
    } catch (e) {
      console.error("Failed to read samples directory:", e);
    }
    return [];
  }

  private _getSetupDiscoveryHtml(): string {
    const { matchedProfile, matchedFile, root } = this._detectProjectProfile();
    const isMonitorEnabled = vscode.workspace.getConfiguration("codeCount").get<boolean>("enabled") ?? true;
    const icon = matchedProfile.icon || "🔍";
    const hero = this._uiHero("STEP A: DISCOVERY 🔎", "A Detecting Project Profile", {
      root,
      matchedFile,
      profileId: matchedProfile.id,
      profileSource: (matchedProfile as any).sourceFile || "profiles.ts",
      icon
    });

    const samples = this._getSamples();
    
    // Featured samples (top 3)
    const featuredSamples = [
      samples.find(s => s.name === 'test-exclusions'),
      samples.find(s => s.name === 'test-deep-tree'),
      samples.find(s => s.name === 'test-standard')
    ].filter(Boolean);
    
    // Remaining samples
    const remainingSamples = samples.filter(s => 
      !['test-exclusions', 'test-deep-tree', 'test-standard'].includes(s.name)
    );
    
    const samplesHtml = samples.length > 0 ? `
        <div class="card" style="margin-top: 16px; padding: 12px; background: rgba(0, 122, 204, 0.05); border: 1px dashed rgba(0, 122, 204, 0.3);">
            <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #4fc3f7; display: flex; align-items: center; gap: 8px;">
                <span class="material-symbols-outlined" style="font-size: 18px;">lab_profile</span>
                Try a Sample Project (Quick Test)
            </h3>
            <p style="font-size: 12px; color: rgba(255,255,255,0.7); margin-bottom: 15px;">
                You can load the sample project to test its functionality.
            </p>
            
            <!-- Featured Samples -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: ${remainingSamples.length > 0 ? '12px' : '0'};">
                ${featuredSamples.map(s => s ? `
                    <button class="btn-tiny" style="height: auto; min-height: 48px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; padding: 8px 12px; font-size: 11px; text-align: left;" onclick="selectSample('${s.path}')">
                        <div style="font-weight: 800; color: #fff; margin-bottom: 2px;">${s.description}</div>
                        <div style="font-size: 9px; opacity: 0.6; text-transform: none; white-space: normal; line-height: 1.2;">📁 ${s.name}</div>
                    </button>
                ` : '').join('')}
            </div>
            
            <!-- More Samples Toggle -->
            ${remainingSamples.length > 0 ? `
                <div style="margin-top: 8px;">
                    <button class="btn-tiny" style="width: 100%; height: 32px; justify-content: center; background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1);" onclick="toggleMoreSamples(this)">
                        <span id="more-samples-text">Show More (${remainingSamples.length} more)</span>
                        <span class="material-symbols-outlined" style="font-size: 16px;">expand_more</span>
                    </button>
                    <div id="more-samples" style="display: none; margin-top: 8px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px;">
                        ${remainingSamples.map(s => `
                            <button class="btn-tiny" style="height: auto; min-height: 48px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; padding: 8px 12px; font-size: 11px; text-align: left;" onclick="selectSample('${s.path}')">
                                <div style="font-weight: 800; color: #fff; margin-bottom: 2px;">${s.description}</div>
                                <div style="font-size: 9px; opacity: 0.6; text-transform: none; white-space: normal; line-height: 1.2;">📁 ${s.name}</div>
                            </button>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    ` : "";

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    const isAtWorkspaceRoot = root === workspaceRoot;

    // Open Folder Area (above samples)
    const openFolderHtml = workspaceRoot ? `
        <div class="card" style="margin-top: 16px; padding: 12px; background: rgba(76, 175, 80, 0.05); border: 1px dashed rgba(76, 175, 80, 0.3);">
            <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #4caf50; display: flex; align-items: center; gap: 8px;">
                <span class="material-symbols-outlined" style="font-size: 18px;">folder_open</span>
                📁 Open Folder
            </h3>
            <button class="btn-tiny" style="width: 100%; height: 32px; color: #4caf50; border-color: rgba(76, 175, 80, 0.3);" onclick="selectSample('${workspaceRoot.replace(/\\/g, '/')}')">
                🚀 Analyze Current Workspace: ${path.basename(workspaceRoot)}
            </button>
        </div>
    ` : "";

    const resetToWorkspaceHtml = !isAtWorkspaceRoot ? `
        <div class="card" style="margin-top: 16px; padding: 12px; background: rgba(35, 209, 139, 0.05); border: 1px dashed rgba(35, 209, 139, 0.3);">
            <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #23d18b; display: flex; align-items: center; gap: 8px;">
                <span class="material-symbols-outlined" style="font-size: 18px;">home</span>
                Go back to My Project
            </h3>
            <button class="btn-tiny" style="width: 100%; height: 32px; color: #23d18b; border-color: rgba(35, 209, 139, 0.3);" onclick="selectSample('${workspaceRoot.replace(/\\/g, '/')}')">
                🚀 Analyze Current Workspace Root
            </button>
        </div>
    ` : "";

    const body = `
      ${hero}
      ${openFolderHtml}
      ${samplesHtml}
      ${resetToWorkspaceHtml}
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');
        .hero { margin-bottom: 24px; }
        .hero-icon-large { font-size: 48px; display: flex; align-items: center; justify-content: center; width: 72px; height: 72px; background: rgba(255,255,255,0.03); border-radius: 16px; border: 1px solid var(--glass-border); box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
        .hero-bg-icon { position: absolute; top: -20px; right: 0; font-size: 150px; opacity: 0.05; pointer-events: none; filter: blur(2px); }
        .badge { display: inline-flex; padding: 3px 8px; border-radius: 4px; background: rgba(0, 122, 204, 0.15); color: #4fc3f7; font-size: 10px; font-weight: 700; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        .badge.sample-badge { background: rgba(79, 195, 247, 0.2); color: #81d4fa; border: 1px solid rgba(79, 195, 247, 0.3); }
        .material-symbols-outlined {
            font-family: 'Material Symbols Outlined';
            font-weight: normal;
            font-style: normal;
            font-size: 24px;
            line-height: 1;
            letter-spacing: normal;
            text-transform: none;
            display: inline-block;
            white-space: nowrap;
            word-wrap: normal;
            direction: ltr;
        }
        .progress-bar.indeterminate {
            width: 100% !important;
            background: linear-gradient(90deg, var(--bg-secondary) 25%, var(--accent) 50%, var(--bg-secondary) 75%);
            background-size: 200% 100%;
            animation: loading 1.5s infinite linear;
        }
        @keyframes loading {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }
        .monitor-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            display: inline-block;
            margin-right: 6px;
        }
        .monitor-dot.active { background-color: #23d18b; box-shadow: 0 0 8px #23d18b; }
        .monitor-dot.inactive { background-color: #666; }
      </style>
      <div class="header-ui">
        <span style="font-size: 12px; opacity: 0.5; font-family: monospace; letter-spacing: 1px;">DAEMON_SCAN_IN_PROGRESS</span>
        <span class="percent-text" id="percent">SCANNING...</span>
      </div>
      <div class="progress-container">
        <div class="progress-bar indeterminate" id="bar"></div>
      </div>

      <div class="terminal" id="terminal">
        <div id="lines"></div>
        <div class="terminal-line"><span class="prefix">&gt;</span> <span class="status">System ready. Confirm the target project and click START DISCOVERY.</span><span class="cursor"></span></div>
      </div>

      <div class="card" style="margin-top: 24px; padding: 16px;">
        <div class="toggle-row" style="flex-direction: column; align-items: stretch; gap: 16px;">
            <div class="toggle-label" style="flex-direction: row; align-items: center; justify-content: center; opacity: 0.8;">
                <div class="toggle-main" style="font-size: 11px; letter-spacing: 0.5px;">
                    <span id="monitor-dot" class="monitor-dot ${isMonitorEnabled ? 'active' : 'inactive'}" style="width:6px; height:6px;"></span>
                    DAEMON STATUS: <span id="monitor-status" style="color: ${isMonitorEnabled ? '#23d18b' : '#888'}">${isMonitorEnabled ? 'RUNNING' : 'PAUSED'}</span>
                </div>
            </div>
            <button id="monitor-btn" class="btn-primary" style="width: 100%; justify-content: center; background: #23d18b; color: #0a0a0a; font-weight: 800; height: 44px; box-shadow: 0 4px 12px rgba(35, 209, 139, 0.2); display: flex; align-items: center; gap: 8px;" onclick="proceedToStrategist()">
                <span class="material-symbols-outlined" style="font-size: 20px;">rocket_launch</span>
                <div style="display: flex; flex-direction: column; align-items: center;">
                    <div>START DISCOVERY SCAN</div>
                    <div style="font-size: 10px; opacity: 0.8; font-weight: 400;">📁 ${path.basename(root)}</div>
                </div>
                <span class="material-symbols-outlined" style="font-size: 20px;">arrow_right</span>
            </button>
            <p style="font-size: 12px; color: rgba(255,255,255,0.7); margin-top: 15px; text-align: center;">
                Next, proceed to "STEP B". In STEP B, specify the files and directories you want to exclude.
            </p>
        </div>
      </div>
      <script>
        const vscode = acquireVsCodeApi();
        const linesContainer = document.getElementById('lines');
        const bar = document.getElementById('bar');
        const percentText = document.getElementById('percent');
        
        let fileCount = 0;
        let isScanFinished = false;

        function selectSample(path) {
          vscode.postMessage({ command: 'selectSample', path: path });
        }

        function proceedToStrategist() {
            vscode.postMessage({ command: 'startSetup' });
        }

        // Keep for status updates
        function updateMonitoringUI(isRunning) {
          const dot = document.getElementById('monitor-dot');
          const statusText = document.getElementById('monitor-status');
          
          if (isRunning) {
            dot.className = 'monitor-dot active';
            statusText.innerText = 'RUNNING';
            statusText.style.color = '#23d18b';
          } else {
            dot.className = 'monitor-dot inactive';
            statusText.innerText = 'PAUSED';
            statusText.style.color = '#888';
          }
        }

        function toggleMoreSamples(button) {
          const moreSamples = document.getElementById('more-samples');
          const moreText = document.getElementById('more-samples-text');
          const icon = button.querySelector('.material-symbols-outlined');
          
          if (moreSamples.style.display === 'none') {
            moreSamples.style.display = 'grid';
            moreText.textContent = 'Show Less';
            icon.textContent = 'expand_less';
          } else {
            moreSamples.style.display = 'none';
            moreText.textContent = 'Show More (' + remainingSamples.length + ' more)';
            icon.textContent = 'expand_more';
          }
        }

        function addLine(path, status = "OK") {
          const line = document.createElement('div');
          line.className = 'terminal-line';
          const prefix = status === "SKIPPED" ? "SKIP" : "INDEX";
          const pathClass = status === "SKIPPED" ? "prefix" : "path";
          
          line.innerHTML = '<span class="prefix">' + prefix + '</span> <span class="' + pathClass + '">' + path + '</span> <span class="status">[' + status + ']</span>';
          linesContainer.appendChild(line);
          
          const term = document.getElementById('terminal');
          term.scrollTop = term.scrollHeight;
          
          if (linesContainer.children.length > 12) {
            linesContainer.removeChild(linesContainer.firstChild);
          }
        }

        window.addEventListener('message', event => {
          const message = event.data;
          if (message.command === 'discoveryUpdate') {
            if (message.status === "FINISHED" || message.status === "DISCOVER_DONE") {
              isScanFinished = true;
              bar.classList.remove('indeterminate');
              bar.style.width = '100%';
              percentText.innerText = '100%';
              
              if (message.status === "FINISHED") {
                addLine('--- PROJECT ANALYSIS COMPLETE ---', 'DONE');
              } else {
                addLine('--- PROJECT DISCOVERY COMPLETE ---', 'DONE');
              }

              setTimeout(() => {
                vscode.postMessage({ command: 'completeDiscovery' });
              }, 1500);
              return;
            }

            addLine(message.path, message.status);
            
            if (message.status === "INDEXED") {
              fileCount++;
              percentText.innerText = fileCount + ' files scanned...';
            } else if (message.status === "ANALYZING") {
              bar.classList.remove('indeterminate');
              bar.style.width = message.percent + '%';
              percentText.innerText = message.percent + '% (' + message.current + '/' + message.total + ' files)';
            }
          }
        });

      </script>`;

    return this._getCommonHtml(body, "Discovery");
  }

  private _getSetupPreviewHtml(): string {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    let fileCount = 0;
    const discover = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (this.provider.shouldIgnore(e.name)) continue;
          if (e.isDirectory()) {
            discover(path.join(dir, e.name));
          } else {
            fileCount++;
          }
        }
      } catch { }
    };
    discover(root);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: sans-serif; padding: 10px 14px; background: var(--vscode-editor-background); color: var(--vscode-foreground); line-height: 1.6; font-size: 16px; }
  .container { max-width: 100%; margin: 0; }
  .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 18px; }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn-secondary { background: var(--vscode-button-secondaryBackground, #444); color: var(--vscode-button-secondaryForeground, #fff); border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 16px; }
  .summary-box { background: var(--vscode-sideBar-background); padding: 20px; border-radius: 10px; border: 1px solid var(--vscode-panel-border); margin-bottom: 30px; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
</style>
</head>
<body>
  <div class="container">
    <h2 style="font-size: 14px; color: var(--vscode-descriptionForeground); margin-bottom: 4px; font-weight: 600; opacity: 0.8;">Almost there!</h2>
    <h1 style="font-size: 22px; font-weight: 600; margin-bottom: 8px;">📊 Ready for Step C: Audit Report</h1>
    <p style="margin-bottom: 24px; color: var(--vscode-descriptionForeground);">Final check before performing the full line count analysis.</p>
    
    <div class="summary-box">
      <div class="header">
        <h3 style="margin:0;">🏗️ Architecture Summary</h3>
        <span style="font-size: 16px; opacity: 0.7;">(Filtered Setup)</span>
      </div>
      <div style="margin-top:10px; font-size: 18px;">
        <strong>Approx. ${fileCount} files discovered</strong><br>
        <span style="color: var(--vscode-descriptionForeground); font-size: 16px;">System folders (.git, node_modules) safely excluded.</span>
      </div>
    </div>

    <div style="display: flex; gap: 12px; align-items: center;">
      <button class="btn-primary" onclick="vscode.postMessage({ command: 'runFinalScan' })">📊 RUN FULL AUDIT</button>
      <button class="btn-secondary" onclick="vscode.postMessage({ command: 'backToFilter' })">◀ Back to Filters</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
  </script>
</body>
</html>`;
  }

}

/**
 * Simple provider for virtual markdown documents.
 */
class MarkdownReportProvider implements vscode.TextDocumentContentProvider {
  constructor(private provider: CodeCountProvider) { }
  provideTextDocumentContent(uri: vscode.Uri): string {
    const mode = uri.path === "/welcome" ? "essential" : "full";
    return this.provider.generateMarkdownReport(mode);
  }
}

export function activate(context: vscode.ExtensionContext) {


  try {
    const provider = new CodeCountProvider(context);
    provider.log("Extension Activation Started");

    vscode.window.showInformationMessage("Code Count: Activating...");

    vscode.window.registerTreeDataProvider("codeCountView", provider);
    vscode.window.registerFileDecorationProvider(provider);

    const reportProvider = new MarkdownReportProvider(provider);
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(
        "codecount-report",
        reportProvider,
      ),
    );

    // Auto-show STEP A view on startup
    setTimeout(() => {
      WebviewReportProvider.createOrShow(provider, context, "setup-discovery");
    }, 1000);

    context.subscriptions.push(
      vscode.commands.registerCommand("codeCount.refresh", async () => {
        provider.refresh(true);
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (root) {
          await provider.runBackgroundScan(root);
        }
      }),
      vscode.commands.registerCommand("codeCount.exportReport", async () => {
        const root = provider.getCustomRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return;

        const config = vscode.workspace.getConfiguration("codeCount");
        const rawThreshold = config.get<number | undefined>("codeCount.threshold"); // Debug
        const threshold = rawThreshold ?? 200; // default

        provider.log(`[DEBUG] Raw threshold from config (exportReport): ${rawThreshold}, Processed threshold: ${threshold}`);

        const { trackedFiles, excludedFiles } = provider.getAnalysisReportData();
        const detectedProfile = provider.getDetectedProfile();

        const reportContent = generateReportMarkdown(
          path.basename(root),
          trackedFiles,
          {
            threshold: threshold,
            profile: detectedProfile,
            rules: {
              git: provider._isGitignoreEnabled,
              stack: provider._isProfileExcludeEnabled || provider._isDependencyExcludeEnabled,
              dot: provider._dotExclusions,
            },
            excludedFiles: excludedFiles
          }
        );

        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(path.join(root, "CODE_COUNT_AUDIT.md")),
          filters: { Markdown: ["md"] },
        });

        if (uri) {
          try {
            fs.writeFileSync(uri.fsPath, reportContent, "utf8");
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.commands.executeCommand('markdown.showPreview', doc.uri);
            await WebviewReportProvider.applyExplorerLayout();
            vscode.window.showInformationMessage(
              `Report exported to ${path.basename(uri.fsPath)}`,
            );
          } catch (e: any) {
            vscode.window.showErrorMessage(`Export failed: ${e.message}`);
          }
        }
      }),

      vscode.commands.registerCommand("codeCount.generateAudit", async () => {
        const root = provider.getCustomRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) {
          vscode.window.showErrorMessage(
            "Open a folder to generate an audit report.",
          );
          return;
        }

        // 1. Interactive Experience (Primary)
        WebviewReportProvider.createOrShow(provider, context);

        // 2. Background Persistence (Secondary)
        await provider.saveSnapshotToState();
        const reportContent = provider.generateMarkdownReport();
        const reportPath = path.join(
          root,
          ".code-count",
          "CODE_COUNT_MONITOR.md",
        );
        const folderPath = path.dirname(reportPath);

        try {
          if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
          }
          fs.writeFileSync(reportPath, reportContent, "utf8");
          // No intrusive notification for background save, maybe just a status bar message?
          // vscode.window.setStatusBarMessage(`Report updated: .code-count/${path.basename(reportPath)}`, 3000);
        } catch (err: any) {
          vscode.window.showErrorMessage(
            `Failed to export background report: ${err.message}`,
          );
        }
      }),
      vscode.commands.registerCommand("codeCount.showReport", () => {
        WebviewReportProvider.createOrShow(provider, context);
      }),
      vscode.commands.registerCommand("codeCount.toggle", async () => {
        const config = vscode.workspace.getConfiguration("codeCount");
        const current = config.get<boolean>("enabled") ?? true;
        const newState = !current;
        await config.update(
          "enabled",
          newState,
          vscode.ConfigurationTarget.Global,
        );
        provider.refresh();

        if (newState) {
          const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (root) {
            await provider.runBackgroundScan(root, true); // RUN = Reset baseline
          }
        }
        vscode.window.showInformationMessage(
          `Code Count Monitoring is now ${newState ? "RUNNING" : "PAUSED"}.`,
        );
      }),
      vscode.commands.registerCommand(
        "codeCount.ignoreItem",
        async (item: vscode.TreeItem) => {
          // Hide specific file or folder
          if (!item || !item.resourceUri) return;

          const config = vscode.workspace.getConfiguration("codeCount");
          const ignoreFiles = config.get<string[]>("ignoreFiles") || [];
          const filename = path.basename(item.resourceUri.fsPath);

          if (!ignoreFiles.includes(filename)) {
            ignoreFiles.push(filename);
            await config.update(
              "ignoreFiles",
              ignoreFiles,
              vscode.ConfigurationTarget.Global,
            );
            provider.refresh();
            vscode.window.showInformationMessage(
              `Added '${filename}' to Code Count ignore list.`,
            );
          }
        },
      ),
      vscode.commands.registerCommand(
        "codeCount.manageExtensions",
        async () => {
          const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
          if (!root) return;

          const CATEGORIES: Record<string, { label: string; exts: string[] }> =
          {
            logic: {
              label: "Logic & Programming",
              exts: [
                ".ts",
                ".js",
                ".py",
                ".java",
                ".go",
                ".rs",
                ".php",
                ".rb",
                ".cs",
                ".kt",
                ".swift",
                ".lua",
                ".c",
                ".cpp",
                ".h",
                ".hpp",
              ],
            },
            ui: {
              label: "UI & Styling",
              exts: [
                ".html",
                ".css",
                ".scss",
                ".sass",
                ".less",
                ".vue",
                ".svelte",
                ".astro",
                ".tsx",
                ".jsx",
              ],
            },
            data: {
              label: "Data & Config",
              exts: [
                ".json",
                ".yaml",
                ".yml",
                ".toml",
                ".xml",
                ".sql",
                ".env",
                ".csv",
                ".tsv",
                ".ini",
                ".cfg",
              ],
            },
            docs: {
              label: "Documentation",
              exts: [".md", ".mdx", ".txt", ".rst", ".pdf", ".docx"],
            },
            tools: {
              label: "Tooling & Meta",
              exts: [
                ".map",
                ".lock",
                ".log",
                ".tmp",
                ".gitignore",
                ".dockerignore",
                ".pem",
                ".crt",
              ],
            },
            media: {
              label: "Media & Binary",
              exts: [
                ".png",
                ".jpg",
                ".jpeg",
                ".gif",
                ".svg",
                ".webp",
                ".ico",
                ".mp4",
                ".mp3",
                ".wav",
                ".zip",
                ".tar",
                ".gz",
              ],
            },
          };

          const getCategory = (ext: string) => {
            for (const [key, cat] of Object.entries(CATEGORIES)) {
              if (cat.exts.includes(ext)) return key;
            }
            return "other";
          };

          const foundExtensions = new Map<string, number>();
          const discover = (dir: string) => {
            try {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const e of entries) {
                if (provider.shouldIgnore(e.name)) {
                  if (["node_modules", ".git"].includes(e.name)) continue;
                }
                const fullPath = path.join(dir, e.name);
                if (e.isDirectory()) discover(fullPath);
                else {
                  const ext = path.extname(e.name).toLowerCase();
                  if (ext)
                    foundExtensions.set(
                      ext,
                      (foundExtensions.get(ext) || 0) + 1,
                    );
                }
              }
            } catch { }
          };

          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Scanning workspace extensions...",
              cancellable: false,
            },
            async () => {
              discover(root);

              const config = vscode.workspace.getConfiguration("codeCount");
              const ignoreList = config.get<string[]>("ignoreFiles") || [];

              const quickPick = vscode.window.createQuickPick();
              quickPick.canSelectMany = true;
              quickPick.title = "Manage Extension Filters (Checked = ON)";
              quickPick.placeholder =
                "Select extensions to include in analysis";

              const groupedItems: Record<string, vscode.QuickPickItem[]> = {
                logic: [],
                ui: [],
                data: [],
                docs: [],
                tools: [],
                media: [],
                other: [],
              };

              const sortedExts = Array.from(foundExtensions.entries()).sort(
                (a, b) => b[1] - a[1],
              );
              for (const [ext, count] of sortedExts) {
                const catKey = getCategory(ext);
                groupedItems[catKey].push({
                  label: ext,
                  description: `${count.toLocaleString()} file${count > 1 ? "s" : ""}`,
                  alwaysShow: true,
                });
              }

              const items: vscode.QuickPickItem[] = [];
              const initialSelected: vscode.QuickPickItem[] = [];
              const order = [
                "logic",
                "ui",
                "data",
                "docs",
                "tools",
                "media",
                "other",
              ];

              for (const key of order) {
                if (groupedItems[key].length > 0) {
                  const catName = CATEGORIES[key]?.label || "Other / Unknown";
                  items.push({
                    label: catName,
                    kind: vscode.QuickPickItemKind.Separator,
                  });

                  const toggleItem = {
                    label: `$(checklist) Toggle All ${catName}`,
                    detail: `Batch Select/Deselect all files in ${catName}`,
                    alwaysShow: true,
                  };
                  items.push(toggleItem);

                  const catExts: vscode.QuickPickItem[] = [];
                  for (const item of groupedItems[key]) {
                    items.push(item);
                    catExts.push(item);
                    if (!ignoreList.includes(`*${item.label}`)) {
                      initialSelected.push(item);
                    }
                  }

                  // Initially select "Toggle All" if all items in this category are active
                  const allActive = catExts.every((e) =>
                    initialSelected.includes(e),
                  );
                  if (allActive) {
                    initialSelected.push(toggleItem);
                  }
                }
              }

              quickPick.items = items;
              quickPick.selectedItems = initialSelected;

              let currentSelection = [...initialSelected];
              let isUpdating = false;

              quickPick.onDidChangeSelection((selection) => {
                if (isUpdating) return;

                const added = selection.filter(
                  (s) => !currentSelection.includes(s),
                );
                const removed = currentSelection.filter(
                  (s) => !selection.includes(s),
                );

                const toggledCategoryItem =
                  added.find((s) => s.label.startsWith("$(checklist)")) ||
                  removed.find((s) => s.label.startsWith("$(checklist)"));

                if (toggledCategoryItem) {
                  const targetCat = toggledCategoryItem.label.replace(
                    "$(checklist) Toggle All ",
                    "",
                  );
                  const isAdding = added.includes(toggledCategoryItem);

                  let inCat = false;
                  const catExts: vscode.QuickPickItem[] = [];
                  for (const item of items) {
                    if (item.kind === vscode.QuickPickItemKind.Separator) {
                      inCat = item.label === targetCat;
                      continue;
                    }
                    if (inCat && item.label.startsWith("$(checklist)"))
                      continue; // Skip the toggle item itself
                    if (inCat && item.label.startsWith(".")) {
                      catExts.push(item);
                    }
                  }

                  let newSelection = [...selection];
                  if (isAdding) {
                    catExts.forEach((e) => {
                      if (!newSelection.includes(e)) newSelection.push(e);
                    });
                    if (!newSelection.includes(toggledCategoryItem))
                      newSelection.push(toggledCategoryItem);
                  } else {
                    newSelection = newSelection.filter(
                      (s) => !catExts.includes(s) && s !== toggledCategoryItem,
                    );
                  }

                  isUpdating = true;
                  quickPick.selectedItems = newSelection;
                  currentSelection = newSelection;
                  isUpdating = false;
                } else {
                  // Sync "Toggle All" items based on manual individual toggles
                  let newSelection = [...selection];
                  for (const key of order) {
                    if (groupedItems[key].length > 0) {
                      const catName =
                        CATEGORIES[key]?.label || "Other / Unknown";
                      const toggleLabel = `$(checklist) Toggle All ${catName}`;
                      const toggleItem = items.find(
                        (i) => i.label === toggleLabel,
                      );
                      if (!toggleItem) continue;

                      const catExts = items.filter(
                        (i) =>
                          !i.kind &&
                          i.label.startsWith(".") &&
                          getCategory(i.label) === key,
                      );
                      const allSelected = catExts.every((e) =>
                        selection.includes(e),
                      );

                      if (allSelected && !newSelection.includes(toggleItem)) {
                        newSelection.push(toggleItem);
                      } else if (
                        !allSelected &&
                        newSelection.includes(toggleItem)
                      ) {
                        newSelection = newSelection.filter(
                          (s) => s !== toggleItem,
                        );
                      }
                    }
                  }

                  isUpdating = true;
                  quickPick.selectedItems = newSelection;
                  currentSelection = newSelection;
                  isUpdating = false;
                }
              });

              quickPick.onDidAccept(async () => {
                const selectedLabels = quickPick.selectedItems
                  .map((s) => s.label)
                  .filter((l) => l.startsWith("."));
                let newIgnoreList = [...ignoreList].filter(
                  (p) => !p.startsWith("*."),
                );

                for (const [ext] of foundExtensions) {
                  if (!selectedLabels.includes(ext)) {
                    newIgnoreList.push(`*${ext}`);
                  }
                }

                await config.update(
                  "ignoreFiles",
                  newIgnoreList,
                  vscode.ConfigurationTarget.Global,
                );
                provider.refresh();
                const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (root) provider.runBackgroundScan(root);
                quickPick.hide();
                vscode.window.showInformationMessage(
                  "Extension filters updated.",
                );
              });

              quickPick.onDidHide(() => quickPick.dispose());
              quickPick.show();
            },
          );
        },
      ),
      vscode.commands.registerCommand("code-count.openSample", () => {
        try {
          const samplePath = path.join(context.extensionPath, 'test-project-samples', 'test-standard');
          const sampleUri = vscode.Uri.file(samplePath);
          vscode.commands.executeCommand('vscode.openFolder', sampleUri, { forceNewWindow: true });
        } catch (e) {
          vscode.window.showErrorMessage(`Failed to open sample project: ${e}`);
        }
      }),
      vscode.commands.registerCommand("code-count.reload", () => {
        vscode.commands.executeCommand("workbench.action.reloadWindow");
      })
    );

    // Show Welcome/Setup view on startup if not completed
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (root) {
      const hasCompletedSetup = context.workspaceState.get<boolean>("hasCompletedSetup", false);
      if (!hasCompletedSetup) {
        WebviewReportProvider.createOrShow(provider, context, "setup-discovery");
      }
    }

  } catch (e: any) {
    console.error("Code Count Activation Failed:", e);
    vscode.window.showErrorMessage(`Code Count failed to start: ${e.message}`);
  }
}

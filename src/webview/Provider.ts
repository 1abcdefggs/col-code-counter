import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { WelcomeState } from "../types";
import { profiles } from "../profiles";
import { getAnalysisReportHtml } from "../variants/analysis-report-view";
import { getStrategistViewHtml } from "../variants/strategist-view";
import { GitignoreManager } from "../gitignore/manager";
import {
    getCommonHtml,
    uiHero,
    getSetupDiscoveryHtml,
    getSetupPreviewHtml
} from "./HtmlHelpers";

/**
 * Manages the Webview Lifecycle and UI Orchestration.
 */
export class WebviewReportProvider {
    public static currentPanel: WebviewReportProvider | undefined;
    public static analysisPanel: WebviewReportProvider | undefined;

    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    constructor(
        panel: vscode.WebviewPanel,
        private readonly provider: any, // CodeCountProvider (circular dep handled by any or interface)
        private readonly _context: vscode.ExtensionContext,
    ) {
        this._panel = panel;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                console.log('[WEBVIEW][webview/Provider.ts] onDidReceiveMessage:', message && message.command ? message.command : message);
                switch (message.command) {
                    case "startSetup":
                        await this.provider.runBackgroundScan();
                        break;
                    case "completeDiscovery":
                        this.update("setup-filter");
                        break;
                    case "openStrategist":
                        this.update("setup-filter");
                        break;
                    case "backDiscovery":
                        this.update("setup-discovery");
                        break;
                    case "runFinalScan":
                        this.provider.refresh(true);
                        this.update("report");
                        break;
                    case "startAnalysis":
                        {
                            const rootForAnalysis = this.provider.getCustomRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                            if (rootForAnalysis) {
                                try {
                                    await this.provider.runBackgroundScan(rootForAnalysis, true, false);
                                    await WebviewReportProvider.createOrShowReport(this.provider, this._context);
                                } catch (err: any) {
                                    vscode.window.showErrorMessage(`Analysis failed: ${err}`);
                                }
                            } else {
                                vscode.window.showErrorMessage("No workspace folder found for analysis");
                            }
                        }
                        break;
                    case "exportMarkdown":
                        vscode.commands.executeCommand("codeCount.exportReport");
                        break;
                    case "showReport":
                        await WebviewReportProvider.createOrShowReport(this.provider, this._context);
                        break;
                    case "backToStrategist":
                        WebviewReportProvider.createOrShow(this.provider, this._context);
                        break;
                    case "backToFilter":
                        this.update("setup-filter");
                        break;
                    case "openPath":
                        if (message.isExtensionPath) {
                            const extPath = this._context.extensionUri.fsPath;
                            const fullPath = path.join(extPath, message.path);
                            const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
                            await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
                        } else {
                            const uri = vscode.Uri.file(message.path);
                            const doc = await vscode.workspace.openTextDocument(uri);
                            let options: vscode.TextDocumentShowOptions = { viewColumn: vscode.ViewColumn.Beside };
                            if (message.query) {
                                // Simple search in doc if query provided
                                // This is basic, but works for highlight
                            }
                            await vscode.window.showTextDocument(doc, options);
                        }
                        break;
                    case "toggleGitignoreSource":
                        if (this.provider._disabledGitignoreSources.has(message.relPath)) {
                            this.provider._disabledGitignoreSources.delete(message.relPath);
                        } else {
                            this.provider._disabledGitignoreSources.add(message.relPath);
                        }
                        this.provider.refresh();
                        this.update("setup-filter");
                        break;
                    case "toggleProfileExclude":
                        this.provider._isProfileExcludeEnabled = !this.provider._isProfileExcludeEnabled;
                        this.provider.refresh();
                        this.update("setup-filter");
                        break;
                    case "toggleDependencyExclude":
                        this.provider._isDependencyExcludeEnabled = !this.provider._isDependencyExcludeEnabled;
                        this.provider.refresh();
                        this.update("setup-filter");
                        break;
                    case "toggleGitignore":
                        this.provider._isGitignoreEnabled = !this.provider._isGitignoreEnabled;
                        this.provider.refresh();
                        this.update("setup-filter");
                        break;
                    case "toggleManualLogic":
                        this.provider._isManualLogicEnabled = !this.provider._isManualLogicEnabled;
                        this.provider.refresh();
                        this.update("setup-filter");
                        break;
                    case "toggleBulkExclusion":
                        this.provider._isBulkExclusionEnabled = !this.provider._isBulkExclusionEnabled;
                        this.provider.refresh();
                        this.update("setup-filter");
                        break;
                    case "excludePath":
                        await this._applyManualOverrideRecursively(message.path, true, false);
                        this.provider.refresh();
                        this.update("setup-filter");
                        break;
                    case "includePath":
                        await this._applyManualOverrideRecursively(message.path, false, true);
                        this.provider.refresh();
                        this.update("setup-filter");
                        break;
                    case "resetPath":
                        await this._applyManualOverrideRecursively(message.path, false, false);
                        this.provider.refresh();
                        this.update("setup-filter");
                        break;
                    case "toggleFolder":
                        if (this.provider._expandedPaths.has(message.path)) {
                            this.provider._expandedPaths.delete(message.path);
                        } else {
                            this.provider._expandedPaths.add(message.path);
                        }
                        this.update("setup-filter");
                        break;
                    case "changePath":
                        const folders = await vscode.window.showOpenDialog({
                            canSelectFiles: false,
                            canSelectFolders: true,
                            canSelectMany: false,
                            openLabel: "Select Project Root"
                        });
                        if (folders && folders[0]) {
                            this.provider.setCustomRoot(folders[0].fsPath);
                            this.provider.refresh(true);
                            this.update("setup-discovery");
                        }
                        break;
                    case "toggleAutoAnalyzer":
                        this.provider._autoAnalyzerEnabled = !this.provider._autoAnalyzerEnabled;
                        this.provider.refresh();
                        this.update("setup-filter");
                        break;
                    case "updateThreshold":
                        try {
                            const config = vscode.workspace.getConfiguration("codeCount");
                            await config.update("threshold", message.value, vscode.ConfigurationTarget.Workspace);
                            if (this === WebviewReportProvider.analysisPanel) {
                                this.updateAnalysisReport();
                            } else {
                                this.update();
                            }
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`Failed to update threshold: ${err}`);
                        }
                        break;
                    case "selectSample":
                        {
                            const samplePath = message.path;
                            if (samplePath && fs.existsSync(samplePath)) {
                                await this.provider.setCustomRoot(samplePath);
                                // The setCustomRoot will refresh(true).
                                // Now trigger discovery scan on the new root.
                                this.update("setup-discovery");
                                await new Promise(resolve => setTimeout(resolve, 100)); // Brief delay for UI to settle
                                try {
                                    await this.provider.runBackgroundScan(samplePath, true, true); // Discovery Only
                                } catch (err: any) {
                                    vscode.window.showErrorMessage(`Sample discovery failed: ${err}`);
                                }
                            }
                        }
                        break;
                }
            },
            null,
            this._disposables,
        );
    }

    public static createOrShow(provider: any, context: vscode.ExtensionContext) {
        if (WebviewReportProvider.currentPanel) {
            WebviewReportProvider.currentPanel._panel.reveal(vscode.ViewColumn.One);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            "codeCountSetup",
            "🚀 LOC: Setup Specialist",
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

        // Initial view
        WebviewReportProvider.currentPanel.update("setup-discovery");
    }

    public static createOrShowReport(provider: any, context: vscode.ExtensionContext) {
        (async () => {
            // If no cached analysis results, run a background scan first
            try {
                const files = provider.getAllTrackedFilesWithStats();
                if (!files || files.length === 0) {
                    const root = provider.getCustomRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    if (root) {
                        await provider.runBackgroundScan(root, true, false);
                    }
                }
            } catch (e) {
                console.warn('Pre-scan for report failed', e);
            }

            if (WebviewReportProvider.analysisPanel) {
                WebviewReportProvider.analysisPanel._panel.reveal(vscode.ViewColumn.Beside);
                WebviewReportProvider.analysisPanel.updateAnalysisReport();
                return;
            }

            const panel = vscode.window.createWebviewPanel(
                "codeCountFullReport",
                "📊 LOC CODE COUNTER: Analysis Report",
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
        })();
    }

    private updateAnalysisReport() {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
        const projectName = path.basename(root);
        const files = this.provider.getAllTrackedFilesWithStats();
        const config = vscode.workspace.getConfiguration("codeCount");
        const threshold = config.get<number>("threshold") || 200;
        this._panel.webview.html = getAnalysisReportHtml(root, files, projectName, threshold);
    }

    public update(mode: WelcomeState = "report") {
        if (mode === "setup-discovery") {
            this._panel.webview.html = this._getSetupDiscoveryHtml();
            this._panel.title = "🔎 LOC CODE COUNTER: Discovering Project";
        } else if (mode === "setup-filter" || mode === "report") {
            const root = this.provider.getCustomRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
            try {
                const gitignoreData = this._getGitignoreDataForStrategist(root);
                this._panel.webview.html = getStrategistViewHtml(
                    root,
                    this.provider.getDiscoveryTree(),
                    this.provider.getGitignoreManager(),
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
                this._panel.title = `⚙️ LOC CODE COUNTER: LOC:STEP B`;
            } catch (err: any) {
                vscode.window.showErrorMessage("Failed to render Strategist View: " + err.message);
                this._panel.webview.html = `<html><body><h2>Error rendering view</h2><pre>${err.stack}</pre></body></html>`;
            }
        } else if (mode === "setup-preview") {
            this._panel.webview.html = this._getSetupPreviewHtml();
            this._panel.title = "🔍 LOC CODE COUNTER: Scan Preview";
        }
    }

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

        const allNodes = this.provider.getFlattenedDiscovery();
        for (const node of allNodes) {
            if (node.relPath.startsWith(targetPath + '/')) {
                updateSets(node.relPath);
            }
        }

        const settings = vscode.workspace.getConfiguration("codeCount");
        await settings.update("manualExclusions", Array.from(this.provider._manualExclusions), vscode.ConfigurationTarget.Workspace);
        await settings.update("manualInclusions", Array.from(this.provider._manualInclusions), vscode.ConfigurationTarget.Workspace);

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
        const sources = ig.getAllSources() as string[];
        return sources.map((src: string) => {
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

    private _getCommonHtml(body: string, title: string = "LOC CODE COUNTER"): string {
        const cspSource = this._panel.webview.cspSource;
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<script>
  window.openPath = (path, isFile = false, isExtensionPath = false, query = '') => {
    const vscode = acquireVsCodeApi();
    vscode.postMessage({ 
      command: 'openPath', 
      path: path, 
      isFile: isFile, 
      isExtensionPath: isExtensionPath,
      query: query
    });
  };
</script>
${getCommonHtml({ cspSource })}
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

        return `
      <div class="hero">
        <div class="hero-bg-icon">${icon}</div>
        <div style="display: flex; gap: 20px; align-items: center; position: relative; z-index: 1;">
          <div class="hero-icon-large">${icon}</div>
          <div>
            <div class="badge">LOC CODE COUNTER</div>
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

    private _getSamples(): { name: string; path: string }[] {
        try {
            const samplesPath = path.join(this._context.extensionUri.fsPath, 'test-project-samples');
            if (fs.existsSync(samplesPath)) {
                return fs.readdirSync(samplesPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => ({
                        name: dirent.name,
                        path: path.join(samplesPath, dirent.name).replace(/\\/g, '/')
                    }));
            }
        } catch (e) {
            console.error("Failed to read samples directory:", e);
        }
        return [];
    }

    private _detectProjectProfile() {
        const root = this.provider.getCustomRoot() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
        const result = this.provider.detectProjectProfile(root);
        const matchedProfile = result.matchedProfile || profiles.find(p => p.id === 'generic') || (profiles.length > 0 ? profiles[0] : null);
        
        return {
          matchedProfile,
          matchedFile: result.matchedFile || root,
          matchedDetail: result.matchedDetail || "standard",
          root: root
        };
    }

    private _getSetupDiscoveryHtml(): string {
        const { matchedProfile, matchedFile, root } = this._detectProjectProfile();
        const isMonitorEnabled = vscode.workspace.getConfiguration("codeCount").get<boolean>("enabled") ?? true;
        const icon = matchedProfile?.icon || "🔍";
        const hero = this._uiHero("STEP A: DISCOVERY 🔎", "Detecting Project Profile", {
            root,
            matchedFile,
            profileId: matchedProfile?.id || "generic",
            profileSource: matchedProfile?.sourceFile || "profiles.ts",
            icon
        });

        // Get sample projects for easy testing
        const samples = this._getSamples();
        const samplesHtml = samples.length > 0 ? `
            <div class="card" style="margin-top: 16px; padding: 12px;">
                <h3 style="margin: 0 0 10px 0; font-size: 14px; opacity: 0.8;">🚀 Try a Sample Project</h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px;">
                    ${samples.map(s => `
                        <button class="btn-tiny" style="height: 32px; justify-content: flex-start; text-align: left; padding: 0 8px; font-size: 11px;" onclick="selectSample('${s.path}')">
                            ${s.name}
                        </button>
                    `).join('')}
                </div>
            </div>
        ` : "";

        const body = `
      ${hero}
      ${samplesHtml}
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');
        .hero { margin-bottom: 24px; }
        .hero-icon-large { font-size: 48px; display: flex; align-items: center; justify-content: center; width: 72px; height: 72px; background: rgba(255,255,255,0.03); border-radius: 16px; border: 1px solid var(--glass-border); box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
        .hero-bg-icon { position: absolute; top: -20px; right: 0; font-size: 150px; opacity: 0.05; pointer-events: none; filter: blur(2px); }
        .badge { display: inline-flex; padding: 3px 8px; border-radius: 4px; background: rgba(0, 122, 204, 0.15); color: #4fc3f7; font-size: 10px; font-weight: 700; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        .project-info { color: var(--text-muted); font-size: 16px; opacity: 0.85; margin-top: 8px; padding-bottom: 4px; line-height: 1.4; }
        .project-info strong { color: var(--vscode-foreground); font-weight: 600; }
        .meta-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
        .meta-label { color: var(--text-muted); font-weight: 800; font-size: 9px; padding: 1px 4px; border-radius: 2px; background: rgba(255,255,255,0.05); letter-spacing: 0.5px; }
        .meta-link { color: var(--accent); text-decoration: none; cursor: pointer; opacity: 0.8; word-break: break-all; white-space: normal; display: block; max-height: none; overflow: visible; text-overflow: clip; }
        .meta-link:hover { opacity: 1; text-decoration: underline; }
        .btn-tiny { background: transparent; border: 1px solid var(--glass-border); color: var(--text-muted); padding: 0 6px; border-radius: 3px; font-size: 9px; font-weight: 600; cursor: pointer; }
        .btn-tiny:hover { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
        
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
        <div class="terminal-line"><span class="prefix">&gt;</span> <span class="status">Initial scan... [Please wait]</span><span class="cursor"></span></div>
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
                <span class="material-symbols-outlined" style="font-size: 20px;">folder_data</span>
                Proceed to step B.
                <span class="material-symbols-outlined" style="font-size: 20px;">arrow_right</span>
            </button>
        </div>
      </div>
      <script>
        var vscode = acquireVsCodeApi();
        const linesContainer = document.getElementById('lines');
        const bar = document.getElementById('bar');
        const percentText = document.getElementById('percent');
        
        let fileCount = 0;
        let isScanFinished = false;

        function proceedToStrategist() {
            vscode.postMessage({ command: 'completeDiscovery' });
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

        function selectSample(path) {
            vscode.postMessage({ command: 'selectSample', path: path });
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

        // Trigger scan automatically on load
        vscode.postMessage({ command: 'startSetup' });
      </script>
    `;
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

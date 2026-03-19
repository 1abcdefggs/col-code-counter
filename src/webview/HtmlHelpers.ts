import * as vscode from "vscode";

/**
 * Shared HTML snippets for the Code Count webviews.
 */

export function getCommonHtml(options: { cspSource: string }): string {
    return `
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono&display=swap">
    <style>
      :root {
        --glass-bg: rgba(255, 255, 255, 0.03);
        --glass-border: rgba(255, 255, 255, 0.08);
        --accent-blue: #007acc;
        --accent-glow: rgba(0, 122, 204, 0.3);
      }

      body {
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        line-height: 1.5;
        padding: 0;
        margin: 0;
        color: var(--vscode-editor-foreground);
        background: var(--vscode-editor-background);
        overflow-x: hidden;
      }

      .hero-gradient {
        position: fixed;
        top: -100px;
        right: -100px;
        width: 400px;
        height: 400px;
        background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
        z-index: -1;
        pointer-events: none;
        filter: blur(40px);
      }

      /* Premium Card Style */
      .premium-card {
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        backdrop-filter: blur(12px);
        border-radius: 12px;
        padding: 1.5rem;
        margin-bottom: 1.5rem;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .premium-card:hover {
        border-color: rgba(255, 255, 255, 0.15);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        transform: translateY(-2px);
      }

      /* Typography */
      h1, h2, h3 { font-weight: 600; letter-spacing: -0.02em; }
      .text-subtle { color: var(--vscode-descriptionForeground); font-size: 0.85rem; }

      /* Buttons */
      button {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: filter 0.2s;
      }
      button:hover { filter: brightness(1.1); }
      button:active { filter: brightness(0.9); }
      button.secondary {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
      }
    </style>
    <div class="hero-gradient"></div>
    `;
}

export function uiHero(): string {
    return `
    <div style="display:flex; align-items:center; gap: 1rem; margin-bottom: 2rem;">
      <div style="width: 48px; height: 48px; border-radius: 12px; background: var(--accent-blue); display:flex; align-items:center; justify-content:center; box-shadow: 0 4px 20px var(--accent-glow);">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
      </div>
      <div>
        <h1 style="margin:0; font-size: 1.4rem;">Code Count Pro</h1>
        <div class="text-subtle">Precision Code Analysis & Metrics</div>
      </div>
    </div>
    `;
}

export function getSetupDiscoveryHtml(options: { isAnalyzing: boolean }): string {
    return `
    <div class="premium-card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <h2 style="margin-top:0">Step A: Workspace Discovery</h2>
          <p class="text-subtle">Analyze project structure and identify source files for counting.</p>
        </div>
        ${options.isAnalyzing ? `
          <div style="display:flex; align-items:center; gap: 8px; color: var(--accent-blue); font-weight:500;">
            <div class="spinner"></div> Analyzing...
          </div>
        ` : ""}
      </div>
      <div style="margin-top: 1rem;">
          <button onclick="runDiscovery()">Begin Discovery</button>
      </div>
    </div>
    `;
}

export function getSetupPreviewHtml(options: { hasAnalyzed: boolean }): string {
    return `
    <div class="premium-card" style="opacity: ${options.hasAnalyzed ? 1 : 0.6}">
      <h2>Step B: Review & Refine</h2>
      <p class="text-subtle">Verify filtered files and adjust exclusion rules manually if needed.</p>
      <div style="margin-top: 1rem;">
          <button ${options.hasAnalyzed ? "" : "disabled"} onclick="openStrategist()">View Strategist Console</button>
      </div>
    </div>
    `;
}

---
reportVersion: 2.0
projectName: "Code-Count"
generatedAt: "2026-03-19T18:55:42.283Z"
analysis:
  profile: web-frontend
  lineThreshold: 200
  rules:
    gitLogic: true
    stackLogic: true
    dotLogic:
      dotFiles: true
      dotFolders: true
---

### ⚙️ Analysis Settings

| Property | Value |
| :--- | :--- |
| **Project** | Code-Count |
| **Profile** | `web-frontend` |
| **Threshold** | 200 lines |
| **Git Logic** | ✅ Active |
| **Stack/Dep Logic** | ✅ Active |

> **> AI AGENT INSTRUCTIONS:**
> **> ROLE:** You are an expert software architect.
> **> TASK:** Analyze the static analysis report below to identify technical debt and propose a concrete refactoring plan.
> **> FORMAT:**
> > 1.  **Executive Summary**: Briefly assess the project's health based on key metrics.
> > 2.  **Hotspot Identification**: List the top 3-5 files/directories from the 'Key Hotspots' section that require immediate attention and explain why.
> > 3.  **Actionable Recommendations**: For each identified hotspot, suggest specific refactoring techniques (e.g., component splitting, state management improvements, logic extraction).

### 📊 Executive Summary

| Category | Value |
| :--- | :--- |
| 📈 Total Lines | 19,912 |
| 📁 Tracked Files | 87 |
| 🙈 Excluded Files | 74 |
| ⚖️ Avg. File Size| 229 lines |

### 🧩 Language Distribution

| Type | Files | Lines (Total) | Lines (Code) |
| :--- | :--- | :--- | :--- |
| .js | 13 | 10,240 | 10,180 |
| .ts | 53 | 8,860 | 7,780 |
| .json | 4 | 311 | 308 |
| .md | 8 | 316 | 192 |
| .unknown | 2 | 44 | 34 |
| .tsx | 2 | 30 | 23 |
| .jsx | 1 | 42 | 22 |
| .py | 1 | 28 | 12 |
| .css | 1 | 11 | 6 |
| .toml | 1 | 8 | 5 |
| .rs | 1 | 22 | 5 |

### 🎯 Key Hotspots (Top 5 by Code Lines)

| File | Total Lines | Code Lines | Comments |
| :--- | :--- | :--- | :--- |
| `test-project-samples/test-edge-filenames/very_long_file.js` | 10002 | 10000 | 0 |
| `src/extension.ts` | 2272 | 2023 | 69 |
| `src/variants/strategist-view.ts` | 1797 | 1625 | 46 |
| `src/provider.ts` | 843 | 713 | 15 |
| `src/webview/Provider.ts` | 770 | 700 | 12 |

### 🙈 Excluded Item Log (Top 15)

| Path | Reason |
| :--- | :--- |
| `.gitignore` | Dot |
| `.vscode/extensions.json` | Profile |
| `.vscode/launch.json` | Profile |
| `.vscode/settings.json` | Profile |
| `.vscode/tasks.json` | Profile |
| `.vscodeignore` | Dot |
| `out/discovery-types.js` | Git |
| `out/discovery-types.js.map` | UserConfig |
| `out/excludes/configs.js` | Git |
| `out/excludes/configs.js.map` | UserConfig |
| `out/excludes/generic.js` | Git |
| `out/excludes/generic.js.map` | UserConfig |
| `out/excludes/ide.js` | Git |
| `out/excludes/ide.js.map` | UserConfig |
| `out/excludes/index.js` | Git |
| ...and 59 more... | |


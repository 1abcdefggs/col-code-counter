---
reportVersion: 2.0
projectName: "test-exclusions"
generatedAt: "2026-03-19T18:31:31.592Z"
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
| **Project** | test-exclusions |
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
| 📈 Total Lines | 44 |
| 📁 Tracked Files | 3 |
| 🙈 Excluded Files | 5 |
| ⚖️ Avg. File Size| 15 lines |

### 🧩 Language Distribution

| Type | Files | Lines (Total) | Lines (Code) |
| :--- | :--- | :--- | :--- |
| .tsx | 1 | 23 | 21 |
| .json | 1 | 15 | 15 |
| .md | 1 | 6 | 2 |

### 🎯 Key Hotspots (Top 5 by Code Lines)

| File | Total Lines | Code Lines | Comments |
| :--- | :--- | :--- | :--- |
| `src/App.tsx` | 23 | 21 | 0 |
| `package.json` | 15 | 15 | 0 |
| `.code-count/CODE_COUNT_MONITOR.md` | 6 | 2 | 2 |

### 🙈 Excluded Item Log (Top 15)

| Path | Reason |
| :--- | :--- |
| `.env.local` | Git |
| `.gitignore` | Dot |
| `.vscode/settings.json` | Profile |
| `_temp.js` | Git |
| `_test_folder/test.txt` | Git |


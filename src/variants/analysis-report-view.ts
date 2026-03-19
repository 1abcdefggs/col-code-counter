import * as path from 'path';

/**
 * File statistics entry for the analysis report.
 */
export interface FileReportEntry {
  relPath: string;
  totalLines: number;
  codeLines: number;
  commentLines: number;
  blankLines: number;
}

/**
 * Generate the Analysis Report HTML for a new webview tab.
 */
export function getAnalysisReportHtml(
  root: string,
  files: FileReportEntry[],
  projectName: string,
  threshold: number
): string {
  const totals = files.reduce((acc, f) => ({
    totalLines: acc.totalLines + f.totalLines,
    codeLines: acc.codeLines + f.codeLines,
    commentLines: acc.commentLines + f.commentLines,
    blankLines: acc.blankLines + f.blankLines,
  }), { totalLines: 0, codeLines: 0, commentLines: 0, blankLines: 0 });

  const commentPercent = totals.totalLines > 0
    ? ((totals.commentLines / totals.totalLines) * 100).toFixed(1)
    : '0.0';

  const filesJson = JSON.stringify(files.map(f => ({
      ...f,
      ext: path.extname(f.relPath).slice(1) || '---'
  })));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Analysis Report | ${projectName}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  :root {
    --accent: #007acc;
    --blue: #00d2ff; /* Premium Cyan/Blue for "Optimal" */
    --warning: #ff4d4d; /* Vibrant Red for "Heavy" */
    --bg-dark: #0a0a0a;
    --card-bg: rgba(30, 30, 30, 0.4);
    --border-clr: rgba(255, 255, 255, 0.08);
    --glass-bg: rgba(255, 255, 255, 0.02);
    --row-optimal: rgba(0, 210, 255, 0.03);
    --row-heavy: rgba(255, 77, 77, 0.05);
  }
  @keyframes scanComplete {
    0% { background: rgba(0, 210, 255, 0.15); }
    100% { background: radial-gradient(circle at top right, #0f172a, #020617); }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    padding: 30px;
    color: #f1f5f9;
    background: radial-gradient(circle at top right, #0f172a, #020617);
    background-attachment: fixed;
    line-height: 1.6;
    margin: 0;
    overflow-x: hidden;
    animation: scanComplete 2s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .glass-card {
    background: var(--card-bg);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid var(--border-clr);
    border-radius: 20px;
    padding: 24px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
    margin-bottom: 24px;
    transition: transform 0.3s ease;
  }
  .report-title {
    font-size: 32px;
    font-weight: 800;
    background: linear-gradient(135deg, #fff, var(--blue));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 16px;
    margin-top: 24px;
  }
  .stat-card {
    padding: 16px;
    background: var(--glass-bg);
    border-radius: 12px;
    border: 1px solid var(--border-clr);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;
  }
  .stat-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 100%);
    opacity: 0;
    transition: opacity 0.3s;
  }
  .stat-card:hover { 
    transform: translateY(-4px); 
    border-color: var(--blue);
    box-shadow: 0 12px 24px rgba(0, 210, 255, 0.12);
  }
  .stat-card:hover::before { opacity: 1; }
  .stat-value { font-size: 20px; font-weight: 900; color: #fff; line-height: 1; letter-spacing: -0.8px; }
  .stat-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #94a3b8; margin-top: 10px; }
  
  .controls {
    display: flex;
    gap: 24px;
    align-items: center;
    background: rgba(0,0,0,0.2);
    border-radius: 14px;
    padding: 10px 20px;
    border: 1px solid var(--border-clr);
  }
  .control-group { display: flex; align-items: center; gap: 16px; }
  .control-label { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
  input[type="range"] { 
    appearance: none;
    -webkit-appearance: none;
    height: 4px;
    background: rgba(255,255,255,0.1);
    border-radius: 2px;
    width: 180px;
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    height: 16px; width: 16px;
    border-radius: 50%;
    background: var(--blue);
    cursor: pointer;
    box-shadow: 0 0 10px rgba(0, 210, 255, 0.5);
  }
  input[type="number"] {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid var(--border-clr);
    color: #fff;
    padding: 8px 12px;
    border-radius: 8px;
    width: 70px;
    font-size: 14px;
    font-family: 'JetBrains Mono', monospace;
    text-align: center;
    outline: none;
  }
  input[type="number"]:focus { border-color: var(--blue); }

  table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }
  th {
    padding: 16px 20px;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: #64748b;
    background: rgba(15, 23, 42, 0.4);
    border-bottom: 1px solid var(--border-clr);
    cursor: pointer;
    transition: all 0.3s;
    text-align: left;
    white-space: nowrap;
  }
  th:hover { color: #fff; background: rgba(255,255,255,0.05); }
  th .sort-icon { margin-left: 8px; font-size: 12px; opacity: 0.3; transition: all 0.3s; }
  th.sort-active { color: var(--blue); }
  th.sort-active .sort-icon { opacity: 1; transform: scale(1.2); }
  
  td { padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.03); transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
  .num-cell { text-align: right; font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: -0.4px; }
  
  tr { transition: transform 0.2s ease, background 0.2s ease; }
  tr:hover { transform: scale(1.002); background: rgba(255, 255, 255, 0.02); }
  
  .row-heavy { background: var(--row-heavy); }
  .row-heavy td:first-child { border-left: 4px solid var(--warning); }
  
  .row-optimal { background: var(--row-optimal); }
  .row-optimal td:first-child { border-left: 4px solid var(--blue); }
  
  .badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 12px;
    border-radius: 100px;
    font-size: 9px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 1px;
    transition: all 0.3s;
  }
  .badge-heavy { 
    background: rgba(255, 77, 77, 0.1); 
    color: #ff6b6b; 
    border: 1px solid rgba(255, 77, 77, 0.2); 
    box-shadow: 0 0 15px rgba(255, 77, 77, 0.1);
  }
  .badge-optimal { 
    background: rgba(0, 210, 255, 0.1); 
    color: #4feaff; 
    border: 1px solid rgba(0, 210, 255, 0.2);
    box-shadow: 0 0 15px rgba(0, 210, 255, 0.1);
  }

  .export-btn {
    background: linear-gradient(135deg, var(--accent), #005bb5);
    color: #fff;
    border: none;
    padding: 12px 24px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 12px;
    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    box-shadow: 0 4px 15px rgba(0, 122, 204, 0.3);
  }
  .export-btn:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 6px 20px rgba(0, 122, 204, 0.4); }
  .export-btn:active { transform: translateY(0) scale(1); }
</style>
</head>
<body>
  <div style="max-width: 1400px; margin: 0 auto;">
    <div class="glass-card">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <div class="report-title">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color: var(--blue)"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                  STEP C: LOC COUNTER
                </div>
                <div style="font-size: 14px; opacity: 0.5; margin-left: 36px;">${projectName} &bull; Analysis Complete</div>
            </div>
            <div style="display: flex; gap: 12px;">
                <button class="export-btn" onclick="vscode.postMessage({ command: 'backToStrategist' })" style="background: rgba(255,255,255,0.1); color: #94a3b8; border: 1px solid var(--border-clr); box-shadow: none;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    Back
                </button>
                <button class="export-btn" onclick="vscode.postMessage({ command: 'exportMarkdown' })">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                    Export
                </button>
            </div>
        </div>

        <div class="stat-grid">
            <div class="stat-card">
                <div class="stat-value">${files.length}</div>
                <div class="stat-label">File Units</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${totals.totalLines.toLocaleString()}</div>
                <div class="stat-label">Total LOC</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: var(--blue)">${totals.codeLines.toLocaleString()}</div>
                <div class="stat-label">Simple LOC</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: #f4c842">${totals.commentLines.toLocaleString()}</div>
                <div class="stat-label">Comment LOC</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="opacity: 0.7">${commentPercent}%</div>
                <div class="stat-label">Comment Density</div>
            </div>
        </div>
    </div>

    <div class="glass-card" style="padding: 0; overflow: hidden;">
        <div style="padding: 24px; border-bottom: 1px solid var(--border-clr); display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.1);">
            <div class="controls">
                <div class="control-group">
                    <span class="control-label">Complexity Threshold</span>
                    <input type="range" id="thresholdRange" min="50" max="1000" step="10" value="${threshold}" list="thresholdTicks" oninput="updateThreshold(this.value)">
                    <datalist id="thresholdTicks">
                      <option value="50"></option>
                      <option value="250"></option>
                      <option value="500"></option>
                      <option value="750"></option>
                      <option value="1000"></option>
                    </datalist>
                    <input type="number" id="thresholdInput" value="${threshold}" oninput="updateThreshold(this.value)">
                </div>
                <p style="font-size: 10px; opacity: 0.6; margin: 8px 0 0 0; line-height: 1.4;">Adjust the threshold to highlight files exceeding the specified line count. Files above this limit are marked as "Heavy" for review.</p>
            </div>
            <div style="font-size: 11px; opacity: 0.4; text-transform: uppercase; letter-spacing: 2px;">Sorting Grid</div>
        </div>
        
        <div style="overflow-x: auto;">
            <table style="width: 100%;">
                <thead>
                    <tr id="header-row">
                        <th onclick="setSort('relPath')">
                            Unit Path <span class="sort-icon" id="sort-relPath">---</span>
                        </th>
                        <th onclick="setSort('ext')" style="width: 80px;">
                            Type <span class="sort-icon" id="sort-ext">---</span>
                        </th>
                        <th onclick="setSort('totalLines')" class="num-cell">
                            Total LOC <span class="sort-icon" id="sort-totalLines">---</span>
                        </th>
                        <th onclick="setSort('codeLines')" class="num-cell">
                            Simple LOC <span class="sort-icon" id="sort-codeLines">---</span>
                        </th>
                        <th onclick="setSort('commentLines')" class="num-cell">
                            Comment LOC <span class="sort-icon" id="sort-commentLines">---</span>
                        </th>
                        <th onclick="setSort('blankLines')" class="num-cell">
                            Blank Lines <span class="sort-icon" id="sort-blankLines">---</span>
                        </th>
                        <th style="width: 120px; text-align: center;">Status</th>
                    </tr>
                </thead>
                <tbody id="table-body">
                </tbody>
            </table>
        </div>
    </div>

    <!-- Metrics Guide -->
    <div class="glass-card" style="margin-top: 40px; border-left: 4px solid var(--blue);">
        <h3 style="margin-top: 0; display: flex; align-items: center; gap: 10px; font-size: 18px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            Metrics Guide
        </h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 24px; font-size: 13px; color: #94a3b8;">
            <div>
                <strong style="color: #fff; display: block; margin-bottom: 4px;">Total LOC (Physical LOC)</strong>
                Includes every line in the file, including comments and blank lines. A high count can lead to AI context limits.
            </div>
            <div>
                <strong style="color: #fff; display: block; margin-bottom: 4px;">Simple LOC (Logic)</strong>
                Meaningful code statements representing "Simple LOC". This excludes comments and blank lines, focusing on the core logic.
            </div>
            <div>
                <strong style="color: #fff; display: block; margin-bottom: 4px;">Comment LOC (Comments)</strong>
                Lines containing comments or documentation. Essential for maintenance but doesn't affect AI logic processing.
            </div>
            <div>
                <strong style="color: #fff; display: block; margin-bottom: 4px;">Blank Lines</strong>
                Lines containing only whitespace. Used for visual separation and readability.
            </div>
        </div>
    </div>
  </div>

  <script>
    var vscode = acquireVsCodeApi();
    const rawData = ${filesJson};
    let currentThreshold = ${threshold};
    let sortKey = 'relPath';
    let sortDir = 1;

    function updateThreshold(val) {
        currentThreshold = parseInt(val);
        document.getElementById('thresholdRange').value = val;
        document.getElementById('thresholdInput').value = val;
        vscode.postMessage({ command: 'updateThreshold', value: val });
        renderTable();
    }

    function setSort(key) {
        if (sortKey === key) {
            sortDir *= -1;
        } else {
            sortKey = key;
            sortDir = -1;
        }
        renderTable();
    }

    function renderTable() {
        const sorted = [...rawData].sort((a, b) => {
            let valA = a[sortKey];
            let valB = b[sortKey];
            if (typeof valA === 'string') {
                return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' }) * sortDir;
            }
            // For numbers, descending is often desired (dir=-1), 
            // but we follow sortDir logic.
            // If sortDir is 1 (Asc), it's valA - valB.
            // If sortDir is -1 (Desc), it's valB - valA.
            return sortDir === 1 ? (valA - valB) : (valB - valA);
        });

        // Calculate max values for column width adjustment
        const maxTotalLines = Math.max(...sorted.map(f => f.totalLines));
        const maxCodeLines = Math.max(...sorted.map(f => f.codeLines));
        const maxCommentLines = Math.max(...sorted.map(f => f.commentLines));
        const maxBlankLines = Math.max(...sorted.map(f => f.blankLines));

        // Calculate width based on digit count (approx 10px per digit)
        const getWidth = (maxVal) => Math.max(60, Math.floor(Math.log10(maxVal || 1) + 1) * 10 + 20);

        // Update column widths
        document.querySelector('th[onclick*="totalLines"]').style.width = getWidth(maxTotalLines) + 'px';
        document.querySelector('th[onclick*="codeLines"]').style.width = getWidth(maxCodeLines) + 'px';
        document.querySelector('th[onclick*="commentLines"]').style.width = getWidth(maxCommentLines) + 'px';
        document.querySelector('th[onclick*="blankLines"]').style.width = getWidth(maxBlankLines) + 'px';

        const tbody = document.getElementById('table-body');
        tbody.innerHTML = sorted.map(f => {
            const isHeavy = f.totalLines > currentThreshold;
            const statusClass = isHeavy ? 'badge-heavy' : 'badge-optimal';
            const statusText = isHeavy ? 'Heavy' : 'Optimal';
            const rowClass = isHeavy ? 'row-heavy' : 'row-optimal';
            const countStyle = isHeavy ? 'color: var(--warning); font-weight: 700;' : 'color: var(--blue); font-weight: 600;';

            return \`
                <tr class="\${rowClass}">
                    <td style="max-width: 500px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500;" title="\${f.relPath}">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                            \${f.relPath}
                        </div>
                    </td>
                    <td style="opacity: 0.4; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">\${f.ext}</td>
                    <td class="num-cell" style="\${countStyle}">\${f.totalLines.toLocaleString()}</td>
                    <td class="num-cell" style="opacity: 0.7;">\${f.codeLines.toLocaleString()}</td>
                    <td class="num-cell" style="opacity: 0.5; color: #f4c842;">\${f.commentLines.toLocaleString()}</td>
                    <td class="num-cell" style="opacity: 0.3;">\${f.blankLines.toLocaleString()}</td>
                    <td style="text-align: center;">
                        <span class="badge \${statusClass}">\${statusText}</span>
                    </td>
                </tr>
            \`;
        }).join('');

        // Update sort icons
        const headers = document.querySelectorAll('th');
        headers.forEach(h => {
            h.classList.remove('sort-active');
            const icon = h.querySelector('.sort-icon');
            if (icon) icon.textContent = '---';
        });

        const activeHeader = document.querySelector(\`th[onclick*="'\${sortKey}'"]\`);
        if (activeHeader) {
            activeHeader.classList.add('sort-active');
            const icon = activeHeader.querySelector('.sort-icon');
            if (icon) icon.textContent = sortDir === 1 ? '↑' : '↓';
        }
    }

    renderTable();
  </script>
</body>
</html>`;
}

/**
 * Generate a Markdown report string for export.
 */
export function generateReportMarkdown(
  projectName: string,
  files: FileReportEntry[],
  options: {
    threshold: number,
    profile: any,
    rules: {
      git: boolean,
      stack: boolean,
      dot: any
    },
    excludedFiles: { path: string, reason: string }[]
  }
): string {
  const sorted = [...files].sort((a, b) => b.codeLines - a.codeLines);
  const totals = sorted.reduce((acc, f) => ({
    totalLines: acc.totalLines + f.totalLines,
    codeLines: acc.codeLines + f.codeLines,
    commentLines: acc.commentLines + f.commentLines,
    blankLines: acc.blankLines + f.blankLines,
  }), { totalLines: 0, codeLines: 0, commentLines: 0, blankLines: 0 });

  const langStats: { [key: string]: { files: number, lines: number, code: number } } = {};
  files.forEach(f => {
    const ext = path.extname(f.relPath) || '.unknown';
    if (!langStats[ext]) {
      langStats[ext] = { files: 0, lines: 0, code: 0 };
    }
    langStats[ext].files++;
    langStats[ext].lines += f.totalLines;
    langStats[ext].code += f.codeLines;
  });

  // YAML Frontmatter
  let md = `---\n`;
  md += `reportVersion: 2.0\n`;
  md += `projectName: "${projectName}"\n`;
  md += `generatedAt: "${new Date().toISOString()}"\n`;
  md += `analysis:\n`;
  md += `  profile: ${options.profile?.id || 'generic'}\n`;
  md += `  lineThreshold: ${options.threshold ?? ''}\n`;
  md += `  rules:\n`;
  md += `    gitLogic: ${options.rules.git}\n`;
  md += `    stackLogic: ${options.rules.stack}\n`;
  md += `    dotLogic:\n`;
  md += `      dotFiles: ${options.rules.dot.dotFile}\n`;
  md += `      dotFolders: ${options.rules.dot.dotFold}\n`;
  md += `---\n\n`;

  // --- Analysis Settings (Visible in Preview) ---
  md += `### ⚙️ Analysis Settings\n\n`;
  md += `| Property | Value |\n`;
  md += `| :--- | :--- |\n`;
  md += `| **Project** | ${projectName} |\n`;
  md += `| **Profile** | \`${options.profile?.id || 'generic'}\` |\n`;
  md += `| **Threshold** | ${options.threshold ?? ''} lines |\n`;
  md += `| **Git Logic** | ${options.rules.git ? '✅ Active' : '❌ Disabled'} |\n`;
  md += `| **Stack/Dep Logic** | ${options.rules.stack ? '✅ Active' : '❌ Disabled'} |\n`;
  md += `\n`;

  // AI Agent Instructions
  md += `> **> AI AGENT INSTRUCTIONS:**\n`;
  md += `> **> ROLE:** You are an expert software architect.\n`;
  md += `> **> TASK:** Analyze the static analysis report below to identify technical debt and propose a concrete refactoring plan.\n`;
  md += `> **> FORMAT:**\n`;
  md += `> > 1.  **Executive Summary**: Briefly assess the project's health based on key metrics.\n`;
  md += `> > 2.  **Hotspot Identification**: List the top 3-5 files/directories from the 'Key Hotspots' section that require immediate attention and explain why.\n`;
  md += `> > 3.  **Actionable Recommendations**: For each identified hotspot, suggest specific refactoring techniques (e.g., component splitting, state management improvements, logic extraction).\n\n`;

  // Executive Summary
  md += `### 📊 Executive Summary\n\n`;
  md += `| Category | Value |\n`;
  md += `| :--- | :--- |\n`;
  md += `| 📈 Total Lines | ${totals.totalLines.toLocaleString()} |\n`;
  md += `| 📁 Tracked Files | ${files.length} |\n`;
  md += `| 🙈 Excluded Files | ${options.excludedFiles.length} |\n`;
  md += `| ⚖️ Avg. File Size| ${files.length > 0 ? (totals.totalLines / files.length).toFixed(0) : '0'} lines |\n\n`;

  // Language Distribution
  md += `### 🧩 Language Distribution\n\n`;
  md += `| Type | Files | Lines (Total) | Lines (Code) |\n`;
  md += `| :--- | :--- | :--- | :--- |\n`;
  Object.entries(langStats).sort(([, a], [, b]) => b.code - a.code).forEach(([ext, stats]) => {
    md += `| ${ext} | ${stats.files} | ${stats.lines.toLocaleString()} | ${stats.code.toLocaleString()} |\n`;
  });
  md += `\n`;

  // Key Hotspots
  md += `### 🎯 Key Hotspots (Top 5 by Code Lines)\n\n`;
  md += `| File | Total Lines | Code Lines | Comments |\n`;
  md += `| :--- | :--- | :--- | :--- |\n`;
  sorted.slice(0, 5).forEach(f => {
    md += `| \`${f.relPath}\` | ${f.totalLines} | ${f.codeLines} | ${f.commentLines} |\n`;
  });
  md += `\n`;
  
  // Excluded Item Log
  md += `### 🙈 Excluded Item Log (Top 15)\n\n`;
  md += `| Path | Reason |\n`;
  md += `| :--- | :--- |\n`;
  options.excludedFiles.slice(0, 15).forEach(f => {
    md += `| \`${f.path}\` | ${f.reason} |\n`;
  });
  if (options.excludedFiles.length > 15) {
    md += `| ...and ${options.excludedFiles.length - 15} more... | |\n`;
  }
  md += `\n`;

  return md;
}

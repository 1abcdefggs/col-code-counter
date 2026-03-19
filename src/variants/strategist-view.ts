import * as path from "path";
import { DiscoveryNode } from "../discovery-types";
import { GitignoreManager } from "../gitignore/manager";

/**
 * Generates the "Strategist View" (Consolidated).
 */
export function getStrategistViewHtml(
    root: string,
    discoveryTree: DiscoveryNode[],
    igManager: GitignoreManager | null,
    profileInfo: { matchedProfile: any, matchedDetail: any, matchedFile: any },
    gitignoreData: any[],
    options: { 
        isGitignoreEnabled: boolean, 
        isProfileExcludeEnabled: boolean, 
        isDependencyExcludeEnabled: boolean, 
        dotExclusions: { dotFold: boolean, dotFile: boolean, underscoreFold: boolean, underscoreFile: boolean }, 
        isBulkExclusionEnabled: boolean,
        disabledGitignoreSources: string[],
        manualExclusions: string[],
        manualInclusions: string[],
        expandedPaths: string[],
        hasAnalyzed: boolean,
        isAutoAnalyzerEnabled: boolean,
        isAnalyzing: boolean,
        isManualLogicEnabled: boolean,
        baselineInfo?: { timestamp: number, fileCount: number },
        getDelta: (relPath: string, lines: number) => number | null,
        lastDebugError?: string
    },
    storagePath?: string
): string {
    // Helper to safely escape strings embedded into single-quoted JS attributes
    const esc = (v: any) => {
        if (v === undefined || v === null) return '';
        return String(v)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '');
    };
    const { matchedProfile, matchedDetail, matchedFile } = profileInfo;
    
    // Configure igManager with disabled sources
    if (igManager) {
        igManager.setDisabledSources(new Set(options.disabledGitignoreSources));
    }

    // Statistics counters
    const stats_extCounts: Record<string, number> = {};
    let totalTrackedFiles = 0;
    let ignoredFilesCount = 0;
    let stats_gitIgnoredCount = 0;
    let stats_profCount = 0;
    let stats_depCount = 0;
    let stats_dotCount = 0;

    interface TreeItem {
        name: string;
        relPath: string;
        depth: number;
        isFile: boolean;
        isGit: boolean;
        isProf: boolean;
        isDot: boolean;
        isDep: boolean;
        isManual: boolean;
        isGitMatch: boolean;
        isProfMatch: boolean;
        isDotMatch: boolean;
        isDepMatch: boolean;
        isManualMatch: boolean;
        isUserEx: boolean;
        isUserIn: boolean;
        isExcluded: boolean;
        exclusionReason?: string;
        delta: number | null;
        children: TreeItem[];
        hasExcludedChild: boolean;
        isExpanded?: boolean;
    }

    const matchedDotFoldersArr: {name: string, relPath: string, isExcluded: boolean, reason: string}[] = [];
    const matchedUnderscoreFoldersArr: {name: string, relPath: string, isExcluded: boolean, reason: string}[] = [];
    const matchedDotFilesArr: {name: string, relPath: string, isExcluded: boolean, reason: string}[] = [];
    const matchedUnderscoreFilesArr: {name: string, relPath: string, isExcluded: boolean, reason: string}[] = [];

    function decorateTree(nodes: DiscoveryNode[], depth: number, parentExcluded: boolean = false, parentIncluded: boolean = false): { decorated: TreeItem[], hasExcluded: boolean } {
        let treeHasExcluded = false;
        const decorated = nodes.map(node => {
            const relPath = node.relPath;
            const isGitMatch = igManager ? igManager.isIgnoredRaw(relPath) : false;
            const isGit = (igManager && options.isGitignoreEnabled) ? igManager.isIgnored(relPath) : false;

            const isProfMatch = matchedProfile?.ignoreFolders?.some((f: string) => relPath === f || relPath.startsWith(f + '/'));
            const isProf = options.isProfileExcludeEnabled && isProfMatch;

            const isDepMatch = (relPath.includes('node_modules') || relPath.includes('vendor') || relPath.includes('packages'));
            const isDep = options.isDependencyExcludeEnabled && isDepMatch;
            
            const isDotFoldMatch = node.name.startsWith('.') && node.isDir;
            const isDotFileMatch = node.name.startsWith('.') && !node.isDir;
            const isUnderFoldMatch = node.name.startsWith('_') && node.isDir;
            const isUnderFileMatch = node.name.startsWith('_') && !node.isDir;

            const isDotFold = options.dotExclusions.dotFold && isDotFoldMatch;
            const isDotFile = options.dotExclusions.dotFile && isDotFileMatch;
            const isUnderFold = options.dotExclusions.underscoreFold && isUnderFoldMatch;
            const isUnderFile = options.dotExclusions.underscoreFile && isUnderFileMatch;
            const isDot = isDotFold || isDotFile || isUnderFold || isUnderFile;
            
            const isDotAnyMatch = isDotFoldMatch || isDotFileMatch || isUnderFoldMatch || isUnderFileMatch;

            const isManualMatch = node.ignoreReason === 'Manual';
            const isManual = options.isManualLogicEnabled && isManualMatch;

            // Delta Lookups
            const lines = 0; // Tree doesn't have lines yet, need adjustment or just show if exists in cache
            const delta = options.getDelta(relPath, 0); // Placeholder until analysis

            const isUserEx = options.manualExclusions.includes(relPath);
            const isUserIn = options.manualInclusions.includes(relPath);

            const isAutoExcluded = options.isBulkExclusionEnabled && (isGit || isProf || isDep || isDot || isManual);
            const isExcluded = (isAutoExcluded || isUserEx || parentExcluded) && !isUserIn && !parentIncluded;

            let exclusionReason = "";
            if (isExcluded) {
                if (isUserIn || parentIncluded) exclusionReason = "None (Manually Included)";
                else if (isUserEx) exclusionReason = "Manually Excluded";
                else if (parentExcluded) exclusionReason = "Excluded by Parent Folder";
                else if (isGit) exclusionReason = "Excluded by .gitignore";
                else if (isProf) exclusionReason = "Excluded by Project Profile";
                else if (isDep) exclusionReason = "Excluded by Dependency Rule";
                else if (isDot) exclusionReason = "Excluded by Dot-Logic Rule";
                else if (isManual) exclusionReason = "Excluded by Custom Manual Rule";
            } else {
                exclusionReason = "Included in Analysis";
            }

            if (isDotAnyMatch) {
                const listData = { 
                    name: node.name, 
                    relPath, 
                    isExcluded, 
                    isSpecificMatch: isDot, // This specific logic's state
                    reason: exclusionReason 
                };
                if (isDotFoldMatch) matchedDotFoldersArr.push(listData);
                else if (isUnderFoldMatch) matchedUnderscoreFoldersArr.push(listData);
                else if (isDotFileMatch) matchedDotFilesArr.push(listData);
                else if (isUnderFileMatch) matchedUnderscoreFilesArr.push(listData);
            }

            if (!node.isDir) {
                totalTrackedFiles++;
                if (isExcluded) ignoredFilesCount++;
                if (isGit) stats_gitIgnoredCount++;
                if (isProf) stats_profCount++;
                if (isDep) stats_depCount++;
                if (isDot) stats_dotCount++;
                
                const ext = path.extname(node.name).toLowerCase() || '(no ext)';
                stats_extCounts[ext] = (stats_extCounts[ext] || 0) + 1;
            } else {
                // For folders, we still count them in the individual stats if they are excluded,
                // so the user sees that the logic is working even for hard-excluded dirs like node_modules.
                if (isExcluded) ignoredFilesCount++;
                if (isGit) stats_gitIgnoredCount++;
                if (isProf) stats_profCount++;
                if (isDep) stats_depCount++;
                if (isDot) stats_dotCount++;
            }

            const { decorated: childItems, hasExcluded: childHasExcluded } = decorateTree(node.children || [], depth + 1, isExcluded, isUserIn || parentIncluded);
            
            if (isExcluded || childHasExcluded) treeHasExcluded = true;

            const item: TreeItem = {
                name: node.name,
                relPath,
                depth,
                isFile: !node.isDir,
                isGit,
                isProf,
                isDot,
                isDep,
                isManual,
                isGitMatch,
                isProfMatch,
                isDotMatch: isDotAnyMatch,
                isDepMatch,
                isManualMatch,
                isUserEx,
                isUserIn,
                isExcluded,
                exclusionReason: isExcluded ? (isUserEx ? 'User Excluded' : (isManual ? 'Manual rule' : (isGit ? 'Gitignored' : (isProf ? 'Profile rule' : (isDep ? 'Dependency' : (isDot ? 'Dot/Underscore' : 'Unknown')))))) : undefined,
                delta: options.getDelta(relPath, 0),
                children: childItems,
                hasExcludedChild: childHasExcluded,
                isExpanded: options.expandedPaths.includes(relPath)
            };
            return item;
        });

        return { decorated, hasExcluded: treeHasExcluded };
    }

    const { decorated: decoratedTree } = decorateTree(discoveryTree, 0);

    function flattenTree(nodes: TreeItem[]): TreeItem[] {
        const flat: TreeItem[] = [];
        for (const node of nodes) {
            flat.push(node);
            if (node.isExpanded && node.children.length > 0) {
                flat.push(...flattenTree(node.children));
            }
        }
        return flat;
    }

    const flattened = flattenTree(decoratedTree);
    const sortedLangs = Object.entries(stats_extCounts).sort((a, b) => b[1] - a[1]);

    function getLangColor(index: number) {
        const colors = ['#007acc', '#4fc1ff', '#23d18b', '#f4c842', '#e91e63', '#9c27b0', '#673ab7'];
        return colors[index % colors.length];
    }

    function safePath(p: string | undefined | null) { return (p || '').replace(/\\/g, '/'); }

    const css = `
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0');
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
        :root {
            --accent: #f14c4c;
            --accent-dim: #f14c4c22;
            --bg-dark: #0a0a0a;
            --card-bg: #111111;
            --border-clr: rgba(255, 255, 255, 0.05);
            --font-s: 11px;
            --font-m: 13px;
        }
        :root {
            --accent: #23d18b;
            --glass-bg: rgba(255, 255, 255, 0.03);
            --glass-border: rgba(255, 255, 255, 0.08);
            --glass-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 0;
            background: #050507;
            color: #ececed;
            line-height: 1.6;
            user-select: none;
            overflow-x: hidden;
            -webkit-font-smoothing: antialiased;
        }
        .main-gradient-bg {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: 
                radial-gradient(circle at 10% 10%, rgba(26, 26, 46, 0.4) 0%, transparent 50%),
                radial-gradient(circle at 90% 90%, rgba(10, 10, 12, 0.4) 0%, transparent 50%),
                radial-gradient(circle at 50% -20%, #111122 0%, #050507 80%);
            z-index: -1;
            transition: all 1.5s cubic-bezier(0.4, 0, 0.2, 1);
            background-size: 200% 200%;
            animation: bg-shift 30s infinite alternate;
        }
        @keyframes bg-shift {
            0% { background-position: 0% 0%; }
            100% { background-position: 100% 100%; }
        }
        .main-gradient-bg.scan-finish {
            background: radial-gradient(circle at 50% -20%, #1e4d8a 0%, #050507 90%);
            animation: flash-blue 2s ease-out;
        }
        @keyframes flash-blue {
            0% { filter: brightness(1) contrast(1); }
            15% { filter: brightness(1.8) contrast(1.2); }
            100% { filter: brightness(1) contrast(1); }
        }
        .clickable-label {
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .clickable-label:hover {
            text-decoration: underline;
            filter: brightness(1.2);
        }
        
        .hero-card {
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 24px;
            background: var(--card-bg);
            border: 1px solid var(--border-clr);
        }
        .hero-body { padding: 16px; }
        
        .area-container {
            margin-bottom: 28px;
            background: rgba(18, 18, 22, 0.6);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.04);
            border-left: 5px solid #333;
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.05);
            transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .area-container:hover {
            border-color: rgba(255,255,255,0.1);
            transform: translateY(-2px);
        }
        .area-container.area-1 { border-left-color: #3794ef; }
        .area-container.area-2 { border-left-color: var(--accent); }
        .area-container.area-3 { border-left-color: #23d18b; }
        .area-container.area-4 { border-left-color: #00d2ff; }

        .card-header { margin-bottom: 24px; }
        .card-title {
            display: flex;
            align-items: center;
            gap: 16px;
            font-weight: 800;
            font-size: 24px;
            text-transform: uppercase;
            letter-spacing: -0.5px;
            color: #ccc;
        }
        .area-1 .card-title { color: #3794ef; }
        .area-2 .card-title { color: #e51c23; }
        .area-3 .card-title { color: #23d18b; }
        .area-4 .card-title { color: #00d2ff; }

        .step-num {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 18px;
            background: var(--accent);
            color: white;
            flex-shrink: 0;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .area-1 .step-num { background: #3794ef; }
        .area-3 .step-num { background: #23d18b; }
        .area-4 .step-num { background: #00d2ff; }

        .pipeline-step .step-num {
            width: 24px;
            height: 24px;
            font-size: 14px;
            border-radius: 6px;
            box-shadow: none;
        }
        .pipeline-step.step-2 .step-num { background: var(--accent); }
        .pipeline-step.step-3 .step-num { background: #23d18b; }
        .pipeline-step.step-4 .step-num { background: #00d2ff; }

        .switch {
            position: relative;
            display: inline-block;
            width: 32px;
            height: 18px;
        }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: #3e3e42;
            transition: .2s;
            border-radius: 18px;
        }
        .slider:before {
            position: absolute;
            content: "";
            height: 12px;
            width: 12px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .2s;
            border-radius: 50%;
        }
        input:checked + .slider { background-color: var(--accent); }
        input:checked + .slider:before { transform: translateX(14px); }

        @keyframes logic-card-activate {
            0% { transform: scale(1); box-shadow: 0 0 0 rgba(0,0,0,0); border-color: transparent; }
            50% { transform: scale(1.02); box-shadow: 0 0 20px var(--card-glow, #3794ef); border-color: var(--card-glow, #3794ef); }
            100% { transform: scale(1); box-shadow: 0 0 0 rgba(0,0,0,0); border-color: var(--glass-border); }
        }
        .logic-card.activating {
            animation: logic-card-activate 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            z-index: 10;
        }
        
        @keyframes badge-change-pulse {
            0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(var(--badge-pulse-color), 0.7); }
            50% { transform: scale(1.1); box-shadow: 0 0 0 8px rgba(var(--badge-pulse-color), 0); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(var(--badge-pulse-color), 0); }
        }
        .badge.pulse-action {
            animation: badge-change-pulse 0.4s ease-out;
        }

        .disabled-area {
            opacity: 0.5;
            filter: grayscale(0.5);
            transition: all 0.3s ease;
        }

        .logic-card {
            background: var(--glass-bg);
            border: 1px solid var(--glass-border);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
            backdrop-filter: blur(8px);
        }
        .logic-card:hover {
            border-color: rgba(255,255,255,0.15);
            transform: translateY(-2px);
            box-shadow: var(--glass-shadow);
        }
        .logic-card::after {
            content: '';
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            background: linear-gradient(45deg, transparent, rgba(255,255,255,0.01), transparent);
            pointer-events: none;
        }
        .logic-card-inner {
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 6px;
            padding: 10px;
            margin-bottom: 8px;
        }
        .rule-summary {
            font-size: 13px;
            opacity: 0.8;
            margin-top: 6px;
            padding-left: 36px;
            font-style: italic;
            color: #ccc;
        }
        .rule-summary b { color: #e51c23; }

        .tree-container { margin-top: 20px; font-size: 14px; max-height: 600px; overflow: auto; }
        .tree-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.03);
            border-bottom: 1px solid var(--border-clr);
            font-size: 10px;
            letter-spacing: 0.5px;
            font-weight: 600;
        }
        .header-filters {
            display: flex;
            align-items: center;
            flex-grow: 1;
            margin-left: 12px;
        }
        .filter-group {
            display: flex;
            gap: 4px;
            align-items: center;
        }
        .filter-spacer {
            flex-grow: 1;
        }
        .column-filters {
            display: flex;
            gap: 4px;
            margin-right: 4px;
        }
        .col-filter-slot {
            display: flex;
            justify-content: center;
        }
        .filter-token {
            padding: 2px 6px;
            border-radius: 3px;
            cursor: pointer;
            opacity: 0.5;
            transition: all 0.2s;
            border: 1px solid transparent;
        }
        .filter-token.mini {
            font-size: 8px;
            padding: 1px 4px;
        }
        .filter-token:hover { opacity: 1; background: rgba(255,255,255,0.05); }
        .filter-token.active {
            opacity: 1;
            background: var(--accent-dim);
            color: var(--accent);
            border-color: var(--accent);
            box-shadow: 0 0 10px rgba(0, 122, 204, 0.3);
        }
        .filter-token.git.active { background: rgba(229, 28, 35, 0.15); color: #e51c23; border-color: #e51c23; }
        .filter-token.sta.active { background: rgba(255, 87, 34, 0.15); color: #ff5722; border-color: #ff5722; }
        .filter-token.dot.active { background: rgba(255, 61, 0, 0.15); color: #ff3d00; border-color: #ff3d00; }
        .filter-token.man.active { background: rgba(0, 210, 255, 0.15); color: #00d2ff; border-color: #00d2ff; }
        .filter-token.user.active { background: rgba(192, 160, 108, 0.15); color: #c0a06c; border-color: #c0a06c; }
        
        @keyframes scan-flash {
            0% { background-color: rgba(0, 122, 204, 0.1); }
            50% { background-color: rgba(0, 122, 204, 0.2); }
            100% { background-color: transparent; }
        }
        .just-scanned {
            animation: scan-flash 2.5s ease-out;
        }

        .status-badge {
            font-size: 10px;
            font-weight: 900;
            padding: 2px 8px;
            border-radius: 20px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        .status-badge.complete {
            background: rgba(0, 122, 204, 0.15);
            color: #00d2ff;
            border: 1px solid rgba(0, 210, 255, 0.3);
            box-shadow: 0 0 12px rgba(0, 210, 255, 0.2);
        }
        .status-badge.pending {
            background: rgba(255, 255, 255, 0.05);
            color: #888;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .scoped-tooltip {
            font-size: 10px;
            opacity: 0.5;
            font-style: italic;
            margin-left: 8px;
        }
        .tree-row {
            display: flex;
            align-items: center;
            padding: 2px 4px;
            border-radius: 4px;
            gap: 6px;
        }
        .tree-row:hover { background: rgba(255,255,255,0.05); }
        .tree-row.excluded { opacity: 0.6; }
        .tree-name.excluded { text-decoration: line-through; }
        
        .slider.blood-orange:before { background-color: #ff3d00; }
        input:checked + .slider.blood-orange { background-color: rgba(255, 61, 0, 0.3); }
        .slider.deep-orange:before { background-color: #ff5722; }
        input:checked + .slider.deep-orange { background-color: rgba(255, 87, 34, 0.3); }
        .slider.git-red:before { background-color: #e51c23; }
        input:checked + .slider.git-red { background-color: rgba(229, 28, 35, 0.3); }

        .badge {
            font-size: 9px;
            font-weight: 800;
            padding: 2px 5px;
            border-radius: 4px;
            text-transform: uppercase;
            transition: all 0.3s ease;
        }
        .badge.git { background: #e51c23; color: #ffffff; }
        .badge.sta { background: #ff5722; color: #ffffff; }
        .badge.dot { background: #ff3d00; color: #ffffff; }
        .badge.user { background: #c0a06c; color: #ffffff; }
        .badge.manual { background: #00d2ff; color: #ffffff; }
        .badge.inactive { opacity: 0; transform: scale(0.9); visibility: hidden; pointer-events: none; }
        .badge.interactive.inactive { opacity: 0.2; transform: scale(0.95); visibility: visible; pointer-events: auto; filter: grayscale(1); }

        .badge-slot { width: 28px; display: flex; justify-content: center; align-items: center; flex-shrink: 0; }
        .tree-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; margin-bottom: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); background: rgba(0, 0, 0, 0.1); border-radius: 4px; pointer-events: auto; }
        .btn-tiny {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            color: #aaa;
            padding: 2px 6px;
            border-radius: 3px;
            cursor: pointer;
            font-weight: 800;
            transition: all 0.2s;
            user-select: none;
        }
        .btn-tiny:hover {
            background: rgba(255,255,255,0.1);
            color: #fff;
            border-color: rgba(255,255,255,0.2);
        }
        .header-label { font-size: 10px; font-weight: 800; color: #666; margin-left: 8px; letter-spacing: 1px; }

        .filter-token.column-header { padding: 2px 0; width: 100%; font-size: 9px; text-align: center; border-radius: 3px; opacity: 0.2; }
        .filter-token.column-header.active { opacity: 0.9; background: var(--cat-color); color: #fff; box-shadow: 0 0 8px var(--cat-color); }
        .filter-token.column-header.rule-off { filter: grayscale(1); opacity: 0.15 !important; }

        .btn-primary { background: #007acc; color: white; border: none; padding: 10px 20px; border-radius: 4px; font-weight: 800; cursor: pointer; transition: all 0.2s; }
        .btn-primary:hover { filter: brightness(1.1); }
        
        .filter-tokens { display: flex; gap: 8px; margin-bottom: 16px; }
        .workflow-pipeline {
            display: flex;
            align-items: stretch;
            justify-content: center;
            gap: 12px;
            margin: 32px 0;
            background: rgba(0,0,0,0.2);
            padding: 12px;
            border-radius: 14px;
            border: 1px solid rgba(255,255,255,0.03);
        }
        .pipeline-step {
            flex: 0 1 180px;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 16px;
            background: rgba(255,255,255,0.02);
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,0.05);
            transition: all 0.3s ease;
            position: relative;
        }
        .pipeline-step:hover {
            background: rgba(255,255,255,0.04);
            transform: translateY(-1px);
        }
        .pipeline-step.active {
            background: rgba(255,255,255,0.05);
            border-color: rgba(255,255,255,0.1);
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }
        .pipeline-step.step-2 { border-bottom: 3px solid var(--accent); }
        .pipeline-step.step-1 { border-bottom: 3px solid #4fc3f7; opacity: 0.7; transition: all 0.2s; }
        .pipeline-step.step-1:hover { opacity: 1; border-color: #4fc3f7; background: rgba(79, 195, 247, 0.1); }
        .pipeline-step.step-3 { border-bottom: 3px solid #23d18b; opacity: 0.7; }
        .pipeline-step.step-4 { border-bottom: 3px solid #00d2ff; opacity: 0.7; }
        
        .pipeline-arrow {
            display: flex;
            align-items: center;
            color: rgba(255,255,255,0.7);
            padding: 0 4px;
        }

        .pipeline-arrow svg {
            width: 24px;
            height: 24px;
            opacity: 0.9;
        }

        .expansion-toggle { color: #888; font-size: 10px; width: 14px; text-align: center; cursor: pointer; }
        .expansion-toggle:hover { color: white; }

        .matched-dir-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 8px; min-width: 140px; }
        .matched-dir-label { font-size: 12px; opacity: 0.8; font-weight: 600; color: #aaa; }
        .matched-badges-row { display: flex; gap: 6px; flex-wrap: wrap; }
        .clickable-label { cursor: pointer; }
        .clickable-label:hover { text-decoration: underline; opacity: 1 !important; }

        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(35, 209, 139, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(35, 209, 139, 0); }
            100% { box-shadow: 0 0 0 0 rgba(35, 209, 139, 0); }
        }
        .pulsing-highlight {
            animation: pulse 2s infinite;
        }
        .scanner-pulse {
            animation: scanner-line 2s infinite alternate;
        }
        @keyframes scanner-line {
            0% { transform: translateY(-50%); opacity: 0.5; }
            100% { transform: translateY(50%); opacity: 1; }
        }
    `;

    function wrapMatched(matches: any[], color: string): string {
        if (!matches.length) return '<span style="opacity: 0.5; margin-left: 4px;">none</span>';
        const vibrantColor = color === '#9c27b0' ? '#ff3d00' : color;
        const unique = Array.from(new Map(matches.map(m => [m.relPath, m])).values());
        const groups: Record<string, any[]> = {};
        unique.forEach(m => {
            const dir = m.relPath.includes('/') ? m.relPath.split('/').slice(0, -1).join('/') : './';
            if (!groups[dir]) groups[dir] = [];
            groups[dir].push(m);
        });

        const truncatePath = (p: string) => {
            if (p.length <= 35) return p;
            const parts = p.split('/');
            if (parts.length <= 2) return p;
            return `.../${parts.slice(-2).join('/')}`;
        };

            return Object.entries(groups).map(([dir, items]) => {
            const badgesHtml = items.map(m => `
                <span class="badge interactive ${m.isSpecificMatch ? '' : 'inactive'}" 
                      data-cmd="toggleBadgeManual" data-path="${esc(m.relPath)}" data-cur="${m.isExcluded}"
                      title="Item: ${m.relPath}\nStatus: ${m.reason}"
                      style="background: ${vibrantColor}cc; color: white; border: 1px solid ${vibrantColor}; font-size: 10px; padding: 2px 6px; cursor: pointer;">
                    ${m.name}
                </span>`).join('');
            return `
                <div class="matched-dir-card">
                    <div class="matched-dir-label">📁 ${truncatePath(dir)}</div>
                    <div class="matched-badges-row">${badgesHtml}</div>
                </div>`;
        }).join('');
    }

    const matchedDotFolders = wrapMatched(matchedDotFoldersArr.slice(0, 30), '#9c27b0');
    const matchedUnderscoreFolders = wrapMatched(matchedUnderscoreFoldersArr.slice(0, 30), '#9c27b0');
    const matchedDotFiles = wrapMatched(matchedDotFilesArr.slice(0, 30), '#9c27b0');
    const matchedUnderscoreFiles = wrapMatched(matchedUnderscoreFilesArr.slice(0, 30), '#9c27b0');

    function renderTree(items: TreeItem[]): string {
        return items.map(item => {
            const indent = item.depth * 12;
            const areaOn = options.isBulkExclusionEnabled;

            // Check if this is a directory
            const isDirectory = !item.isFile;

            // Note: FILES_ONLY filter is handled by JavaScript in the webview, not during server-side rendering
            const shouldHideItem = false; // Will be handled by client-side JavaScript

            let gitSlot = "", staSlot = "", dotSlot = "", manualSlot = "", userSlot = "";
            if (item.isGitMatch) {
                const isGitInactive = !areaOn || !item.isGit;
                gitSlot = `<span class="badge git interactive ${isGitInactive ? 'inactive' : ''}" data-rule-on="${!isGitInactive}">GIT</span>`;
            }
            if (item.isProfMatch || item.isDepMatch) {
                const isStaInactive = !areaOn || (!item.isProf && !item.isDep);
                staSlot = `<span class="badge sta interactive ${isStaInactive ? 'inactive' : ''}" data-rule-on="${!isStaInactive}">STA</span>`;
            }
            if (item.isDotMatch) {
                const isDotInactive = !areaOn || !item.isDot;
                dotSlot = `<span class="badge dot interactive ${isDotInactive ? 'inactive' : ''}" data-rule-on="${!isDotInactive}">DOT</span>`;
            }
            if (item.isManualMatch) {
                const isManualInactive = !areaOn || !item.isManual;
                manualSlot = `<span class="badge manual interactive ${isManualInactive ? 'inactive' : ''}" data-rule-on="${!isManualInactive}">MAN</span>`;
            }
            if (item.isUserEx) {
                userSlot = `<span class="badge user interactive" data-rule-on="true">EXC</span>`;
            } else if (item.isUserIn) {
                userSlot = `<span class="badge user interactive" data-rule-on="true">INC</span>`;
            }

            const showChildren = item.children.length > 0 && (!item.isExcluded || item.isExpanded);

            return `
                <div class="tree-row ${item.isExcluded ? 'excluded' : ''} ${isDirectory ? 'directory-row' : ''}" style="padding-left: ${indent}px;" onclick="vscode.postMessage({ command: 'revealPath', path: '${esc(item.relPath)}' })">
                    <div style="display: flex; align-items: center; gap: 4px; flex: 1; overflow: hidden;">
                        <input type="checkbox" ${item.isExcluded ? 'checked' : ''} onchange="event.stopPropagation(); toggleManual('${esc(item.relPath)}', this.checked)">
                        <span class="expansion-toggle" onclick="event.stopPropagation(); toggleExpansion('${esc(item.relPath)}')">
                            ${item.children.length > 0 ? `
                            <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s; ${item.isExpanded ? 'transform: rotate(90deg);' : ''}">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>` : ''}
                        </span>
                        <span style="opacity: 0.5; font-size: 10px;">${item.isFile ? '📄' : '📁'}</span>
                        <span class="tree-name ${item.isExcluded ? 'excluded' : ''}">${item.name}</span>
                        ${item.delta !== null && item.delta !== 0 ? `
                            <span style="margin-left: 8px; font-size: 10px; color: ${item.delta > 0 ? '#ff4d4d' : '#4caf50'}; opacity: 0.8; font-weight: 800; font-family: monospace;">
                                ${item.delta > 0 ? '+' : ''}${item.delta}L
                            </span>
                        ` : ''}
                    </div>
                    <div style="display: flex; gap: 4px; flex-shrink: 0; margin-left: auto; align-items: center; padding-right: 4px;">
                        <div class="badge-slot" style="width: 40px;">${userSlot}</div>
                        <div class="badge-slot" style="width: 40px;">${gitSlot}</div>
                        <div class="badge-slot" style="width: 40px;">${staSlot}</div>
                        <div class="badge-slot" style="width: 40px;">${dotSlot}</div>
                        <div class="badge-slot" style="width: 40px;">${manualSlot}</div>
                    </div>
                </div>
                ${showChildren ? `
                <div class="tree-children">
                    ${renderTree(item.children)}
                </div>
                ` : ''}
            `;
        }).join('');
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Code Count - Strategist View</title>
        <script>
            (function(){
                // Buffer for messages posted before acquireVsCodeApi is available
                window.__vscode_buffer = window.__vscode_buffer || [];

                // Safe stub runner buffer for early function calls
                window.__wcalls = window.__wcalls || [];

                // Create safe no-op stubs for functions that may be referenced inline before real definitions
                const stubNames = ['setTreeFilter','viewTree','toggleManual','toggleExpansion','toggleBadgeManual','confirmBulkSync','toggleGitignoreSource','uiToggle','generateGitignore','openStrategist'];
                stubNames.forEach(n => {
                    if (!window[n]) {
                        window[n] = function(){ window.__wcalls.push({ name: n, args: Array.from(arguments) }); };
                    }
                });

                // Wrap document.write to avoid fatal syntax errors from malformed injection
                try {
                    const originalWrite = document.write.bind(document);
                    document.write = function(s){
                        try {
                            return originalWrite(s);
                        } catch(e){
                            try { console.error('[WEBVIEW] document.write suppressed', e); } catch(_){ }
                            return undefined;
                        }
                    };
                } catch(e) { /* ignore */ }

                try {
                    // Attempt to acquire immediately; if not available, provide a proxy that buffers messages
                    var api = acquireVsCodeApi();
                    window.vscode = api;
                    if (window.__vscode_buffer.length && window.vscode && window.vscode.postMessage) {
                        window.__vscode_buffer.forEach(m => window.vscode.postMessage(m));
                        window.__vscode_buffer = [];
                    }
                } catch (e) {
                    window.vscode = {
                        postMessage: function(msg){ window.__vscode_buffer.push(msg); }
                    };
                    document.addEventListener('DOMContentLoaded', function(){
                        try {
                            var acquired = acquireVsCodeApi();
                            if (acquired) {
                                window.vscode = acquired;
                                if (window.__vscode_buffer && window.__vscode_buffer.length) {
                                    window.__vscode_buffer.forEach(m => window.vscode.postMessage(m));
                                    window.__vscode_buffer = [];
                                }
                                // Replay any buffered early function calls
                                try {
                                    if (window.__wcalls && window.__wcalls.length) {
                                        window.__wcalls.forEach(call => {
                                            try {
                                                const fn = window[call.name];
                                                if (typeof fn === 'function') fn.apply(null, call.args);
                                            } catch(_) {}
                                        });
                                        window.__wcalls = [];
                                    }
                                } catch(_) {}
                            }
                        } catch(e2) { /* ignore */ }
                    });
                }
            })();
        </script>
        <style>
            .badge-pulse { animation: badgePulse 0.4s ease-out; }
            @keyframes badgePulse {
                0% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.2); opacity: 0.7; }
                100% { transform: scale(1); opacity: 1; }
            }

            .scan-complete-bg {
                background: linear-gradient(135deg, rgba(0, 122, 204, 0.2) 0%, rgba(0, 122, 204, 0.05) 100%) !important;
                transition: background 1s cubic-bezier(0.4, 0, 0.2, 1);
            }

            .badge-complete {
                background: #007acc !important;
                color: white !important;
                box-shadow: 0 0 15px rgba(0, 122, 204, 0.6);
                transition: all 0.5s ease;
            }

            .pulse-action {
                animation: badgeClickPulse 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            @keyframes badgeClickPulse {
                0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(var(--badge-pulse-color), 0.7); }
                50% { transform: scale(1.15); box-shadow: 0 0 0 10px rgba(var(--badge-pulse-color), 0); }
                100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(var(--badge-pulse-color), 0); }
            }
${css}</style>
</head>
<body>
    <div class="main-gradient-bg" id="main-bg"></div>
    <div style="margin: 0 auto; max-width: 1200px; padding: 10px; background: #331111; color: #ffcccc; font-family: monospace; font-size: 11px; margin-bottom: 20px; border-radius: 4px; border: 1px solid #f00;">
        <b>DEBUG INFO:</b> 
        discoveryTree length: ${discoveryTree.length} | 
        totalTrackedFiles: ${totalTrackedFiles} | 
        hasAnalyzed: ${options.hasAnalyzed} | 
        isAnalyzing: ${options.isAnalyzing} |
        rootPath: ${safePath(root)} |
        lastDebugError: ${options.lastDebugError}
    </div>
    <div id="main-view-container" class="${options.hasAnalyzed ? 'just-scanned' : ''}" style="max-width: 1400px; margin: 0 auto; padding-bottom: 100px; border-radius: 12px; transition: all 0.5s ease;">
        <!-- Area ①: PROJECT CONTEXT -->
        <div class="area-container area-1" style="border-radius: 12px 12px 0 0; overflow: hidden; margin-bottom: 32px;">
            <div style="background: linear-gradient(180deg, rgba(26, 30, 46, 0.95) 0%, rgba(10, 10, 12, 0.98) 100%); padding: 32px 40px; border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 100; backdrop-filter: blur(20px);">
                <div style="display: flex; align-items: center; gap: 20px;">
                    <div class="pulsing-highlight" style="width: 54px; height: 54px; background: rgba(35, 209, 139, 0.1); border-radius: 14px; display: flex; align-items: center; justify-content: center; color: var(--accent); border: 1px solid rgba(35, 209, 139, 0.2); position: relative;">
                        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="scanner-pulse">
                            <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"></path>
                            <line x1="7" y1="12" x2="17" y2="12"></line>
                        </svg>
                    </div>
                    <div style="display: flex; flex-direction: column;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="font-size: 12px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1px;">STEP B</div>
                            ${safePath(root).toLowerCase().includes('/test-project-samples/') ? 
                              `<span class="badge" style="background: rgba(129, 212, 250, 0.15); color: #81d4fa; border: 1px solid rgba(129, 212, 250, 0.3); font-size: 9px; padding: 1px 6px; font-weight: 900;">DEMO MODE</span>` : ''}
                        </div>
                        <div style="font-size: 28px; font-weight: 950; color: #e1e1e3; line-height: 1.1; letter-spacing: -0.5px;">Strategist View</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="font-size: 11px; font-weight: 700; color: #666; text-transform: uppercase;">SCAN STATUS</div>
                            <div class="status-badge ${options.hasAnalyzed ? 'complete' : 'pending'}">
                                ${options.hasAnalyzed ? '<span style="width: 6px; height: 6px; background: #00d2ff; border-radius: 50%; box-shadow: 0 0 6px #00d2ff;"></span> COMPLETED' : 'PENDING'}
                            </div>
                        </div>
                        <div style="font-size: 11px; color: #555;">${options.baselineInfo?.timestamp ? 'Analyzed ' + new Date(options.baselineInfo.timestamp).toISOString() : 'Awaiting initialization'}</div>
                    </div>
                    <button class="btn-primary" onclick="vscode.postMessage({ command: 'refresh' })">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 5px;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.5 15.2a9 9 0 1 0 1.4-10.9z"></path></svg>
                        Refresh Scan
                    </button>
                    <button class="btn-primary" style="background: rgba(0, 210, 255, 0.1); color: #00d2ff; border-color: rgba(0, 210, 255, 0.3);" onclick="vscode.postMessage({ command: 'backDiscovery' })">
                        BACK
                    </button>
                </div>
            </div>
            <div style="padding: 24px;">
                <div class="card-header">
                    <div class="card-title">
                        <span class="step-num">1</span>
                        <span>PROJECT CONTEXT & DETECTION</span>
                    </div>
                </div>
                <div style="display: flex; gap: 24px; align-items: stretch; flex-wrap: wrap;">
                    <!-- Area Dashboard -->
                    <div style="flex: 1; min-width: 280px; padding: 16px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); display: flex; align-items: flex-start; gap: 16px; cursor: pointer;" onclick="vscode.postMessage({ command: 'revealPath', path: '' })">
                        <div style="color: #3794ef; opacity: 0.8;">
                             <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                 <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                              </svg>
                        </div>
                        <div style="overflow: hidden;">
                            <div style="display: flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 800; color: #c0a06c; text-transform: uppercase; margin-bottom: 2px; opacity: 0.8;">
                                📁 PROJECT ROOT
                            </div>
                            <div style="font-size: 20px; font-weight: 900; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px;">${path.basename(root)}</div>
                            <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
                                <div style="font-size: 13px; color: #007acc; opacity: 0.9; text-decoration: underline; cursor: pointer; display: flex; align-items: center; gap: 4px;" onclick="event.stopPropagation(); vscode.postMessage({ command: 'changePath' })" title="Change Root Directory">
                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                        <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM12 15l-4-4h8l-4 4z"/>
                                    </svg>
                                    CHANGE FOLDER
                                </div>
                            </div>
                            <div style="font-size: 11px; color: #555; margin-top: 6px; overflow: hidden; text-overflow: ellipsis;">${safePath(root)}</div>
                        </div>
                    </div>

                    <!-- Profile Info -->
                    <div style="flex: 1.5; min-width: 320px; padding: 16px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); display: flex; align-items: flex-start; gap: 16px;">
                        <div style="min-width: 48px;">
                             ${matchedProfile?.icon ? `<div style="font-size: 32px; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.05); border-radius: 6px;">${matchedProfile.icon}</div>` : `
                             <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                             </svg>`}
                        </div>
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: baseline; gap: 6px; margin-bottom: 2px;">
                                <div style="font-size: 11px; font-weight: 800; color: #ffb300; text-transform: uppercase; opacity: 0.8;">DETECTED PROFILE</div>
                                <div style="font-size: 11px; color: rgba(255,255,255,0.3);">&rarr; matched: ${matchedDetail || "standard"}</div>
                            </div>
                            <div style="font-size: 20px; font-weight: 900; color: #ffffff; letter-spacing: -0.2px; margin-bottom: 4px;">${matchedProfile?.name || "Generic"}</div>
                            <div style="font-size: 12px; color: rgba(255,255,255,0.5); font-style: italic; margin-bottom: 8px;">${matchedProfile?.logicFeatures || "Standard analysis rules applied"}</div>
                            
                            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                                <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; color: #c0a06c; text-transform: uppercase; cursor: pointer; border: 1px solid rgba(192,160,108,0.3); padding: 2px 8px; border-radius: 4px;" onclick="vscode.postMessage({ command: 'openConfig', reason: 'via', path: '${esc(matchedFile)}' })">
                                    ⚡ VIA: <span style="color: #3794ef; text-decoration: underline; text-transform: none;">${path.basename(matchedFile || "root")}</span>
                                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                                        <path d="M19 19H5V5h7V3H5c-1.1 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
                                    </svg>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; color: #ffb300; text-transform: uppercase; cursor: pointer; border: 1px solid rgba(255,179,0,0.3); padding: 2px 8px; border-radius: 4px;" onclick="vscode.postMessage({ command: 'openConfig', reason: 'prof', path: '${esc(matchedProfile?.sourceFile)}', query: '${esc(matchedProfile?.id)}' })">
                                    📜 DEF: <span style="color: #ffb300; text-decoration: underline; text-transform: none;">${matchedProfile?.sourceFile ? path.basename(matchedProfile.sourceFile) : "types.ts"}</span>
                                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                                        <path d="M19 19H5V5h7V3H5c-1.1 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="workflow-pipeline">
                <!-- Step 1 -->
                <div class="pipeline-step step-1" onclick="vscode.postMessage({ command: 'backDiscovery' })" style="cursor: pointer;">
                    <div class="step-num">1</div>
                    <div>
                        <div style="font-size: 11px; font-weight: 900; color: #4fc3f7; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">PHASE: PROJECT</div>
                        <div style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.6); line-height: 1.2;">Project Analysis.</div>
                    </div>
                </div>

                <div class="pipeline-arrow">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                </div>

                <!-- Step 2 -->
                <div class="pipeline-step step-2 active">
                    <div class="step-num">2</div>
                    <div>
                        <div style="font-size: 11px; font-weight: 900; color: var(--accent); margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">PHASE: AUTO</div>
                        <div style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.9); line-height: 1.2;">Bulk exclusion.</div>
                    </div>
                </div>
                
                <div class="pipeline-arrow">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                </svg>
            </div>

                <!-- Step 3 -->
                <div class="pipeline-step step-3">
                    <div class="step-num">3</div>
                    <div>
                        <div style="font-size: 11px; font-weight: 900; color: #23d18b; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">PHASE: TREE</div>
                        <div style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.6); line-height: 1.2;">Manual Refine.</div>
                    </div>
                </div>

                <div class="pipeline-arrow">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                </svg>
            </div>
                
                <!-- Step 4 -->
                <div class="pipeline-step step-4">
                    <div class="step-num">4</div>
                    <div>
                        <div style="font-size: 11px; font-weight: 900; color: #00d2ff; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">PHASE: REPORT</div>
                        <div style="font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.6); line-height: 1.2;">Results & Export.</div>
                    </div>
                </div>
            </div>

            <div style="display: flex; justify-content: center; margin: -16px 0 24px 0; opacity: 0.3;">
                <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M7 13l5 5 5-5M7 6l5 5 5-5"/>
                </svg>
            </div>

            <div class="area-container area-2" style="background: rgba(255,255,255,0.01); border-radius: 16px; margin: 16px; border: 1px solid var(--glass-border); overflow: hidden;">
            <div style="padding: 24px; border-bottom: 1px solid var(--glass-border); background: rgba(255,255,255,0.02);">
                <div class="card-header" style="margin-bottom: 0;">
                    <div class="card-title">
                        <span class="step-num">2</span>
                        <span>AUTOMATIC BULK EXCLUSION</span>
                    </div>
                </div>
            </div>
            <div style="padding: 24px;">
                <div style="font-size: 11px; opacity: 0.6; font-style: italic; margin-bottom: 24px;">
                    Automatically saved to <span class="clickable-label" style="color: #3794ef;" onclick="vscode.postMessage({ command: 'revealPath', path: '${esc(storagePath?.replace(/\\/g, '\\\\') || '')}' })">VS Code workspaceState</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 24px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span id="bulk-status-text" style="font-size: 14px; font-weight: 800; color: ${options.isBulkExclusionEnabled ? "var(--accent)" : "#999"};">
                            ${options.isBulkExclusionEnabled ? "ENABLED" : "DISABLED"}
                        </span>
                        <label class="switch">
                            <input type="checkbox" id="bulk-master-checkbox" ${options.isBulkExclusionEnabled ? "checked" : ""} onchange="confirmBulkSync(this.checked)">
                            <span class="slider"></span>
                        </label>
                        <span style="font-size: 10px; font-weight: 800; color: rgba(255,255,255,0.4); text-transform: uppercase; margin-left: -4px;">ENABLE ALL</span>
                    </div>
                </div>
                <div id="bulk-content-area" class="${options.isBulkExclusionEnabled ? "" : "disabled-area"}">
                    <div style="font-size: 14px; line-height: 1.6; opacity: 0.7; margin-bottom: 24px; padding: 16px; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
Automatic exclusion settings can be viewed in this section.  <br>Turning it off may increase the load To exclude individual folders and files, please use the tree view further down.
                        <ul style="margin: 12px 0; padding-left: 20px; font-size: 13px;">
                            <li style="margin-bottom: 4px;"><b>.gitignore SYNC RULES</b>: Individually toggle applicability of .gitignore files detected at all project levels.</li>
                            <li style="margin-bottom: 4px;"><b>STACK-LOGIC EXCLUSIONS</b>: Control stack-specific exclusions based on profile definitions.</li>
                            <li style="margin-bottom: 4px;"><b>DOT FOLDERS / FILES</b>: Control elements starting with . or _ category.</li>
                        </ul>
                    </div>

                    <!-- Gitignore Section -->
                    <div id="gitignore-card" class="logic-card ${(!options.isGitignoreEnabled && gitignoreData.length > 0) ? "disabled-area" : ""}" style="border-left: 2px solid #e51c23; ${gitignoreData.length === 0 ? 'background: rgba(229, 28, 35, 0.03);' : ''}">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <div style="font-weight: 800; font-size: 18px; color: #e51c23;">.GITIGNORE FILES</div>
                                <div style="font-size: 11px; opacity: 0.7; margin-top: 2px;">
                                    Exclude files based on .gitignore rules discovered in the project. 
                                    ${gitignoreData.length === 0 ? `
                                        <div style="margin-top: 6px; font-size: 10px; line-height: 1.4; opacity: 0.8; border-top: 1px solid rgba(229, 28, 35, 0.1); padding-top: 6px;">
                                            This tool identifies your stack and downloads the <b>official GitHub recommended template</b> for your project. 
                                            If offline, a basic structure is generated from the project profile.
                                        </div>
                                        <div style="margin-top: 8px; display: flex; align-items: center; gap: 10px;">
                                            <span style="color: #ffffff; background: #e51c23; padding: 1px 6px; border-radius: 3px; font-weight: 900; font-size: 10px; letter-spacing: 0.5px;">NOT FOUND</span>
                                            <button onclick="generateGitignore()" 
                                                    style="background: #e51c23; color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 10px; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: all 0.2s ease;"
                                                    onmouseover="this.style.filter='brightness(1.1)'; this.style.transform='translateY(-1px)'"
                                                    onmouseout="this.style.filter='none'; this.style.transform='none'">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                                                GENERATE .GITIGNORE
                                            </button>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px; ${gitignoreData.length === 0 ? 'opacity: 0.4; cursor: not-allowed;' : ''}">
                                <span style="font-size: 10px; font-weight: 800; color: #e51c23; opacity: 0.8; text-transform: uppercase;">ENABLE</span>
                                <label class="switch" style="width: 32px; height: 18px; ${gitignoreData.length === 0 ? 'pointer-events: none;' : ''}">
                                    <input type="checkbox" ${(options.isGitignoreEnabled && gitignoreData.length > 0) ? "checked" : ""} ${gitignoreData.length === 0 ? "disabled" : ""} onchange="uiToggle('gitignore-card', this.checked); vscode.postMessage({ command: 'toggleGitignore', value: this.checked })">
                                    <span class="slider git-red"></span>
                                </label>
                            </div>
                        </div>
                        <div id="gitignore-files-list" style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
                            ${gitignoreData.length > 0 ? gitignoreData.map(g => {
                                const actualGitPath = g.relPath === "." ? ".gitignore" : g.relPath + "/.gitignore";
                                const isSelfExcludedByDot = matchedDotFilesArr.some(m => m.relPath === actualGitPath && m.isExcluded);
                                const isToggleOn = !options.disabledGitignoreSources.includes(g.relPath) && options.isGitignoreEnabled;
                                
                                return `
                                <div class="logic-card-inner" style="${(isSelfExcludedByDot && isToggleOn) ? 'border: 1px solid rgba(255, 61, 0, 0.4); background: rgba(255, 61, 0, 0.05);' : ''} ${!isToggleOn ? 'opacity: 0.6;' : ''}">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <label class="switch" style="width: 28px; height: 16px;">
                                            <input type="checkbox" class="gitignore-child" ${isToggleOn ? "checked" : ""} onchange="toggleGitignoreSource('${esc(g.relPath)}', this.checked)">
                                            <span class="slider git-red" style="border-radius: 16px;"></span>
                                        </label>
                                        <span style="font-size: 14px; color: ${isToggleOn ? 'var(--accent)' : '#888'}; font-weight: 700; cursor: pointer; transition: color 0.2s;" onclick="vscode.postMessage({ command: 'revealPath', path: '${esc(g.relPath === '.' ? '.gitignore' : g.relPath + '/.gitignore')}' })">
                                            ${g.relPath === "." ? "Root .gitignore" : g.relPath + "/.gitignore"}
                                        </span>
                                        ${(isSelfExcludedByDot && isToggleOn) ? `
                                            <div style="margin-left: auto; display: flex; align-items: center; gap: 4px; color: #ff3d00; font-size: 10px; font-weight: 900; background: rgba(255,61,0,0.1); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255,61,0,0.2);">
                                                <span class="material-symbols-outlined" style="font-size: 14px;">warning</span>
                                                FILE EXCLUDED BY DOT-LOGIC
                                            </div>
                                        ` : ""}
                                    </div>
                                    <div class="rule-summary"><b>Rules:</b> ${g.summary}</div>
                                    ${(isSelfExcludedByDot && isToggleOn) ? `
                                        <div style="font-size: 10px; color: #ff3d00; opacity: 0.8; padding-left: 36px; margin-top: 4px; font-style: italic;">
                                            Note: This .gitignore file is currently ignored by the system because DOT-LOGIC is excluding it. Its rules will not be applied to other files.
                                        </div>
                                    ` : ""}
                                </div>`;
                            }).join("") : ""}
                        </div>
                    </div>

                    <!-- Stack Logic Section -->
                    <div id="stack-card" class="logic-card ${(options.isProfileExcludeEnabled || options.isDependencyExcludeEnabled) ? "" : "disabled-area"}" style="border-left: 2px solid #ff5722;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <div style="font-weight: 800; font-size: 18px; color: #ff5722;">STACK-LOGIC EXCLUSIONS</div>
                                <div style="font-size: 11px; opacity: 0.7; margin-top: 2px;">Exclude framework-specific folders (e.g., node_modules, build) based on the detected profile.</div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 10px; font-weight: 800; color: #ff5722; opacity: 0.8; text-transform: uppercase;">ENABLE</span>
                                <label class="switch" style="width: 32px; height: 18px;">
                                    <input type="checkbox" ${(options.isProfileExcludeEnabled || options.isDependencyExcludeEnabled) ? "checked" : ""} onchange="uiToggle('stack-card', this.checked, '#ff5722'); vscode.postMessage({ command: 'updateStackSync', active: this.checked })">
                                    <span class="slider deep-orange"></span>
                                </label>
                            </div>
                        </div>
                        <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 12px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <label class="switch" style="width: 28px; height: 16px;">
                                    <input type="checkbox" ${options.isProfileExcludeEnabled ? "checked" : ""} onchange="vscode.postMessage({ command: 'toggleProfileExclude', active: this.checked })">
                                    <span class="slider deep-orange" style="border-radius: 16px;"></span>
                                </label>
                                <span style="font-size: 12px; color: #ff5722; font-weight: 700;">ignoreFolders</span>
                                <div style="font-size: 11px; opacity: 0.6; margin-left: 8px; font-style: italic;">
                                    (${matchedProfile?.ignoreFolders?.join(", ") || "none"})
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <label class="switch" style="width: 28px; height: 16px;">
                                    <input type="checkbox" ${options.isDependencyExcludeEnabled ? "checked" : ""} onchange="vscode.postMessage({ command: 'toggleDependencyExclude', active: this.checked })">
                                    <span class="slider deep-orange" style="border-radius: 16px;"></span>
                                </label>
                                <span style="font-size: 12px; color: #ff5722; font-weight: 700;">dependencyFolders</span>
                                <div style="font-size: 11px; opacity: 0.6; margin-left: 8px; font-style: italic;">
                                    (node_modules, vendor, packages)
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Dot Logic Section -->
                    <div id="dot-card" class="logic-card ${Object.values(options.dotExclusions).some(v => v) ? "" : "disabled-area"}" style="border-left: 2px solid #ff3d00;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <div style="font-weight: 800; font-size: 18px; color: #ff3d00;">DOT-LOGIC EXCLUSIONS</div>
                                <div style="font-size: 11px; opacity: 0.6; margin-top: 2px;">Control elements starting with . or _ (hidden files and folders).</div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 10px; font-weight: 800; color: #ff3d00; opacity: 0.8; text-transform: uppercase;">ENABLE</span>
                                <label class="switch" style="width: 32px; height: 18px;">
                                    <input type="checkbox" ${Object.values(options.dotExclusions).some(v => v) ? "checked" : ""} onchange="uiToggle('dot-card', this.checked, '#ff3d00'); vscode.postMessage({ command: 'updateDotMasterSync', active: this.checked })">
                                    <span class="slider blood-orange"></span>
                                </label>
                            </div>
                        </div>
                        <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
                            <div style="font-size: 12px; font-weight: 900; color: #ff3d00; opacity: 0.9; margin-bottom: 6px; letter-spacing: 1px; border-bottom: 1px solid rgba(255, 61, 0, 0.3); padding-bottom: 2px; width: fit-content;">FOLDERS</div>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <label class="switch" style="width: 28px; height: 16px;">
                                    <input type="checkbox" ${options.dotExclusions.dotFold ? "checked" : ""} onchange="vscode.postMessage({ command: 'updateDotExclusion', key: 'dotFold', value: this.checked })">
                                    <span class="slider blood-orange" style="border-radius: 16px;"></span>
                                </label>
                                <span style="font-size: 11px; color: #ff3d00; font-weight: 800; width: 100px; flex-shrink: 0; letter-spacing: 0.5px; white-space: nowrap;">DOT ( . )</span>
                                <div style="flex: 1; display: flex; gap: 6px; flex-wrap: wrap;">${wrapMatched(matchedDotFoldersArr, '#ff3d00')}</div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <label class="switch" style="width: 28px; height: 16px;">
                                    <input type="checkbox" ${options.dotExclusions.underscoreFold ? "checked" : ""} onchange="vscode.postMessage({ command: 'updateDotExclusion', key: 'underscoreFold', value: this.checked })">
                                    <span class="slider blood-orange" style="border-radius: 16px;"></span>
                                </label>
                                <span style="font-size: 11px; color: #ff3d00; font-weight: 800; width: 100px; flex-shrink: 0; letter-spacing: 0.5px; white-space: nowrap;">UNDERSCORE ( _ )</span>
                                <div style="flex: 1; display: flex; gap: 6px; flex-wrap: wrap;">${wrapMatched(matchedUnderscoreFoldersArr, '#ff3d00')}</div>
                            </div>

                            <div style="font-size: 12px; font-weight: 900; color: #ff3d00; opacity: 0.9; margin: 16px 0 6px 0; letter-spacing: 1px; border-bottom: 1px solid rgba(255, 61, 0, 0.3); padding-bottom: 2px; width: fit-content;">FILES</div>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <label class="switch" style="width: 28px; height: 16px;">
                                    <input type="checkbox" ${options.dotExclusions.dotFile ? "checked" : ""} onchange="vscode.postMessage({ command: 'updateDotExclusion', key: 'dotFile', value: this.checked })">
                                    <span class="slider blood-orange" style="border-radius: 16px;"></span>
                                </label>
                                <span style="font-size: 11px; color: #ff3d00; font-weight: 800; width: 100px; flex-shrink: 0; letter-spacing: 0.5px; white-space: nowrap;">DOT ( . )</span>
                                <div style="flex: 1; display: flex; gap: 6px; flex-wrap: wrap;">${wrapMatched(matchedDotFilesArr, '#ff3d00')}</div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <label class="switch" style="width: 28px; height: 16px;">
                                    <input type="checkbox" ${options.dotExclusions.underscoreFile ? "checked" : ""} onchange="vscode.postMessage({ command: 'updateDotExclusion', key: 'underscoreFile', value: this.checked })">
                                    <span class="slider blood-orange" style="border-radius: 16px;"></span>
                                </label>
                                <span style="font-size: 11px; color: #ff3d00; font-weight: 800; width: 100px; flex-shrink: 0; letter-spacing: 0.5px; white-space: nowrap;">UNDERSCORE ( _ )</span>
                                <div style="flex: 1; display: flex; gap: 6px; flex-wrap: wrap;">${wrapMatched(matchedUnderscoreFilesArr, '#ff3d00')}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Manual Logic Section -->
                    <div id="manual-logic-card" class="logic-card ${options.isManualLogicEnabled ? "" : "disabled-area"}" style="border-left: 2px solid #00d2ff;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <div style="font-weight: 800; font-size: 18px; color: #00d2ff;">DEVELOP: CUSTOM CODE EXCLUSION RULES</div>
                                <div style="font-size: 11px; opacity: 0.6; margin-top: 2px;">Programmatically control exclusions by writing custom TypeScript code.</div>
                                <div style="font-size: 10px; opacity: 0.5; margin-top: 4px; font-style: italic;">Optional: Skip if you don't need custom logic.</div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 10px; font-weight: 800; color: #00d2ff; opacity: 0.8; text-transform: uppercase;">ENABLE</span>
                                <label class="switch" style="width: 32px; height: 18px;">
                                    <input type="checkbox" ${options.isManualLogicEnabled ? "checked" : ""} onchange="uiToggle('manual-logic-card', this.checked, '#00d2ff'); vscode.postMessage({ command: 'toggleManualLogic', active: this.checked })">
                                    <span class="slider" style="background-color: rgba(0, 210, 255, 0.3); border-radius: 16px;"></span>
                                </label>
                            </div>
                        </div>
                        <div style="margin-top: 12px; display: flex; flex-direction: column; gap: 8px;">
                            <div style="font-size: 11px; opacity: 0.7; font-style: italic; line-height: 1.4;">
                                Open <code>src/manual/custom-rules.ts</code> to define precise exclusion logic using the <code>DiscoveryNode</code> API.
                            </div>
                            <button class="btn-primary" style="background: rgba(0, 210, 255, 0.1); color: #00d2ff; border: 1px solid rgba(0, 210, 255, 0.3); padding: 8px 16px; font-size: 11px; margin-top: 4px; border-radius: 4px; cursor: pointer; text-transform: uppercase; font-weight: 800; display: flex; align-items: center; gap: 8px; width: fit-content;" onclick="vscode.postMessage({ command: 'openManual' })">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                    <path d="M14,2H6C4.9,2,4,2.9,4,4v16c0,1.1,0.9,2,2,2h12c1.1,0,2-0.9,2-2V8L14,2z M18,20H6V4h7v5h5V20z M15.1,13.6l-1.4-1.4l1.1-1.1 l1.4,1.4L15.1,13.6z M14.1,14.6L9,19.7V21h1.3l5.1-5.1L14.1,14.6z"/>
                                </svg>
                                <span>WRITE CUSTOM RULES / CODE</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div style="display: flex; flex-direction: column; align-items: center; margin: 40px 0;">
                <div style="font-size: 18px; font-weight: 900; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 1px;">
                    STEP 3: CHECK THE FILE TREE
                </div>
                <svg viewBox="0 0 24 24" width="60" height="60" fill="rgba(255,255,255,0.6)">
                    <path d="M7 13l5 5 5-5M7 6l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </div>

            <div class="area-container area-3" style="background: rgba(255,255,255,0.01); border-radius: 16px; margin: 16px; border: 1px solid var(--glass-border); overflow: hidden;">
            <div style="padding: 24px; border-bottom: 1px solid var(--glass-border); background: rgba(255,255,255,0.02);">
                <div class="card-header" style="margin-bottom: 0;">
                    <div class="card-title">
                        <span class="step-num">3</span>
                        <span>CHECK THE FILE TREE</span>
                    </div>
                    ${!options.hasAnalyzed ? `
                    <div style="background: #c0a06c; color: #000; font-size: 9px; font-weight: 900; padding: 2px 6px; border-radius: 4px; letter-spacing: 0.5px; align-self: center;">STRATEGIC PREVIEW</div>
                    ` : ""}
                </div>
                <div style="font-size: 13px; opacity: 0.7; padding: 0 16px; margin-bottom: 20px; line-height: 1.6; max-width: 600px;">
                    Review the results of automatic exclusions and ensure all key source files are correctly tracked. 
                    Use the interactive file tree below to perform manual overrides if needed.
                </div>

                <div id="progress-area" class="progress-container" style="padding: 24px; background: rgba(35, 209, 139, 0.03); border-radius: 12px; margin: 16px 0; border: 1px solid rgba(35, 209, 139, 0.1); position: relative; overflow: hidden; display: ${options.isAnalyzing ? 'block' : 'none'};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <div id="progress-status" style="font-size: 13px; color: #23d18b; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase;">Gathering Intelligence...</div>
                        <div id="progress-percent" style="font-size: 12px; color: #23d18b; font-weight: 900; opacity: 0.8;">0%</div>
                    </div>
                    <div style="height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; position: relative; box-shadow: inset 0 1px 3px rgba(0,0,0,0.4);">
                        <div id="main-progress-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #1e4d8a, #23d18b, #1e4d8a); background-size: 200% 100%; animation: shimmer 2s linear infinite; transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 10px rgba(35, 209, 139, 0.3);"></div>
                    </div>
                    <style>
                        @keyframes shimmer {
                            0% { background-position: 200% 0; }
                            100% { background-position: -200% 0; }
                        }
                    </style>
                </div>

                ${(discoveryTree.length > 0) ? `
                <div id="main-analysis-content" style="display: none;">
                    <!-- Statistics moved to area-4 -->
                </div>
                ` : `
                <div style="padding: 40px 20px; text-align: center; background: rgba(255,87,34,0.05); border-radius: 8px; border: 1px dashed rgba(255,87,34,0.3); margin-top: 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">📂</div>
                    <div style="font-weight: 800; font-size: 18px; color: #ff5722; margin-bottom: 8px;">Empty Discovery Tree</div>
                    <div style="font-size: 13px; opacity: 0.7; line-height: 1.6; max-width: 400px; margin: 0 auto; margin-bottom: 24px;">
                        No files were found in the project root. This might happen if the initial scan was blocked or skipped.
                    </div>
                    <button class="btn-primary" 
                            style="background: #ff5722; color: #fff; padding: 12px 32px; border: none; border-radius: 4px; font-weight: 800; cursor: pointer;"
                            onclick="vscode.postMessage({ command: 'startSetup' })">
                        START ANALYSIS
                    </button>
                    <div style="margin-top: 16px; font-size: 11px; opacity: 0.5;">
                        Root: ${safePath(root)}
                    </div>
                </div>
                `}
            </div>
        </div>
        
        <!-- Area 4: DISCOVERY TREE (moved outside area-3) -->
        <div class="area-container area-4" id="area-discovery" style="background: rgba(255,255,255,0.01); border-radius: 16px; margin: 16px; border: 1px solid var(--glass-border); overflow: hidden;">
            <div class="card-header">
                <div class="card-title">
                    <div class="step-num">4</div>
                    <span>DISCOVERY TREE</span>
                    <div class="status-badge complete">Ready</div>
                </div>
            </div>

            <div style="font-size: 13px; opacity: 0.8; font-style: italic; margin-bottom: 20px; color: #ccc; border-left: 2px solid rgba(0, 210, 255, 0.3); padding-left: 12px;">
               Review the results of automatic exclusions and ensure all key source files are correctly tracked. 
                    Use the interactive file tree below to perform manual overrides if needed.   
            
            Check items to manually exclude them from analysis. Uncheck to ensure they are counted.
            </div>

            <div class="tree-container" id="tree-root">
                <div class="tree-header">
                    <div style="display: flex; align-items: center; gap: 8px; justify-content: space-between;">
                        <div class="header-label">FILE SYSTEM</div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <button class="btn-primary" onclick="vscode.postMessage({ command: 'showReport' })"
                                    style="display: flex; align-items: center; gap: 8px; justify-content: center; background: rgba(0, 210, 255, 0.1); border-color: rgba(0, 210, 255, 0.3); color: #00d2ff; padding: 8px 16px; font-size: 11px; border-radius: 6px;">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4-5h-2V7h2v5zm4 3h-2v-2h2v2z"/>
                                </svg>
                                <span>REPORT VIEW</span>
                            </button>
                        </div>
                    </div>
                </div>
                <div style="padding-top: 10px;">
                    ${renderTree(decoratedTree)}
                </div>
            </div>
            
            <!-- Statistics Summary (moved from area-3) -->
            <div style="padding: 16px; background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-radius: 12px; margin-top: 16px; border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 6px 20px rgba(0,0,0,0.2); display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: center;">
                <div style="text-align: center;">
                    <div style="font-size: 9px; font-weight: 800; opacity: 0.5; letter-spacing: 0.5px; margin-bottom: 4px; text-transform: uppercase;">Tracked Intelligence</div>
                    <div style="font-size: 20px; font-weight: 950; color: #ffffff; text-shadow: 0 0 10px rgba(255,255,255,0.2);">${totalTrackedFiles}</div>
                    <div style="font-size: 8px; opacity: 0.4; font-weight: 700; margin-top: 2px;">ACTIVE FILES</div>
                </div>
                
                <div style="text-align: center;">
                    <div style="font-size: 9px; font-weight: 800; color: var(--accent); opacity: 0.7; letter-spacing: 0.5px; margin-bottom: 4px; text-transform: uppercase;">Counter-Intelligence</div>
                    <div style="font-size: 20px; font-weight: 950; color: var(--accent); text-shadow: 0 0 10px rgba(35, 209, 139, 0.2);">${ignoredFilesCount}</div>
                    <div style="display: flex; gap: 6px; font-size: 8px; opacity: 0.6; font-weight: 800; justify-content: center; margin-top: 2px;">
                        <span title="GIT ignored items">GIT: ${stats_gitIgnoredCount}</span>
                        <span title="Static assets / dependencies">STA: ${stats_profCount + stats_depCount}</span>
                        <span title="Hidden dot-files">DOT: ${stats_dotCount}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        var vscode = acquireVsCodeApi();
        window.updateBulkSync = (val) => vscode.postMessage({ command: 'updateBulkSync', active: val });
        window.confirmBulkSync = (val) => {
            if (!val) {
                vscode.postMessage({ command: 'confirmBulkDisable' });
            } else {
                updateBulkSync(val);
            }
        };
        window.toggleGitignoreSource = (p, v) => vscode.postMessage({ command: 'toggleGitignoreSource', relPath: p, value: v });
        window.toggleManual = (p, v) => vscode.postMessage({ command: 'toggleManual', path: p, value: v });
        
        window.viewTree = () => {
            const content = document.getElementById('main-analysis-content');
            if (content) {
                content.scrollIntoView({ behavior: 'smooth' });
            } else {
                const progress = document.querySelector('.progress-container');
                if (progress) {
                    progress.scrollIntoView({ behavior: 'smooth' });
                } else {
                    document.querySelector('.area-container.area-3')?.scrollIntoView({ behavior: 'smooth' });
                }
            }
        };
        window.toggleExpansion = (p) => vscode.postMessage({ command: 'toggleExpansion', path: p });
        window.toggleBadgeManual = (el, p, cur) => {
            const color = !cur ? '229, 28, 35' : '35, 209, 139'; // red if excluding, green if including
            el.style.setProperty('--badge-pulse-color', color);
            el.classList.remove('pulse-action');
            void el.offsetWidth; // trigger reflow
            el.classList.add('pulse-action');
            setTimeout(() => {
                vscode.postMessage({ command: 'toggleManual', path: p, value: !cur });
            }, 300);
        };
        window.generateGitignore = () => vscode.postMessage({ command: 'generateGitignore' });

        window.uiToggle = (id, active, color = '#23d18b') => {
            const el = document.getElementById(id);
            if (el) {
                if (active) {
                    el.classList.remove('disabled-area');
                    el.style.setProperty('--card-glow', color);
                    el.classList.add('activating');
                    setTimeout(() => el.classList.remove('activating'), 400);
                } else {
                    el.classList.add('disabled-area');
                }
            }
        };
        
        window.setTreeFilter = (filter) => {
            try { console.log('[WEBVIEW][STRATEGIST] setTreeFilter called', filter); } catch(e) {}
            const allTokens = document.querySelectorAll('.filter-token');
            const clickedToken = Array.from(allTokens).find(t => t.innerText.trim() === filter);
            if (clickedToken) {
                const parentSlot = clickedToken.closest('.col-filter-slot') || clickedToken;
                parentSlot.style.transition = 'transform 0.15s ease';
                parentSlot.style.transform = 'scale(0.9)';
                setTimeout(() => parentSlot.style.transform = 'scale(1)', 150);
            }
            const subTokens = Array.from(allTokens).filter(t => ['GIT', 'STA', 'DOT', 'MAN', 'USER'].includes(t.innerText.trim()));
            const scopedToken = Array.from(allTokens).find(t => t.innerText.trim() === 'SCOPED');

            if (filter === 'SCOPED') {
                const isActive = clickedToken && clickedToken.classList.contains('active');
                if (!isActive) {
                    allTokens.forEach(t => t.classList.remove('active'));
                    if (clickedToken) clickedToken.classList.add('active');
                } else {
                    subTokens.forEach(t => t.classList.add('active'));
                    if (clickedToken) clickedToken.classList.remove('active');
                }
            } else if (filter === 'FILES_ONLY') {
                // Toggle FILES ONLY filter
                const filesOnlyBtn = document.querySelector('[onclick*="toggleFilesOnlyFilter"]');
                const isActive = filesOnlyBtn && filesOnlyBtn.classList.contains('active');
                
                if (isActive) {
                    // Show all items
                    document.querySelectorAll('.directory-row').forEach(row => {
                        row.style.display = 'flex';
                    });
                    filesOnlyBtn.classList.remove('active');
                    filesOnlyBtn.style.background = 'rgba(255,255,255,0.1)';
                } else {
                    // Show only files (not directories)
                    document.querySelectorAll('.directory-row').forEach(row => {
                        row.style.display = 'none';
                    });
                    filesOnlyBtn.classList.add('active');
                    filesOnlyBtn.style.background = 'var(--accent)';
                }
            } else {
                if (clickedToken) {
                    clickedToken.classList.toggle('active');
                }
                
                // Synchronization Logic:
                const anySubActive = subTokens.some(t => t.classList.contains('active'));
                if (!anySubActive) {
                    // All sub-filters OFF -> Auto-ON SCOPED
                    if (scopedToken) scopedToken.classList.add('active');
                } else {
                    // Some sub-filter ON -> Ensure SCOPED is OFF
                    if (scopedToken) scopedToken.classList.remove('active');
                }
            }

            const activeFilters = Array.from(allTokens)
                .filter(t => t.classList.contains('active'))
                .map(t => t.innerText.trim());

            document.querySelectorAll('.tree-row').forEach(row => {
                const badges = Array.from(row.querySelectorAll('.badge'));
                const originalBadges = badges.filter(b => ['git', 'sta', 'dot', 'man', 'user'].some(cls => b.classList.contains(cls)));
                
                // 1. Sync badge visual state with filters
                badges.forEach(badge => {
                    const isRuleOn = badge.dataset.ruleOn === 'true';
                    if (badge.classList.contains('git')) {
                        (activeFilters.includes('GIT') && isRuleOn) ? badge.classList.remove('inactive') : badge.classList.add('inactive');
                    } else if (badge.classList.contains('sta')) {
                        (activeFilters.includes('STA') && isRuleOn) ? badge.classList.remove('inactive') : badge.classList.add('inactive');
                    } else if (badge.classList.contains('dot')) {
                        (activeFilters.includes('DOT') && isRuleOn) ? badge.classList.remove('inactive') : badge.classList.add('inactive');
                    } else if (badge.classList.contains('man')) {
                        (activeFilters.includes('MAN') && isRuleOn) ? badge.classList.remove('inactive') : badge.classList.add('inactive');
                    } else if (badge.classList.contains('user')) {
                        (activeFilters.includes('USER') && isRuleOn) ? badge.classList.remove('inactive') : badge.classList.add('inactive');
                    }
                });

                // 2. Logic Check
                const hasActiveExclusionBadge = badges.some(b => 
                    !b.classList.contains('inactive') && 
                    ['git', 'sta', 'dot', 'man'].some(cls => b.classList.contains(cls))
                );
                
                const hasInclusionOverride = badges.some(b => 
                    b.classList.contains('user') && 
                    !b.classList.contains('inactive') && 
                    b.innerText === 'INC'
                );

                const isExcludedCompletely = badges.length > 0 && 
                    ['git', 'sta', 'dot', 'man'].some(cls => badges.some(b => b.classList.contains(cls))) &&
                    !hasInclusionOverride;

                // When SCOPED is active, hide anything that is excluded.
                const show = activeFilters.includes('SCOPED') ? !isExcludedCompletely : true;
                
                // But wait, if someone clicks a filter specifically for an exclusion type, they WANT to see it.
                // Re-adjust:
                let finalShow = show;
                if (activeFilters.includes('SCOPED')) {
                    // If SCOPED is ON, but I also turned ON 'GIT' filter, I should see GIT-excluded files.
                    if (badges.some(b => b.classList.contains('git') && activeFilters.includes('GIT'))) finalShow = true;
                    if (badges.some(b => b.classList.contains('sta') && activeFilters.includes('STA'))) finalShow = true;
                    if (badges.some(b => b.classList.contains('dot') && activeFilters.includes('DOT'))) finalShow = true;
                    if (badges.some(b => b.classList.contains('man') && activeFilters.includes('MAN'))) finalShow = true;
                    if (badges.some(b => b.classList.contains('user') && activeFilters.includes('USER'))) finalShow = true;
                }

                // Skip FILES_ONLY filter logic for other filters
                if (!activeFilters.includes('FILES_ONLY')) {
                    row.style.display = finalShow ? 'flex' : 'none';
                }
            });
        };

        function triggerScanCompleteEffects() {
            const container = document.querySelector('.container');
            if (container) {
                container.classList.add('scan-complete-bg');
                setTimeout(() => container.classList.remove('scan-complete-bg'), 3000);
            }

            const badges = document.querySelectorAll('.badge');
            badges.forEach(badge => {
                badge.classList.add('badge-complete', 'badge-pulse');
                setTimeout(() => {
                    badge.classList.remove('badge-complete', 'badge-pulse');
                }, 3000);
            });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'discoveryUpdate') {
                const bar = document.getElementById('main-progress-bar');
                if (bar) bar.style.width = message.percent + '%';
                const percentText = document.getElementById('progress-percent');
                if (percentText) percentText.innerText = Math.round(message.percent) + '%';
                
                const statusText = document.getElementById('progress-status');
                if (statusText && message.status === 'FINISHED') {
                    statusText.innerText = 'INTELLIGENCE ACQUIRED';
                    statusText.style.color = '#fff';
                    
                    const bg = document.querySelector('.main-gradient-bg');
                    if (bg) {
                        bg.classList.add('scan-finish');
                        setTimeout(() => bg.classList.remove('scan-finish'), 2000);
                    }
                    
                    const tree = document.getElementById('tree-root');
                    if (tree) {
                        tree.style.transition = 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)';
                        tree.style.boxShadow = '0 0 40px rgba(35, 209, 139, 0.3)';
                        tree.style.borderColor = 'rgba(35, 209, 139, 0.4)';
                        setTimeout(() => {
                            tree.style.boxShadow = '';
                            tree.style.borderColor = '';
                        }, 2500);
                    }
                    
                    const progressArea = document.getElementById('progress-area');
                    if (progressArea) {
                        setTimeout(() => {
                            progressArea.style.transition = 'all 1s ease';
                            progressArea.style.opacity = '0';
                            progressArea.style.height = '0';
                            progressArea.style.margin = '0';
                            progressArea.style.padding = '0';
                            setTimeout(() => progressArea.style.display = 'none', 1000);
                        }, 3000);
                    }
                }
            }
            if (message.command === 'analysisStart') {
                const progressArea = document.getElementById('progress-area');
                if (progressArea) {
                    progressArea.style.display = 'block';
                    progressArea.style.opacity = '1';
                    progressArea.style.height = 'auto';
                    progressArea.style.margin = '16px 0';
                    progressArea.style.padding = '24px';
                }
            }
        });

        // Message handler for extension responses
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'revertBulkSwitch':
                    document.getElementById('bulk-master-checkbox').checked = true;
                    break;
            }
        });
        
        // Convert inline handlers to data-* attributes and attach delegated listeners
        document.addEventListener('DOMContentLoaded', function() {
            try {
                document.querySelectorAll('[onclick]').forEach(el => {
                    const code = el.getAttribute('onclick') || '';
                    let m = code.match(/vscode\.postMessage\(\s*\{\s*command:\s*'([^']+)'([\s\S]*?)\}\s*\)/);
                    if (m) {
                        el.dataset.cmd = m[1];
                        const props = m[2] || '';
                        props.replace(/([a-zA-Z0-9_]+)\s*:\s*'([^']*)'/g, function(_, k, v) { el.dataset[k] = v; return ''; });
                        props.replace(/([a-zA-Z0-9_]+)\s*:\s*(true|false)/g, function(_, k, v) { el.dataset[k] = v; return ''; });
                        el.removeAttribute('onclick');
                        return;
                    }
                    m = code.match(/toggleBadgeManual\(\s*this\s*,\s*'([^']*)'\s*,\s*(true|false)\s*\)/);
                    if (m) { el.dataset.cmd = 'toggleBadgeManual'; el.dataset.path = m[1]; el.dataset.cur = m[2]; el.removeAttribute('onclick'); return; }
                    m = code.match(/toggleExpansion\(\s*'([^']*)'\s*\)/);
                    if (m) { el.dataset.cmd = 'toggleExpansion'; el.dataset.path = m[1]; el.removeAttribute('onclick'); return; }
                    m = code.match(/setTreeFilter\(\s*'([^']*)'\s*\)/);
                    if (m) { el.dataset.cmd = 'setTreeFilter'; el.dataset.filter = m[1]; el.removeAttribute('onclick'); return; }
                    m = code.match(/viewTree\(\s*\)/);
                    if (m) { el.dataset.cmd = 'viewTree'; el.removeAttribute('onclick'); return; }
                });

                document.addEventListener('click', function(e) {
                    const btn = e.target && e.target.closest ? e.target.closest('[data-cmd]') : null;
                    if (!btn) return;
                    e.preventDefault();
                    const cmd = btn.dataset.cmd;
                    try { console.log('[WEBVIEW][STRATEGIST] delegate click', cmd, btn.dataset); } catch(e) {}
                    switch (cmd) {
                        case 'showReport':
                        case 'refresh':
                        case 'captureBaseline':
                        case 'collapseAll':
                        case 'generateGitignore':
                        case 'openManual':
                        case 'openStrategist':
                            window.vscode.postMessage({ command: cmd });
                            break;
                        case 'revealPath':
                            window.vscode.postMessage({ command: 'revealPath', path: btn.dataset.path || '' });
                            break;
                        case 'openConfig':
                            window.vscode.postMessage({ command: 'openConfig', reason: btn.dataset.reason, path: btn.dataset.path, query: btn.dataset.query });
                            break;
                        case 'toggleBadgeManual':
                            window.toggleBadgeManual(btn, btn.dataset.path, btn.dataset.cur === 'true');
                            break;
                        case 'toggleExpansion':
                            window.toggleExpansion(btn.dataset.path);
                            break;
                        case 'setTreeFilter':
                            setTreeFilter(btn.dataset.filter);
                            break;
                        case 'viewTree':
                            try { console.log('[WEBVIEW][STRATEGIST] invoke viewTree'); } catch(e) {}
                            viewTree();
                            break;
                        default:
                            if (window[cmd] && typeof window[cmd] === 'function') {
                                try { console.log('[WEBVIEW][STRATEGIST] invoking function', cmd); } catch(e) {}
                                window[cmd](btn);
                            } else {
                                console.warn('Unhandled cmd', cmd);
                            }
                    }
                }, true);

                document.addEventListener('change', function(e) {
                    const el = e.target;
                    if (!el) return;
                    const cmd = el.dataset.changeCmd || el.dataset.cmd;
                    if (!cmd) return;
                    if (cmd === 'confirmBulkSync') confirmBulkSync(el.checked);
                    else if (cmd === 'toggleGitignoreSource') toggleGitignoreSource(el.dataset.path, el.checked);
                    else if (cmd === 'toggleManual') toggleManual(el.dataset.path, el.checked);
                    else if (window[cmd] && typeof window[cmd] === 'function') window[cmd](el);
                }, true);
            } catch (e) {
                console.warn('Delegate init failed', e);
            }
        });
    </script>
</body>
</html>`;
}

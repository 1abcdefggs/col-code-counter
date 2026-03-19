import { getAnalysisReportHtml, FileReportEntry } from '../src/variants/analysis-report-view';
import { getStrategistViewHtml } from '../src/variants/strategist-view';
import * as fs from 'fs';
import { DiscoveryNode } from '../src/discovery-types';

const mockFiles: FileReportEntry[] = [
    { relPath: 'src/extension.ts', totalLines: 500, codeLines: 400, commentLines: 50, blankLines: 50 },
    { relPath: 'src/utils.ts', totalLines: 200, codeLines: 150, commentLines: 30, blankLines: 20 }
];

const mockDiscoveryTree: DiscoveryNode[] = [
    {
        name: 'src',
        relPath: 'src',
        isDir: true,
        children: [
            { name: 'extension.ts', relPath: 'src/extension.ts', isDir: false, children: [] },
            { name: 'utils.ts', relPath: 'src/utils.ts', isDir: false, children: [] }
        ]
    }
];

const options = {
    isGitignoreEnabled: true,
    isProfileExcludeEnabled: true,
    isDependencyExcludeEnabled: true,
    dotExclusions: { dotFold: true, dotFile: true, underscoreFold: true, underscoreFile: true },
    isBulkExclusionEnabled: true,
    disabledGitignoreSources: [],
    manualExclusions: [],
    manualInclusions: [],
    expandedPaths: ['src'],
    hasAnalyzed: true,
    isAutoAnalyzerEnabled: false,
    isAnalyzing: false,
    isManualLogicEnabled: true,
    getDelta: (path: string, lines: number) => 0
};

const profileInfo = {
    matchedProfile: { 
        name: 'React', 
        ignoreFolders: ['node_modules'],
        sourceFile: 'profiles/react.ts',
        id: 'react-std',
        logicFeatures: 'React + Vite project detection'
    },
    matchedDetail: 'Vite',
    matchedFile: 'package.json'
};

try {
    const reportHtml = getAnalysisReportHtml('root', mockFiles, 'Code Count Project', 200);
    const strategistHtml = getStrategistViewHtml('root', mockDiscoveryTree, null, profileInfo, [], options);

    fs.writeFileSync('report_preview.html', reportHtml);
    fs.writeFileSync('strategist_preview.html', strategistHtml);
    console.log('HTML previews generated: report_preview.html, strategist_preview.html');
} catch (e) {
    console.error('Error generating HTML:', e);
}

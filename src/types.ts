import * as vscode from 'vscode';

export interface CodeCountResult {
    fileCount: number;
    totalLines: number;
    codeLines: number;
    commentLines: number;
    blankLines: number;
    files: FileInfo[];
    timestamp: string;
}

export interface FileInfo {
    path: string;
    extension: string;
    total: number;
    code: number;
    comment: number;
    blank: number;
    imports?: { active: number; inactive: number };
    chars?: {
        code: number;
        comment: number;
        total: number;
    };
}

export interface TreeDataNode {
    label: string;
    path: string;
    type: 'file' | 'folder';
    depth: number;
    total: number;
    code: number;
    comment: number;
    blank: number;
    children?: TreeDataNode[];
}

export interface CodeCacheEntry {
    mtimeMs: number;
    lines: number;
    imports: { active: number; inactive: number };
    codeChars: number;
    commentChars: number;
    totalChars: number;
    codeLines: number;
    commentLines: number;
    blankLines: number;
}

export interface CodeCache {
    [filePath: string]: CodeCacheEntry;
}

export interface CodeCountSnapshot {
    timestamp: number;
    files: Record<string, number>; // relativePath -> string
}

export type WelcomeState = "setup-discovery" | "setup-filter" | "report" | "setup-preview";


import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import ignore = require('ignore');

export class GitignoreManager {
    private _rootPath: string;
    private _ignores: Map<string, any> = new Map(); // path -> ignore instance
    private _disabledSources: Set<string> = new Set();

    constructor(rootPath: string) {
        this._rootPath = rootPath;
        this.loadRoot();
    }

    public setDisabledSources(disabled: Set<string>) {
        this._disabledSources = disabled;
    }

    public getAllSources(): string[] {
        return Array.from(this._ignores.keys());
    }

    /**
     * Loads the root .gitignore.
     */
    private loadRoot() {
        const gp = path.join(this._rootPath, '.gitignore');
        if (fs.existsSync(gp)) {
            this.addGitignore(this._rootPath);
        }
    }

    /**
     * Adds a .gitignore file from a specific directory.
     */
    public addGitignore(dirPath: string) {
        try {
            const gp = path.join(dirPath, '.gitignore');
            if (fs.existsSync(gp)) {
                const content = fs.readFileSync(gp, 'utf8');
                const ig = ignore();
                ig.add(content);
                // ALWAYS ignore .git folder by default to avoid performance issues
                if (dirPath === this._rootPath) {
                    ig.add(['.git/', '.git/**']);
                }
                // Normalize to forward slashes for internal consistency
                let relDir = path.relative(this._rootPath, dirPath).replace(/\\/g, '/') || '.';
                this._ignores.set(relDir, ig);
            }
        } catch (err) {
            console.error('Failed to read .gitignore:', err);
        }
    }

    /**
     * Determines the source .gitignore that ignored the path, if any.
     */
    public getIgnoringSource(relativePath: string): string | null {
        // Normalize input path to forward slashes
        const normalizedPath = relativePath.replace(/\\/g, '/');
        const parts = normalizedPath.split('/');
        
        for (let i = parts.length - 1; i >= -1; i--) {
            const currentDir = i === -1 ? '.' : parts.slice(0, i + 1).join('/');
            
            // Check if this source is disabled. 
            // We also check against empty string and normalized versions to be safe.
            if (this._disabledSources.has(currentDir)) continue;
            
            const ig = this._ignores.get(currentDir);
            if (ig) {
                const pathInDir = i === -1 ? normalizedPath : parts.slice(i + 1).join('/');
                if (pathInDir && ig.ignores(pathInDir)) {
                    return currentDir;
                }
            }
        }
        
        return null;
    }

    /**
     * Determines the source .gitignore that ignored the path, REGARDLESS of whether it is disabled.
     */
    public getIgnoringSourceRaw(relativePath: string): string | null {
        const normalizedPath = relativePath.replace(/\\/g, '/');
        const parts = normalizedPath.split('/');
        
        for (let i = parts.length - 1; i >= -1; i--) {
            const currentDir = i === -1 ? '.' : parts.slice(0, i + 1).join('/');
            const ig = this._ignores.get(currentDir);
            if (ig) {
                const pathInDir = i === -1 ? normalizedPath : parts.slice(i + 1).join('/');
                if (pathInDir && ig.ignores(pathInDir)) {
                    return currentDir;
                }
            }
        }
        return null;
    }

    /**
     * Determines the line number in the .gitignore file that ignored the path.
     */
    public findRuleLine(sourceDir: string, relativePathToTest: string): number {
        try {
            const gp = path.join(this._rootPath, sourceDir, '.gitignore');
            if (fs.existsSync(gp)) {
                const content = fs.readFileSync(gp, 'utf8');
                const lines = content.split('\n');
                
                const igTest = ignore();
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line || line.startsWith('#')) continue;
                    igTest.add(line);
                    
                    // pathRelSource is the test path relative to the gitignore location
                    const fullTestPath = path.join(this._rootPath, relativePathToTest);
                    const fullSourceDir = path.join(this._rootPath, sourceDir);
                    const pathRelSource = path.relative(fullSourceDir, fullTestPath).replace(/\\/g, '/');
                    
                    if (igTest.ignores(pathRelSource)) {
                        return i + 1;
                    }
                }
            }
        } catch (e) {
            console.error('Failed to find rule line:', e);
        }
        return 1; // Fallback to line 1
    }

    /**
     * Determines if a path should be ignored.
     */
    public isIgnored(relativePath: string): boolean {
        return this.getIgnoringSource(relativePath) !== null;
    }

    /**
     * Determines if a path is ignored by any source, REGARDLESS of whether that source is disabled.
     * Useful for UI badges that should stay visible but dim.
     */
    public isIgnoredRaw(relativePath: string): boolean {
        const normalizedPath = relativePath.replace(/\\/g, '/');
        const parts = normalizedPath.split('/');
        
        for (let i = parts.length - 1; i >= -1; i--) {
            const currentDir = i === -1 ? '.' : parts.slice(0, i + 1).join('/');
            const ig = this._ignores.get(currentDir);
            if (ig) {
                const pathInDir = i === -1 ? normalizedPath : parts.slice(i + 1).join('/');
                if (pathInDir && ig.ignores(pathInDir)) {
                    return true;
                }
            }
        }
        return false;
    }

    public exists(): boolean {
        return this._ignores.has('.');
    }
}

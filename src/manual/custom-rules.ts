/**
 * Code Count: Custom Exclusion Rules
 * 
 * Edit this file to add your own programmatic exclusion logic.
 * The logic here will be applied during the initial scan (Step A)
 * and whenever you refresh the view.
 * 
 * Instructions:
 * 1. Modify the `shouldExclude` function.
 * 2. Return `true` to exclude a file/folder, `false` to keep it.
 * 3. Save this file to apply changes (may require a refresh in the extension UI).
 */

/**
 * @param path The relative path of the file or folder (e.g., "src/test/data")
 * @param isDir True if the path is a directory, false if it is a file.
 * @returns boolean
 */
export function shouldExclude(path: string, isDir: boolean): boolean {
    // --- SAMPLE RULES (Uncomment to enable) ---

    // 1. EXTENSION PRESET: Exclude heavy media/binary files
    // const mediaExts = ['.png', '.jpg', '.jpeg', '.gif', '.mp4', '.mov', '.pdf', '.zip'];
    // if (!isDir && mediaExts.some(ext => path.toLowerCase().endsWith(ext))) return true;

    // 2. FOLDER PRESET: Exclude common build/output directories
    // const buildFolders = ['/dist/', '/build/', '/out/', '/target/'];
    // if (isDir && buildFolders.some(folder => path.includes(folder) || path.endsWith(folder.replace(/\//g, '')))) return true;

    // 3. WILDCARD PATTERN: Exclude all .log and .tmp files anywhere
    // if (path.match(/\.(log|tmp)$/i)) return true;

    // 4. SIZE LIMIT (Advanced): Exclude files larger than 5MB
    // if (!isDir) {
    //     try {
    //         const fs = require('fs');
    //         const stats = fs.statSync(path);
    //         if (stats.size > 5 * 1024 * 1024) return true;
    //     } catch (e) {}
    // }

    return false;
}

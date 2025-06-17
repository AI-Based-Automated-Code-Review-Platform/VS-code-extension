import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { DEFAULT_IGNORE_PATTERNS } from '../utils/constants';
import { GitignoreParser } from '../utils/gitignoreParser';
import { GitService } from './gitService';

export interface FileContent {
    [filePath: string]: string;
}

export interface ReviewFiles {
    files: FileContent;
    diffString: string;
    totalFiles: number;
    totalSize: number;
}

export class FileService {
    private defaultIgnorePatterns = DEFAULT_IGNORE_PATTERNS;
    private static readonly MAX_FILE_SIZE = 1024 * 1024; // 1MB per file
    private static readonly MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB total
    private static readonly MAX_FILES = 100;

    private static readonly SUPPORTED_EXTENSIONS = [
        '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.php',
        '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.clj', '.hs', '.ml',
        '.r', '.m', '.pl', '.sh', '.ps1', '.bat', '.sql', '.html', '.css',
        '.scss', '.sass', '.less', '.vue', '.svelte', '.json', '.xml', '.yaml',
        '.yml', '.toml', '.ini', '.cfg', '.conf', '.md', '.txt', '.dockerfile',
        '.makefile', '.cmake', '.gradle', '.maven', '.sbt'
    ];

    private static readonly BINARY_EXTENSIONS = [
        '.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.db', '.sqlite',
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.ico', '.webp',
        '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.wav', '.ogg',
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'
    ];

    async getFilesForReview(workspaceRoot: string): Promise<Record<string, string>> {
        const ignorePatterns = await this.getIgnorePatterns(workspaceRoot);
        const files: Record<string, string> = {};

        await this.walkDirectory(workspaceRoot, workspaceRoot, files, ignorePatterns);
        return files;
    }

    private async getIgnorePatterns(workspaceRoot: string): Promise<string[]> {
        const gitignorePath = path.join(workspaceRoot, '.gitignore');
        let patterns = [...this.defaultIgnorePatterns];

        try {
            if (fs.existsSync(gitignorePath)) {
                const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
                const gitignorePatterns = gitignoreContent
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#') && line !== '/');
                
                patterns = [...patterns, ...gitignorePatterns];
            }
        } catch (error) {
            console.warn('Could not read .gitignore file:', error);
        }

        return patterns;
    }

    private async walkDirectory(
        currentPath: string,
        rootPath: string,
        files: Record<string, string>,
        ignorePatterns: string[]
    ): Promise<void> {
        try {
            const items = fs.readdirSync(currentPath);

            for (const item of items) {
                const fullPath = path.join(currentPath, item);
                const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');

                if (this.shouldIgnore(relativePath, ignorePatterns)) {
                    continue;
                }

                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    await this.walkDirectory(fullPath, rootPath, files, ignorePatterns);
                } else if (stat.isFile()) {
                    try {
                        // Only read text files
                        if (this.isTextFile(fullPath)) {
                            const content = fs.readFileSync(fullPath, 'utf8');
                            files[relativePath] = content;
                        }
                    } catch (error) {
                        // Skip files that can't be read as text
                        console.warn(`Could not read file ${relativePath}:`, error);
                    }
                }
            }
        } catch (error) {
            console.warn(`Could not read directory ${currentPath}:`, error);
        }
    }

    private shouldIgnore(filePath: string, patterns: string[]): boolean {
        return patterns.some(pattern => {
            if (pattern.endsWith('/')) {
                // Directory pattern
                const dirPattern = pattern.slice(0, -1);
                return filePath === dirPattern || filePath.startsWith(dirPattern + '/');
            } else if (pattern.startsWith('**/')) {
                // Global pattern
                const globalPattern = pattern.slice(3);
                return minimatch(path.basename(filePath), globalPattern) || 
                       filePath.split('/').some(part => minimatch(part, globalPattern));
            } else {
                // File pattern
                return minimatch(filePath, pattern) || minimatch(path.basename(filePath), pattern);
            }
        });
    }

    private isTextFile(filePath: string): boolean {
        const textExtensions = [
            '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
            '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.clj',
            '.html', '.css', '.scss', '.sass', '.less', '.xml', '.json', '.yaml', '.yml',
            '.md', '.txt', '.sql', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat',
            '.dockerfile', '.gitignore', '.gitattributes', '.editorconfig', '.env'
        ];

        const ext = path.extname(filePath).toLowerCase();
        if (textExtensions.includes(ext)) {
            return true;
        }

        // Check for files without extensions that are typically text
        const basename = path.basename(filePath).toLowerCase();
        const textFiles = ['dockerfile', 'makefile', 'rakefile', 'gemfile', 'procfile'];
        if (textFiles.includes(basename)) {
            return true;
        }

        return false;
    }

    async getChangedFiles(workspaceRoot: string): Promise<string[]> {
        // This would integrate with git service to get only changed files
        // For now, return all files
        const files = await this.getFilesForReview(workspaceRoot);
        return Object.keys(files);
    }

    public static async getReviewFiles(workspaceFolder: vscode.WorkspaceFolder): Promise<ReviewFiles> {
        const rootPath = workspaceFolder.uri.fsPath;
        const gitignoreParser = GitignoreParser.parseGitignoreFiles(rootPath);
        
        const files: FileContent = {};
        let totalSize = 0;
        let fileCount = 0;

        // Get all files recursively
        const allFiles = await this.getAllFiles(rootPath);
        
        for (const filePath of allFiles) {
            if (fileCount >= this.MAX_FILES) {
                vscode.window.showWarningMessage(`Maximum file limit (${this.MAX_FILES}) reached. Some files were skipped.`);
                break;
            }

            const relativePath = path.relative(rootPath, filePath);
            const normalizedPath = relativePath.replace(/\\/g, '/');

            // Skip if ignored by .gitignore
            if (gitignoreParser.shouldIgnore(normalizedPath)) {
                continue;
            }

            // Skip if not a supported file type
            if (!this.isSupportedFile(filePath)) {
                continue;
            }

            // Skip if file is too large
            const stats = fs.statSync(filePath);
            if (stats.size > this.MAX_FILE_SIZE) {
                console.log(`Skipping large file: ${normalizedPath} (${stats.size} bytes)`);
                continue;
            }

            // Check total size limit
            if (totalSize + stats.size > this.MAX_TOTAL_SIZE) {
                vscode.window.showWarningMessage(`Maximum total size limit (${this.MAX_TOTAL_SIZE / 1024 / 1024}MB) reached. Some files were skipped.`);
                break;
            }

            try {
                const content = fs.readFileSync(filePath, 'utf8');
                files[normalizedPath] = content;
                totalSize += stats.size;
                fileCount++;
            } catch (error) {
                console.error(`Error reading file ${filePath}:`, error);
                continue;
            }
        }

        // Generate diff string
        const diffString = await this.generateDiffString(rootPath);

        return {
            files,
            diffString,
            totalFiles: fileCount,
            totalSize
        };
    }

    private static async getAllFiles(dirPath: string): Promise<string[]> {
        const files: string[] = [];
        
        const traverse = (currentPath: string) => {
            try {
                const items = fs.readdirSync(currentPath);
                
                for (const item of items) {
                    const fullPath = path.join(currentPath, item);
                    const stats = fs.statSync(fullPath);
                    
                    if (stats.isDirectory()) {
                        // Skip common directories that should be ignored
                        if (this.shouldSkipDirectory(item)) {
                            continue;
                        }
                        traverse(fullPath);
                    } else if (stats.isFile()) {
                        files.push(fullPath);
                    }
                }
            } catch (error) {
                console.error(`Error reading directory ${currentPath}:`, error);
            }
        };

        traverse(dirPath);
        return files;
    }

    private static shouldSkipDirectory(dirName: string): boolean {
        const skipDirs = [
            '.git', '.svn', '.hg', '.bzr',
            'node_modules', '__pycache__', '.pytest_cache',
            'venv', 'env', '.env', 'virtualenv',
            'build', 'dist', 'target', 'bin', 'obj',
            '.vscode', '.idea', '.vs',
            'coverage', '.coverage', '.nyc_output',
            'logs', 'log', 'tmp', 'temp',
            '.DS_Store', 'Thumbs.db'
        ];
        
        return skipDirs.includes(dirName) || dirName.startsWith('.');
    }

    private static isSupportedFile(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        
        // Skip binary files
        if (this.BINARY_EXTENSIONS.includes(ext)) {
            return false;
        }

        // Include supported extensions
        if (this.SUPPORTED_EXTENSIONS.includes(ext)) {
            return true;
        }

        // Include files without extensions that might be code files
        if (!ext) {
            const fileName = path.basename(filePath).toLowerCase();
            const codeFiles = [
                'dockerfile', 'makefile', 'rakefile', 'gemfile', 'procfile',
                'readme', 'license', 'changelog', 'contributing'
            ];
            
            return codeFiles.some(name => fileName.includes(name));
        }

        return false;
    }

    private static async generateDiffString(rootPath: string): Promise<string> {
        try {
            console.log(`[DEBUG] generateDiffString called with rootPath: ${rootPath}`);
            
            // Use VS Code's Git API to get diff
            const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
            if (!gitExtension) {
                console.log('[DEBUG] VS Code Git extension not found');
                return '';
            }

            const git = gitExtension.getAPI(1);
            console.log(`[DEBUG] Available repositories: ${git.repositories.length}`);
            
            // Log all available repositories
            git.repositories.forEach((repo: any, index: number) => {
                console.log(`[DEBUG] Repository ${index}: ${repo.rootUri.fsPath}`);
            });

            // First try exact match
            let repository = git.repositories.find((repo: any) => 
                repo.rootUri.fsPath === rootPath
            );

            // If no exact match, try to find a repository that contains the rootPath or is contained by rootPath
            if (!repository) {
                console.log('[DEBUG] No exact match found, trying path-based matching...');
                repository = git.repositories.find((repo: any) => {
                    const repoPath = repo.rootUri.fsPath;
                    const isSubdirectory = rootPath.startsWith(repoPath) || repoPath.startsWith(rootPath);
                    console.log(`[DEBUG] Checking ${repoPath} vs ${rootPath}: ${isSubdirectory}`);
                    return isSubdirectory;
                });
            }

            if (!repository) {
                console.log('[DEBUG] No Git repository found for the workspace');
                return '';
            }

            console.log(`[DEBUG] Using repository: ${repository.rootUri.fsPath}`);

            // Get staged and unstaged changes
            const workingTreeChanges = repository.state.workingTreeChanges || [];
            const indexChanges = repository.state.indexChanges || [];
            const changes = workingTreeChanges.concat(indexChanges);

            console.log(`[DEBUG] Working tree changes: ${workingTreeChanges.length}`);
            console.log(`[DEBUG] Index changes: ${indexChanges.length}`);
            console.log(`[DEBUG] Total changes: ${changes.length}`);

            if (changes.length === 0) {
                console.log('[DEBUG] No changes detected, checking if there are any untracked files...');
                
                // Also check for untracked files
                const untrackedChanges = repository.state.untrackedChanges || [];
                console.log(`[DEBUG] Untracked changes: ${untrackedChanges.length}`);
                
                if (untrackedChanges.length === 0) {
                    console.log('[DEBUG] No changes found (staged, unstaged, or untracked)');
                    return '';
                }
                
                // Include untracked files in changes
                changes.push(...untrackedChanges);
            }

            let diffString = '';
            
            for (const change of changes) {
                try {
                    const uri = change.uri;
                    const relativePath = path.relative(repository.rootUri.fsPath, uri.fsPath);
                    console.log(`[DEBUG] Processing change: ${relativePath} (${change.status})`);
                    
                    // Get the diff for this file
                    let diff = '';
                    
                    if (change.status === 7) { // Untracked file
                        // For untracked files, show as new file
                        const content = await vscode.workspace.fs.readFile(uri);
                        const lines = Buffer.from(content).toString('utf8').split('\n');
                        diff = lines.map(line => `+${line}`).join('\n');
                        diffString += `diff --git a/${relativePath} b/${relativePath}\n`;
                        diffString += `new file mode 100644\n`;
                        diffString += `index 0000000..${Date.now().toString(16).substring(0, 7)}\n`;
                        diffString += `--- /dev/null\n`;
                        diffString += `+++ b/${relativePath}\n`;
                        diffString += `@@ -0,0 +1,${lines.length} @@\n`;
                        diffString += diff;
                        diffString += '\n';
                    } else {
                        // For tracked files, get actual diff
                        diff = await repository.diffWithHEAD(uri);
                        if (diff) {
                            diffString += `diff --git a/${relativePath} b/${relativePath}\n`;
                            diffString += diff;
                            diffString += '\n';
                        }
                    }
                    
                    console.log(`[DEBUG] Generated diff for ${relativePath}: ${diff ? 'success' : 'empty'}`);
                } catch (error) {
                    console.error(`[DEBUG] Error getting diff for ${change.uri.fsPath}:`, error);
                }
            }

            console.log(`[DEBUG] Final diff string length: ${diffString.length}`);
            if (diffString.length > 0) {
                console.log(`[DEBUG] Diff preview (first 500 chars): ${diffString.substring(0, 500)}...`);
            }

            // If we still have no diff, try fallback with GitService
            if (diffString.length === 0) {
                console.log('[DEBUG] VS Code Git API produced no diff, trying GitService fallback...');
                const gitService = new GitService();
                
                // Try the repository path first, then the workspace path
                const pathsToTry = repository ? [repository.rootUri.fsPath, rootPath] : [rootPath];
                
                for (const tryPath of pathsToTry) {
                    console.log(`[DEBUG] Trying GitService with path: ${tryPath}`);
                    const fallbackDiff = await gitService.generateDiff(tryPath);
                    if (fallbackDiff && fallbackDiff.trim().length > 0) {
                        console.log(`[DEBUG] GitService fallback successful, diff length: ${fallbackDiff.length}`);
                        return fallbackDiff;
                    }
                }
                
                console.log('[DEBUG] GitService fallback also produced no diff');
            }

            return diffString;
        } catch (error) {
            console.error('[DEBUG] Error generating diff string:', error);
            return '';
        }
    }

    public static async getSelectedFiles(uris: vscode.Uri[]): Promise<FileContent> {
        const files: FileContent = {};
        
        for (const uri of uris) {
            try {
                const content = await vscode.workspace.fs.readFile(uri);
                const relativePath = vscode.workspace.asRelativePath(uri);
                files[relativePath] = Buffer.from(content).toString('utf8');
            } catch (error) {
                console.error(`Error reading selected file ${uri.fsPath}:`, error);
            }
        }
        
        return files;
    }

    public static formatFileSize(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }
} 
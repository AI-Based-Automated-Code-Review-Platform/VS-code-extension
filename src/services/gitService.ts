import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export interface LocalRepositoryInfo {
    workspacePath: string;
    repositoryName: string;
    gitRemoteUrl?: string;
    gitBranch?: string;
    isGitRepo: boolean;
}

export class GitService {
    async generateDiff(workspaceRoot: string): Promise<string> {
        try {
            // Get all changes (staged and unstaged)
            const { stdout } = await execAsync('git diff HEAD', { cwd: workspaceRoot });
            
            // If no changes from HEAD, get staged changes
            if (!stdout.trim()) {
                const { stdout: stagedDiff } = await execAsync('git diff --cached', { cwd: workspaceRoot });
                if (!stagedDiff.trim()) {
                    // If no staged changes, get working directory changes
                    const { stdout: workingDiff } = await execAsync('git diff', { cwd: workspaceRoot });
                    return workingDiff;
                }
                return stagedDiff;
            }
            
            return stdout;
        } catch (error) {
            console.error('Error generating diff:', error);
            // If git fails, return empty diff
            return '';
        }
    }

    async getChangedFiles(workspaceRoot: string): Promise<string[]> {
        try {
            // Get all changed files (staged and unstaged)
            const { stdout } = await execAsync('git diff --name-only HEAD', { cwd: workspaceRoot });
            
            if (!stdout.trim()) {
                // Try staged files
                const { stdout: stagedFiles } = await execAsync('git diff --cached --name-only', { cwd: workspaceRoot });
                if (!stagedFiles.trim()) {
                    // Try working directory changes
                    const { stdout: workingFiles } = await execAsync('git diff --name-only', { cwd: workspaceRoot });
                    return workingFiles.trim().split('\n').filter(file => file.trim());
                }
                return stagedFiles.trim().split('\n').filter(file => file.trim());
            }
            
            return stdout.trim().split('\n').filter(file => file.trim());
        } catch (error) {
            console.error('Error getting changed files:', error);
            return [];
        }
    }

    async isGitRepository(workspaceRoot: string): Promise<boolean> {
        try {
            await execAsync('git rev-parse --git-dir', { cwd: workspaceRoot });
            return true;
        } catch (error) {
            return false;
        }
    }

    async getCurrentBranch(workspaceRoot: string): Promise<string> {
        try {
            const { stdout } = await execAsync('git branch --show-current', { cwd: workspaceRoot });
            return stdout.trim();
        } catch (error) {
            console.error('Error getting current branch:', error);
            return 'main';
        }
    }

    async getRepositoryInfo(workspaceRoot: string): Promise<{ owner: string; repo: string } | null> {
        try {
            const { stdout } = await execAsync('git remote get-url origin', { cwd: workspaceRoot });
            const remoteUrl = stdout.trim();
            
            // Parse GitHub URL
            const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
            if (match) {
                return {
                    owner: match[1],
                    repo: match[2]
                };
            }
            
            return null;
        } catch (error) {
            console.error('Error getting repository info:', error);
            return null;
        }
    }

    async hasUncommittedChanges(workspaceRoot: string): Promise<boolean> {
        try {
            const { stdout } = await execAsync('git status --porcelain', { cwd: workspaceRoot });
            return stdout.trim().length > 0;
        } catch (error) {
            console.error('Error checking for uncommitted changes:', error);
            return false;
        }
    }

    /**
     * Extract local repository information from the current workspace
     */
    static async getLocalRepositoryInfo(): Promise<LocalRepositoryInfo | null> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return null;
        }

        const workspacePath = workspaceFolder.uri.fsPath;
        const repositoryName = path.basename(workspacePath);
        
        let gitRemoteUrl: string | undefined;
        let gitBranch: string | undefined;
        let isGitRepo = false;

        try {
            // Check if it's a git repository
            const gitDir = path.join(workspacePath, '.git');
            isGitRepo = fs.existsSync(gitDir);

            if (isGitRepo) {
                // Try to get git information
                const gitInfo = await this.getGitInfo(workspacePath);
                gitRemoteUrl = gitInfo.remoteUrl;
                gitBranch = gitInfo.branch;
            }
        } catch (error) {
            console.warn('Failed to extract git information:', error);
        }

        return {
            workspacePath,
            repositoryName,
            gitRemoteUrl,
            gitBranch,
            isGitRepo
        };
    }

    /**
     * Get git information from the workspace
     */
    private static async getGitInfo(workspacePath: string): Promise<{ remoteUrl?: string; branch?: string }> {
        try {
            // Use VS Code's built-in git extension if available
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (gitExtension && gitExtension.isActive) {
                const git = gitExtension.exports.getAPI(1);
                const repository = git.repositories.find((repo: any) => 
                    repo.rootUri.fsPath === workspacePath
                );

                if (repository) {
                    const remoteUrl = repository.state.remotes[0]?.fetchUrl || repository.state.remotes[0]?.pushUrl;
                    const branch = repository.state.HEAD?.name;
                    
                    return {
                        remoteUrl,
                        branch
                    };
                }
            }

            // Fallback: read git config files directly
            return await this.readGitConfigFiles(workspacePath);
        } catch (error) {
            console.warn('Failed to get git info:', error);
            return {};
        }
    }

    /**
     * Fallback method to read git configuration files directly
     */
    private static async readGitConfigFiles(workspacePath: string): Promise<{ remoteUrl?: string; branch?: string }> {
        try {
            const gitDir = path.join(workspacePath, '.git');
            
            // Read current branch
            let branch: string | undefined;
            try {
                const headPath = path.join(gitDir, 'HEAD');
                if (fs.existsSync(headPath)) {
                    const headContent = fs.readFileSync(headPath, 'utf8').trim();
                    if (headContent.startsWith('ref: refs/heads/')) {
                        branch = headContent.replace('ref: refs/heads/', '');
                    }
                }
            } catch (error) {
                console.warn('Failed to read git HEAD:', error);
            }

            // Read remote URL
            let remoteUrl: string | undefined;
            try {
                const configPath = path.join(gitDir, 'config');
                if (fs.existsSync(configPath)) {
                    const configContent = fs.readFileSync(configPath, 'utf8');
                    const remoteMatch = configContent.match(/\[remote "origin"\][\s\S]*?url = (.+)/);
                    if (remoteMatch) {
                        remoteUrl = remoteMatch[1].trim();
                    }
                }
            } catch (error) {
                console.warn('Failed to read git config:', error);
            }

            return { remoteUrl, branch };
        } catch (error) {
            console.warn('Failed to read git config files:', error);
            return {};
        }
    }

    /**
     * Check if the current workspace is a git repository
     */
    static async isGitRepository(workspacePath?: string): Promise<boolean> {
        const targetPath = workspacePath || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!targetPath) {
            return false;
        }

        try {
            const gitDir = path.join(targetPath, '.git');
            return fs.existsSync(gitDir);
        } catch (error) {
            return false;
        }
    }
} 
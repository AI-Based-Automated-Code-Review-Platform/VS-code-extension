import * as fs from 'fs';
import * as path from 'path';
import { minimatch } from 'minimatch';

export interface GitignorePattern {
    pattern: string;
    isDirectory: boolean;
    isNegation: boolean;
    isGlobal: boolean;
}

export class GitignoreParser {
    private patterns: GitignorePattern[] = [];

    constructor(gitignorePath?: string) {
        if (gitignorePath && fs.existsSync(gitignorePath)) {
            this.loadGitignore(gitignorePath);
        }
    }

    private loadGitignore(gitignorePath: string): void {
        try {
            const content = fs.readFileSync(gitignorePath, 'utf8');
            const lines = content.split('\n');

            for (const line of lines) {
                const trimmed = line.trim();
                
                // Skip empty lines and comments
                if (!trimmed || trimmed.startsWith('#')) {
                    continue;
                }

                // Skip overly broad patterns
                if (trimmed === '/') {
                    continue;
                }

                const pattern: GitignorePattern = {
                    pattern: trimmed,
                    isDirectory: trimmed.endsWith('/'),
                    isNegation: trimmed.startsWith('!'),
                    isGlobal: trimmed.startsWith('**/') || !trimmed.includes('/')
                };

                this.patterns.push(pattern);
            }
        } catch (error) {
            console.error(`Error reading .gitignore file: ${error}`);
        }
    }

    public shouldIgnore(filePath: string): boolean {
        const normalizedPath = filePath.replace(/\\/g, '/');
        const pathParts = normalizedPath.split('/');
        const fileName = path.basename(normalizedPath);

        for (const pattern of this.patterns) {
            if (this.matchesPattern(normalizedPath, pathParts, fileName, pattern)) {
                return !pattern.isNegation; // If it's a negation pattern, don't ignore
            }
        }

        return false;
    }

    private matchesPattern(
        filePath: string, 
        pathParts: string[], 
        fileName: string, 
        pattern: GitignorePattern
    ): boolean {
        let patternToMatch = pattern.pattern;

        // Remove negation prefix
        if (pattern.isNegation) {
            patternToMatch = patternToMatch.substring(1);
        }

        // Handle directory patterns
        if (pattern.isDirectory) {
            patternToMatch = patternToMatch.slice(0, -1); // Remove trailing slash
            
            if (patternToMatch.startsWith('**/')) {
                // Pattern like '**/dirname/'
                const dirName = patternToMatch.substring(3);
                return pathParts.includes(dirName);
            } else {
                // Pattern like 'dirname/'
                return filePath === patternToMatch || filePath.startsWith(patternToMatch + '/');
            }
        }

        // Handle file patterns
        if (patternToMatch.startsWith('**/')) {
            // Pattern like '**/filename' or '**/*.ext'
            const filePattern = patternToMatch.substring(3);
            return minimatch(fileName, filePattern);
        } else if (patternToMatch.includes('/')) {
            // Pattern with path separators
            return minimatch(filePath, patternToMatch);
        } else {
            // Simple filename pattern
            return minimatch(fileName, patternToMatch);
        }
    }

    public static parseGitignoreFiles(rootPath: string): GitignoreParser {
        const parser = new GitignoreParser();
        
        // Load root .gitignore
        const rootGitignore = path.join(rootPath, '.gitignore');
        if (fs.existsSync(rootGitignore)) {
            parser.loadGitignore(rootGitignore);
        }

        // TODO: Add support for nested .gitignore files if needed
        
        return parser;
    }
} 
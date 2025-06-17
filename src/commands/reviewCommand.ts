import * as vscode from 'vscode';
import { AuthService } from '../services/authService';
import { FileService } from '../services/fileService';
import { GitService } from '../services/gitService';
import { ReviewService, ReviewRequest } from '../services/reviewService';
import { ReviewWebviewProvider } from '../providers/reviewWebviewProvider';
import { StatusBarProvider } from '../providers/statusBarProvider';
import { SettingsCommand, ReviewSettings } from './settingsCommand';

export class ReviewCommand {
    private fileService = new FileService();
    private gitService = new GitService();
    private reviewService: ReviewService;
    private settingsCommand = new SettingsCommand();

    constructor(
        private authService: AuthService,
        private reviewWebviewProvider: ReviewWebviewProvider,
        private statusBarProvider: StatusBarProvider
    ) {
        this.reviewService = new ReviewService(authService);
    }

    async startReview(): Promise<void> {
        try {
            // Check authentication
            const isAuthenticated = await this.authService.isAuthenticated();
            if (!isAuthenticated) {
                const action = await vscode.window.showWarningMessage(
                    'You need to authenticate with GitHub first.',
                    'Authenticate',
                    'Cancel'
                );
                
                if (action === 'Authenticate') {
                    await vscode.commands.executeCommand('codeReview.authenticate');
                    // Check again after authentication
                    if (!(await this.authService.isAuthenticated())) {
                        return;
                    }
                } else {
                    return;
                }
            }

            // Get workspace
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No workspace folder is open.');
                return;
            }

            const workspaceRoot = workspaceFolder.uri.fsPath;

            // Check if it's a git repository
            const isGitRepo = await this.gitService.isGitRepository(workspaceRoot);
            if (!isGitRepo) {
                const action = await vscode.window.showWarningMessage(
                    'This is not a Git repository. Code review works best with Git repositories.',
                    'Continue Anyway',
                    'Cancel'
                );
                
                if (action !== 'Continue Anyway') {
                    return;
                }
            }

            // Get review settings
            const settings = await this.settingsCommand.showSettings();
            if (!settings) {
                return; // User cancelled
            }

            // Start the review process
            await this.performReview(workspaceRoot, settings, isGitRepo);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Review failed: ${errorMessage}`);
        }
    }

    private async performReview(workspaceRoot: string, settings: ReviewSettings, isGitRepo: boolean): Promise<void> {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Starting Code Review",
            cancellable: true
        }, async (progress, token) => {
            try {
                // Step 1: Collect files
                progress.report({ increment: 10, message: "Collecting files..." });
                const files = await this.fileService.getFilesForReview(workspaceRoot);
                
                if (Object.keys(files).length === 0) {
                    throw new Error('No files found for review. Check your .gitignore patterns.');
                }

                // Step 2: Generate diff
                progress.report({ increment: 20, message: "Generating diff..." });
                let diffStr = '';
                if (isGitRepo) {
                    diffStr = await this.gitService.generateDiff(workspaceRoot);
                    console.log(`[DEBUG] Workspace Root: ${workspaceRoot}`);
                    console.log(`[DEBUG] Is Git Repo: ${isGitRepo}`);
                    console.log(`[DEBUG] Diff generated length: ${diffStr.length}`);
                    if (diffStr.length > 0) {
                        console.log(`[DEBUG] Diff preview (first 200 chars): ${diffStr.substring(0, 200)}...`);
                    } else {
                        console.log(`[DEBUG] No diff generated - this could mean no uncommitted changes`);
                    }
                } else {
                    console.log(`[DEBUG] Not a Git repository, skipping diff generation`);
                }

                // Step 3: Prepare request
                progress.report({ increment: 30, message: "Preparing review request..." });
                const reviewRequest: ReviewRequest = {
                    files: files,
                    diff_str: diffStr,
                    llm_model: settings.llmModel,
                    standards: settings.standards,
                    metrics: settings.metrics,
                    temperature: settings.temperature,
                    max_tokens: settings.maxTokens,
                    max_tool_calls: settings.maxToolCalls
                };

                // Step 4: Submit review
                progress.report({ increment: 40, message: "Submitting review..." });
                const response = await this.reviewService.submitReview(reviewRequest);

                // Step 5: Monitor progress
                progress.report({ increment: 50, message: "Review in progress..." });
                
                // Update status bar
                if (response.review_id) {
                    this.statusBarProvider.showReviewInProgress(response.review_id);
                }

                // Poll for completion
                const result = await this.reviewService.pollReviewStatus(
                    response.review_id || response.id,
                    (status) => {
                        progress.report({ 
                            increment: 60 + (status.status === 'processing' ? 20 : 0),
                            message: `Review ${status.status}...` 
                        });
                    }
                );

                progress.report({ increment: 100, message: "Review complete!" });

                // Update status bar
                this.statusBarProvider.hideReviewProgress();

                if (result.status === 'completed') {
                    // Show results
                    if (response.review_id) {
                        await this.showResults(response.review_id);
                    }
                    vscode.window.showInformationMessage('Code review completed successfully!');
                } else {
                    throw new Error(result.error || 'Review failed');
                }

            } catch (error) {
                this.statusBarProvider.hideReviewProgress();
                throw error;
            }
        });
    }

    async showResults(reviewId: string): Promise<void> {
        try {
            const result = await this.reviewService.getReviewStatus(reviewId);
            
            if (result.status !== 'completed' || !result.result) {
                vscode.window.showWarningMessage('Review is not completed yet or has no results.');
                return;
            }

            // Show results in webview
            await this.reviewWebviewProvider.showReview(result);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to show results: ${errorMessage}`);
        }
    }
} 
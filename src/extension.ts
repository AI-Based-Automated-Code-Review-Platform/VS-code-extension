import * as vscode from 'vscode';
import { AuthService } from './services/authService';
import { ApiService } from './services/apiService';
import { FileService, ReviewFiles } from './services/fileService';
import { WebSocketService } from './services/websocketService';
import { ReviewResultsPanel } from './webview/reviewResultsPanel';
import { ReviewDashboardPanel } from './webview/reviewDashboard';
import { ReviewSettingsPanel } from './webview/reviewSettingsPanel';
import { ReviewExplorerProvider, ReviewItem } from './providers/reviewExplorerProvider';
import { ReviewHistoryProvider } from './providers/reviewHistoryProvider';
import { SettingsProvider } from './providers/settingsProvider';
import { QuickActionsProvider } from './providers/quickActionsProvider';
import { GitService } from './services/gitService';

let authService: AuthService;
let apiService: ApiService;
let websocketService: WebSocketService | null = null;
let reviewExplorerProvider: ReviewExplorerProvider;
let reviewHistoryProvider: ReviewHistoryProvider;
let settingsProvider: SettingsProvider;
let quickActionsProvider: QuickActionsProvider;
let extensionUri: vscode.Uri;

export function activate(context: vscode.ExtensionContext) {
    console.log('Code Review Extension is now active!');
    
    try {
        // Store extension URI for use throughout the extension
        extensionUri = context.extensionUri;
        
        // Initialize services
        authService = new AuthService(context);
        apiService = new ApiService(authService);

        // Initialize tree data providers
        reviewExplorerProvider = new ReviewExplorerProvider(apiService, authService);
        reviewHistoryProvider = new ReviewHistoryProvider(apiService, authService);
        settingsProvider = new SettingsProvider();
        quickActionsProvider = new QuickActionsProvider(authService);

        // Register tree views
        const reviewExplorerTreeView = vscode.window.createTreeView('codeReviewExplorer', {
            treeDataProvider: reviewExplorerProvider,
            showCollapseAll: true
        });

        const reviewHistoryTreeView = vscode.window.createTreeView('codeReviewHistory', {
            treeDataProvider: reviewHistoryProvider,
            showCollapseAll: true
        });

        const settingsTreeView = vscode.window.createTreeView('codeReviewSettings', {
            treeDataProvider: settingsProvider,
            showCollapseAll: false
        });

        const quickActionsTreeView = vscode.window.createTreeView('codeReviewQuickActions', {
            treeDataProvider: quickActionsProvider,
            showCollapseAll: false
        });

        // Set context for when user is authenticated
        authService.isAuthenticated().then(isAuth => {
            vscode.commands.executeCommand('setContext', 'codeReview.authenticated', isAuth);
        });

        // Register commands with detailed logging
        console.log('Registering commands...');
        const commands = [
            // Authentication commands
            vscode.commands.registerCommand('codeReview.authenticate', authenticate),
            vscode.commands.registerCommand('codeReview.logout', logout),
            vscode.commands.registerCommand('codeReview.checkStatus', checkAuthStatus),
            
            // Review commands
            vscode.commands.registerCommand('codeReview.reviewWorkspace', reviewWorkspace),
            vscode.commands.registerCommand('codeReview.reviewSelectedFiles', reviewSelectedFiles),
            vscode.commands.registerCommand('codeReview.quickReview', quickReview),
            
            // UI commands
            vscode.commands.registerCommand('codeReview.showSettings', showSettings),
            vscode.commands.registerCommand('codeReview.showResults', showResults),
            vscode.commands.registerCommand('codeReview.openWebview', openDashboard),
            vscode.commands.registerCommand('codeReview.showReviewDetails', showReviewDetails),
            
            // Tree view commands
            vscode.commands.registerCommand('codeReview.refreshExplorer', () => reviewExplorerProvider.refresh()),
            vscode.commands.registerCommand('codeReview.refreshHistory', () => reviewHistoryProvider.refresh()),
            vscode.commands.registerCommand('codeReview.deleteReview', deleteReview),
            vscode.commands.registerCommand('codeReview.exportResults', exportResults)
        ];

        context.subscriptions.push(...commands);
        context.subscriptions.push(reviewExplorerTreeView, reviewHistoryTreeView, settingsTreeView, quickActionsTreeView);
        console.log(`Successfully registered ${commands.length} commands`);

        // Show activation message
        vscode.window.showInformationMessage('AI Code Review extension activated successfully!');

        // Initialize status bar
        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.command = 'codeReview.checkStatus';
        statusBarItem.text = '$(sync~spin) Code Review';
        statusBarItem.tooltip = 'Click to check authentication status';
        statusBarItem.show();
        context.subscriptions.push(statusBarItem);

        // Update status bar based on auth state
        updateStatusBar(statusBarItem);

        // Listen for auth state changes
        authService.onAuthStateChanged(() => {
            updateStatusBar(statusBarItem);
        });
        
        console.log('Extension activation completed successfully');
    } catch (error) {
        console.error('Error during extension activation:', error);
        vscode.window.showErrorMessage(`Failed to activate AI Code Review extension: ${error}`);
    }
}

export function deactivate() {
    if (websocketService) {
        websocketService.disconnect();
    }
}

async function authenticate() {
    try {
        vscode.window.showInformationMessage('Starting authentication...');
        
        const success = await authService.authenticate();
        
        if (success) {
            vscode.window.showInformationMessage('Successfully authenticated with backend!');
            
            // Initialize WebSocket connection
            const user = await authService.getCurrentUser();
            if (user && user.github_id) {
                await initializeWebSocket(user.github_id);
            }
        } else {
            vscode.window.showErrorMessage('Authentication failed. Please try again.');
        }
    } catch (error) {
        console.error('Authentication error:', error);
        vscode.window.showErrorMessage(`Authentication failed: ${error}`);
    }
}

async function logout() {
    try {
        await authService.logout();
        
        if (websocketService) {
            websocketService.disconnect();
            websocketService = null;
        }
        
        vscode.window.showInformationMessage('Successfully logged out.');
    } catch (error) {
        console.error('Logout error:', error);
        vscode.window.showErrorMessage(`Logout failed: ${error}`);
    }
}

async function reviewWorkspace() {
    try {
        // Check authentication
        if (!await authService.isAuthenticated()) {
            const result = await vscode.window.showInformationMessage(
                'You need to authenticate first.',
                'Authenticate'
            );
            if (result === 'Authenticate') {
                await authenticate();
                if (!await authService.isAuthenticated()) {
                    return;
                }
            } else {
                return;
            }
        }

        // Get workspace folder
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder is open.');
            return;
        }

        // Get review settings
        const config = vscode.workspace.getConfiguration('codeReview');
        const settings = {
            llmModel: config.get('defaultLLMModel', 'CEREBRAS::llama-3.3-70b'),
            standards: config.get('defaultStandards', []),
            metrics: config.get('defaultMetrics', []),
            temperature: 0.3,
            maxTokens: 32768,
            maxToolCalls: 7
        };

        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Preparing code review...',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Analyzing files...' });

            // Get files for review
            const reviewFiles = await FileService.getReviewFiles(workspaceFolder);
            
            progress.report({ increment: 20, message: 'Extracting repository info...' });

            // Get local repository information
            const repoInfo = await GitService.getLocalRepositoryInfo();
            
            progress.report({ increment: 30, message: 'Preparing request...' });

            // Prepare review request with local repository context
            const reviewRequest = {
                files: reviewFiles.files,
                diff_str: reviewFiles.diffString,
                llm_model: settings.llmModel,
                standards: settings.standards,
                metrics: settings.metrics,
                temperature: settings.temperature,
                max_tokens: settings.maxTokens,
                max_tool_calls: settings.maxToolCalls,
                // Include local repository context
                workspace_path: repoInfo?.workspacePath,
                repository_name: repoInfo?.repositoryName,
                git_remote_url: repoInfo?.gitRemoteUrl,
                git_branch: repoInfo?.gitBranch,
                is_git_repo: repoInfo?.isGitRepo || false
            };

            progress.report({ increment: 50, message: 'Submitting review request...' });

            // Submit review
            const response = await apiService.submitVSCodeReview(reviewRequest);
            
            progress.report({ increment: 80, message: 'Review submitted successfully!' });

            // Show success message with repository context
            const repoContext = repoInfo ? ` for ${repoInfo.repositoryName}` : '';
            vscode.window.showInformationMessage(
                `Review submitted successfully${repoContext}! Review ID: ${response.review_id}. You'll receive real-time updates.`,
                'View Status'
            ).then(selection => {
                if (selection === 'View Status') {
                    vscode.commands.executeCommand('codeReview.checkStatus');
                }
            });

            // Set up WebSocket listener for this review
            if (websocketService && response.review_id) {
                websocketService.onReviewUpdate(response.review_id, (update) => {
                    if (update.type === 'review_completed' && response.review_id) {
                        showResults(response.review_id);
                    }
                });
            }
        });

    } catch (error) {
        console.error('Review workspace error:', error);
        vscode.window.showErrorMessage(`Review failed: ${error}`);
    }
}

async function reviewSelectedFiles(uri: vscode.Uri, uris: vscode.Uri[]) {
    try {
        // Check authentication
        if (!await authService.isAuthenticated()) {
            const result = await vscode.window.showInformationMessage(
                'You need to authenticate first.',
                'Authenticate'
            );
            if (result === 'Authenticate') {
                await authenticate();
                if (!await authService.isAuthenticated()) {
                    return;
                }
            } else {
                return;
            }
        }

        // Get selected files
        const selectedUris = uris && uris.length > 0 ? uris : [uri];
        if (!selectedUris || selectedUris.length === 0) {
            vscode.window.showErrorMessage('No files selected.');
            return;
        }

        // Show settings dialog
        const settings = await showSettingsDialog();
        if (!settings) {
            return; // User cancelled
        }

        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Preparing code review...',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Reading selected files...' });

            // Get selected files content
            const files = await FileService.getSelectedFiles(selectedUris);
            
            // Get local repository information for workspace context
            const repoInfo = await GitService.getLocalRepositoryInfo();
            
            progress.report({ increment: 30, message: 'Preparing request...' });

            // Prepare review request with workspace context
            const reviewRequest = {
                files: files,
                diff_str: '', // No diff for selected files
                llm_model: settings.llmModel,
                standards: settings.standards,
                metrics: settings.metrics,
                temperature: settings.temperature,
                max_tokens: settings.maxTokens,
                max_tool_calls: settings.maxToolCalls,
                // Include local repository context
                workspace_path: repoInfo?.workspacePath,
                repository_name: repoInfo?.repositoryName,
                git_remote_url: repoInfo?.gitRemoteUrl,
                git_branch: repoInfo?.gitBranch,
                is_git_repo: repoInfo?.isGitRepo || false
            };

            progress.report({ increment: 50, message: 'Submitting review request...' });

            // Submit review
            const response = await apiService.submitVSCodeReview(reviewRequest);
            
            progress.report({ increment: 80, message: 'Review submitted successfully!' });

            // Show success message
            vscode.window.showInformationMessage(
                `Review submitted successfully! Review ID: ${response.review_id}. You'll receive real-time updates.`,
                'View Status'
            ).then(selection => {
                if (selection === 'View Status') {
                    vscode.commands.executeCommand('codeReview.checkStatus');
                }
            });

            // Set up WebSocket listener for this review
            if (websocketService && response.review_id) {
                websocketService.onReviewUpdate(response.review_id, (update) => {
                    if (update.type === 'review_completed' && response.review_id) {
                        showResults(response.review_id);
                    }
                });
            }
        });

    } catch (error) {
        console.error('Review selected files error:', error);
        vscode.window.showErrorMessage(`Review failed: ${error}`);
    }
}

async function showSettingsDialog(): Promise<any | null> {
    try {
        if (!extensionUri) {
            vscode.window.showErrorMessage('Extension URI not available');
            return null;
        }
        
        const settings = await ReviewSettingsPanel.showSettings(extensionUri);
        return settings;
    } catch (error) {
        console.error('Settings panel error:', error);
        vscode.window.showErrorMessage(`Failed to show settings: ${error}`);
        return null;
    }
}

async function showResults(reviewId: string) {
    try {
        if (!reviewId) {
            vscode.window.showErrorMessage('No review ID provided.');
            return;
        }

        // Get review results from API
        const reviewData = await apiService.getReviewResult(reviewId);
        // Check if extension URI is available
        if (!extensionUri) {
            vscode.window.showErrorMessage('Extension URI not available');
            return;
        }
        
        // Show results in webview
        ReviewResultsPanel.createOrShow(
            extensionUri,
            reviewData,
            reviewId
        );
        
    } catch (error) {
        console.error('Show results error:', error);
        vscode.window.showErrorMessage(`Failed to load review results: ${error}`);
    }
}

async function showSettings() {
    try {
        // Show the custom settings panel instead of just VS Code settings
        if (!extensionUri) {
            vscode.window.showErrorMessage('Extension URI not available');
            return;
        }
        
        // Try to show the settings panel, fallback to VS Code settings if it fails
        try {
            const settings = await ReviewSettingsPanel.showSettings(extensionUri);
            if (settings) {
                // Settings were updated, refresh any dependent components
                vscode.window.showInformationMessage('Settings updated successfully!');
            }
        } catch (settingsPanelError) {
            console.log('Custom settings panel failed, falling back to VS Code settings:', settingsPanelError);
            
            // Fallback to the existing implementation
            const config = vscode.workspace.getConfiguration('codeReview');
            
            const action = await vscode.window.showQuickPick([
                { label: '⚙️ Configure Settings', value: 'configure' },
                { label: '🔍 View Current Settings', value: 'view' },
                { label: '🔄 Reset to Defaults', value: 'reset' }
            ], {
                placeHolder: 'Choose an action',
                title: 'Code Review Settings'
            });

            if (!action) return;

            switch (action.value) {
                case 'configure':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'codeReview');
                    break;
                case 'view':
                    const settings = {
                        'LLM Model': config.get('llmModel'),
                        'Standards': config.get('standards'),
                        'Metrics': config.get('metrics'),
                        'Temperature': config.get('temperature'),
                        'Max Tokens': config.get('maxTokens'),
                        'Max Tool Calls': config.get('maxToolCalls')
                    };
                    const settingsText = Object.entries(settings)
                        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
                        .join('\n');
                    vscode.window.showInformationMessage('Current Settings', { modal: true, detail: settingsText });
                    break;
                case 'reset':
                    const confirm = await vscode.window.showWarningMessage(
                        'Are you sure you want to reset all settings to defaults?',
                        'Yes', 'No'
                    );
                    if (confirm === 'Yes') {
                        await config.update('llmModel', undefined, vscode.ConfigurationTarget.Global);
                        await config.update('standards', undefined, vscode.ConfigurationTarget.Global);
                        await config.update('metrics', undefined, vscode.ConfigurationTarget.Global);
                        await config.update('temperature', undefined, vscode.ConfigurationTarget.Global);
                        await config.update('maxTokens', undefined, vscode.ConfigurationTarget.Global);
                        await config.update('maxToolCalls', undefined, vscode.ConfigurationTarget.Global);
                        vscode.window.showInformationMessage('Settings reset to defaults.');
                    }
                    break;
            }
        }
    } catch (error) {
        console.error('Show settings error:', error);
        vscode.window.showErrorMessage(`Failed to show settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function checkAuthStatus() {
    try {
        const isAuthenticated = await authService.isAuthenticated();
        
        if (isAuthenticated) {
            const user = await authService.getCurrentUser();
            const wsStatus = websocketService ? websocketService.getConnectionState() : 'disconnected';
            
            vscode.window.showInformationMessage(
                `Authenticated as: ${user?.username || 'Unknown'}\nWebSocket: ${wsStatus}`,
                'View Profile', 'Disconnect WebSocket', 'Reconnect WebSocket'
            ).then(async (selection) => {
                switch (selection) {
                    case 'View Profile':
                        if (user?.html_url) {
                            vscode.env.openExternal(vscode.Uri.parse(user.html_url));
                        }
                        break;
                    case 'Disconnect WebSocket':
                        if (websocketService) {
                            websocketService.disconnect();
                            websocketService = null;
                            vscode.window.showInformationMessage('WebSocket disconnected.');
                        }
                        break;
                    case 'Reconnect WebSocket':
                        if (user && user.github_id) {
                            await initializeWebSocket(user.github_id);
                        }
                        break;
                }
            });
        } else {
            vscode.window.showInformationMessage(
                'Not authenticated. Please authenticate to use code review features.',
                'Authenticate'
            ).then((selection) => {
                if (selection === 'Authenticate') {
                    authenticate();
                }
            });
        }
    } catch (error) {
        console.error('Check auth status error:', error);
        vscode.window.showErrorMessage(`Failed to check authentication status: ${error}`);
    }
}

async function initializeWebSocket(userId: string) {
    try {
        const config = vscode.workspace.getConfiguration('codeReview');
        const baseUrl = config.get('backendUrl', 'http://localhost:8000');
        
        websocketService = new WebSocketService(baseUrl, userId, authService);
        
        // Set up user notifications listener
        websocketService.onUserNotification((update) => {
            console.log('User notification received:', update);
        });
        
        await websocketService.connect();
        vscode.window.showInformationMessage('Connected to real-time updates.');
        
    } catch (error) {
        console.error('WebSocket initialization error:', error);
        vscode.window.showWarningMessage(`Failed to connect to real-time updates: ${error}`);
    }
}

function updateStatusBar(statusBarItem: vscode.StatusBarItem) {
    authService.isAuthenticated().then((isAuth: boolean) => {
        if (isAuth) {
            statusBarItem.text = '$(check) Code Review';
            statusBarItem.tooltip = 'Code Review - Authenticated (Click for status)';
            statusBarItem.backgroundColor = undefined;
        } else {
            statusBarItem.text = '$(x) Code Review';
            statusBarItem.tooltip = 'Code Review - Not Authenticated (Click to authenticate)';
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
    }).catch(() => {
        statusBarItem.text = '$(alert) Code Review';
        statusBarItem.tooltip = 'Code Review - Error (Click to check)';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    });
}

async function quickReview() {
    try {
        // Check authentication
        if (!await authService.isAuthenticated()) {
            const result = await vscode.window.showInformationMessage(
                'You need to authenticate first.',
                'Authenticate'
            );
            if (result === 'Authenticate') {
                await authenticate();
                if (!await authService.isAuthenticated()) {
                    return;
                }
            } else {
                return;
            }
        }

        // Get current active file
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active file found. Please open a file first.');
            return;
        }

        const document = activeEditor.document;
        if (document.isUntitled) {
            vscode.window.showErrorMessage('Please save the file before reviewing.');
            return;
        }

        // Get quick settings
        const config = vscode.workspace.getConfiguration('codeReview');
        const settings = {
            llmModel: config.get('defaultLLMModel', 'gpt-4'),
            standards: config.get('defaultStandards', []),
            metrics: config.get('defaultMetrics', []),
            temperature: 0.3,
            maxTokens: 4000,
            maxToolCalls: 10
        };

        // Create review request for single file
        const fileContent = document.getText();
        const relativePath = vscode.workspace.asRelativePath(document.uri);
        
        // Get local repository information for workspace context
        const repoInfo = await GitService.getLocalRepositoryInfo();
        
        const reviewRequest = {
            files: { [relativePath]: fileContent },
            llm_model: settings.llmModel,
            standards: settings.standards,
            metrics: settings.metrics,
            temperature: settings.temperature,
            max_tokens: settings.maxTokens,
            max_tool_calls: settings.maxToolCalls,
            // Include local repository context
            workspace_path: repoInfo?.workspacePath,
            repository_name: repoInfo?.repositoryName,
            git_remote_url: repoInfo?.gitRemoteUrl,
            git_branch: repoInfo?.gitBranch,
            is_git_repo: repoInfo?.isGitRepo || false
        };

        // Submit review with progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Quick Review in progress...',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 30, message: 'Analyzing file...' });
            
            const response = await apiService.submitVSCodeReview(reviewRequest);
            
            progress.report({ increment: 70, message: 'Review submitted!' });
            
            vscode.window.showInformationMessage(
                `Quick review submitted! Review ID: ${response.review_id}`,
                'View Results'
            ).then(selection => {
                if (selection === 'View Results' && response.review_id) {
                    showResults(response.review_id);
                }
            });

            // Add to explorer
            if (response.review_id) {
                const reviewItem: ReviewItem = {
                    id: response.review_id,
                    title: `Quick Review - ${relativePath}`,
                    status: 'pending',
                    created_at: new Date().toISOString(),
                    files_count: 1,
                    model: settings.llmModel
                };
                reviewExplorerProvider.addReview(reviewItem);
            }
        });

    } catch (error) {
        console.error('Quick review error:', error);
        vscode.window.showErrorMessage(`Quick review failed: ${error}`);
    }
}

function openDashboard() {
    try {
        if (!extensionUri) {
            vscode.window.showErrorMessage('Extension URI not available');
            return;
        }
        
        ReviewDashboardPanel.createOrShow(extensionUri, apiService, authService);
    } catch (error) {
        console.error('Open dashboard error:', error);
        vscode.window.showErrorMessage(`Failed to open dashboard: ${error}`);
    }
}

async function showReviewDetails(reviewItem: any) {
    try {
        console.log('showReviewDetails called with:', reviewItem);
        
        // Handle different types of reviewItem
        let reviewId: string | undefined;
        
        if (typeof reviewItem === 'string') {
            reviewId = reviewItem;
        } else if (reviewItem && typeof reviewItem === 'object') {
            // Try different possible ID properties
            reviewId = reviewItem.id || reviewItem.review_id || reviewItem.reviewId;
            
            // If still no ID, try to extract from review property
            if (!reviewId && reviewItem.review) {
                reviewId = reviewItem.review.id || reviewItem.review.review_id;
            }
        }
        
        console.log('Extracted reviewId:', reviewId);
        
        if (!reviewId || reviewId === 'unknown') {
            console.error('No valid review ID found in reviewItem:', reviewItem);
            vscode.window.showErrorMessage('No valid review ID provided. Please try refreshing the review list.');
            return;
        }

        // First try to show the review results panel
        try {
            await showResults(reviewId);
        } catch (resultsError) {
            console.error('Failed to show results panel, trying alternative approach:', resultsError);
            
            // Alternative: Show review data in a simple information message
            try {
                const reviewData = await apiService.getReviewResult(reviewId);
                
                if (reviewData) {
                    // Create a summary of the review
                    const summary = `Review ID: ${reviewId}\nStatus: ${reviewData.status}\nCreated: ${new Date(reviewData.created_at).toLocaleString()}`;
                    
                    const action = await vscode.window.showInformationMessage(
                        'Review Details',
                        { modal: true, detail: summary },
                        'Export Results',
                        'Open Dashboard'
                    );
                    
                    if (action === 'Export Results') {
                        await exportResults(reviewItem);
                    } else if (action === 'Open Dashboard') {
                        openDashboard();
                    }
                } else {
                    vscode.window.showWarningMessage(`No review data found for ID: ${reviewId}`);
                }
            } catch (dataError) {
                console.error('Failed to fetch review data:', dataError);
                vscode.window.showErrorMessage(`Failed to load review details: ${dataError instanceof Error ? dataError.message : 'Unknown error'}`);
            }
        }
        
    } catch (error) {
        console.error('Show review details error:', error);
        vscode.window.showErrorMessage(`Failed to show review details: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function deleteReview(reviewItem: any) {
    try {
        const reviewId = typeof reviewItem === 'string' ? reviewItem : reviewItem.id;
        
        if (!reviewId) {
            vscode.window.showErrorMessage('No review ID provided');
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete review ${reviewId}?`,
            { modal: true },
            'Delete'
        );

        if (confirm === 'Delete') {
            // Remove from tree view
            reviewExplorerProvider.removeReview(reviewId);
            reviewHistoryProvider.refresh();
            
            vscode.window.showInformationMessage(`Review ${reviewId} deleted from local view`);
            
            // Note: Actual API deletion would need to be implemented on the backend
        }
        
    } catch (error) {
        console.error('Delete review error:', error);
        vscode.window.showErrorMessage(`Failed to delete review: ${error}`);
    }
}

async function exportResults(reviewItem: any) {
    try {
        const reviewId = typeof reviewItem === 'string' ? reviewItem : reviewItem.id;
        
        if (!reviewId) {
            vscode.window.showErrorMessage('No review ID provided');
            return;
        }

        // Get review data
        const reviewData = await apiService.getReviewResult(reviewId);
        
        // Prepare export content
        const exportContent = JSON.stringify(reviewData, null, 2);
        
        // Show save dialog
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`review-${reviewId}.json`),
            filters: {
                'JSON Files': ['json'],
                'All Files': ['*']
            }
        });

        if (uri) {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(exportContent));
            vscode.window.showInformationMessage(`Review results exported to ${uri.fsPath}`, 'Open File').then(selection => {
                if (selection === 'Open File') {
                    vscode.commands.executeCommand('vscode.open', uri);
                }
            });
        }
        
    } catch (error) {
        console.error('Export results error:', error);
        vscode.window.showErrorMessage(`Failed to export results: ${error}`);
    }
} 
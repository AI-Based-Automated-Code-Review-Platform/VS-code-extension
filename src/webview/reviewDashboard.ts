import * as vscode from 'vscode';
import { ApiService } from '../services/apiService';
import { AuthService } from '../services/authService';

export class ReviewDashboardPanel {
    public static currentPanel: ReviewDashboardPanel | undefined;
    public static readonly viewType = 'reviewDashboard';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, apiService: ApiService, authService: AuthService) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (ReviewDashboardPanel.currentPanel) {
            ReviewDashboardPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        const panel = vscode.window.createWebviewPanel(
            ReviewDashboardPanel.viewType,
            'AI Code Review Dashboard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'out', 'compiled')
                ]
            }
        );

        ReviewDashboardPanel.currentPanel = new ReviewDashboardPanel(panel, extensionUri, apiService, authService);
    }

    public static kill() {
        ReviewDashboardPanel.currentPanel?.dispose();
        ReviewDashboardPanel.currentPanel = undefined;
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, apiService: ApiService, authService: AuthService) {
        ReviewDashboardPanel.currentPanel = new ReviewDashboardPanel(panel, extensionUri, apiService, authService);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        private apiService: ApiService,
        private authService: AuthService
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'startReview':
                        this.handleStartReview(message);
                        break;
                    case 'loadReviews':
                        this.handleLoadReviews();
                        break;
                    case 'showReviewDetails':
                        this.handleShowReviewDetails(message.reviewId);
                        break;
                    case 'exportResults':
                        this.handleExportResults(message.reviewId);
                        break;
                    case 'deleteReview':
                        this.handleDeleteReview(message.reviewId);
                        break;
                    case 'authenticate':
                        this.handleAuthenticate();
                        break;
                    case 'logout':
                        this.handleLogout();
                        break;
                    case 'getSettings':
                        this.handleGetSettings();
                        break;
                    case 'updateSettings':
                        this.handleUpdateSettings(message.settings);
                        break;
                    case 'openVSCodeSettings':
                        vscode.commands.executeCommand('workbench.action.openSettings', 'codeReview');
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private async handleStartReview(message: any) {
        try {
            vscode.commands.executeCommand('codeReview.reviewWorkspace');
            this._panel.webview.postMessage({
                command: 'reviewStarted',
                success: true
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'reviewStarted',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    private async handleLoadReviews() {
        try {
            // Use VSCode-specific review history endpoint
            // The backend will filter based on stored workspace information
            const reviews = await this.apiService.getVSCodeReviewHistory(50);
            this._panel.webview.postMessage({
                command: 'reviewsLoaded',
                reviews: reviews
            });
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'reviewsLoaded',
                reviews: [],
                error: error instanceof Error ? error.message : 'Failed to load reviews'
            });
        }
    }

    private async handleShowReviewDetails(reviewId: string) {
        try {
            // Call the extension's showReviewDetails command directly
            await vscode.commands.executeCommand('codeReview.showReviewDetails', reviewId);
            
            // Send a notification that the details are being loaded
            this._panel.webview.postMessage({
                command: 'reviewDetailsLoaded',
                review: { id: reviewId }
            });
        } catch (error) {
            console.error('Failed to show review details:', error);
            vscode.window.showErrorMessage(`Failed to load review details: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async handleExportResults(reviewId: string) {
        try {
            const review = await this.apiService.getReviewResult(reviewId);
            const content = JSON.stringify(review, null, 2);
            
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`review-${reviewId}.json`),
                filters: {
                    'JSON': ['json']
                }
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
                vscode.window.showInformationMessage(`Review results exported to ${uri.fsPath}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export results: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async handleDeleteReview(reviewId: string) {
        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete review ${reviewId}?`,
            { modal: true },
            'Delete'
        );

        if (confirm === 'Delete') {
            // Note: This would require implementing a delete endpoint in the API
            vscode.window.showInformationMessage('Delete functionality would be implemented here');
        }
    }

    private async handleAuthenticate() {
        const success = await this.authService.authenticate();
        this._panel.webview.postMessage({
            command: 'authResult',
            success: success
        });
        if (success) {
            this._update(); // Refresh the entire view
        }
    }

    private async handleLogout() {
        await this.authService.logout();
        this._panel.webview.postMessage({
            command: 'authResult',
            success: false
        });
        this._update(); // Refresh the entire view
    }

    private async handleGetSettings() {
        const config = vscode.workspace.getConfiguration('codeReview');
        const settings = {
            backendUrl: config.get('backendUrl'),
            defaultLLMModel: config.get('defaultLLMModel'),
            defaultStandards: config.get('defaultStandards'),
            defaultMetrics: config.get('defaultMetrics'),
            maxFileSize: config.get('maxFileSize'),
            maxTotalSize: config.get('maxTotalSize'),
            maxFiles: config.get('maxFiles'),
            autoReview: config.get('autoReview'),
            notifications: config.get('notifications')
        };

        this._panel.webview.postMessage({
            command: 'settingsLoaded',
            settings: settings
        });
    }

    private async handleUpdateSettings(settings: any) {
        const config = vscode.workspace.getConfiguration('codeReview');
        
        try {
            for (const [key, value] of Object.entries(settings)) {
                await config.update(key, value, vscode.ConfigurationTarget.Global);
            }
            
            this._panel.webview.postMessage({
                command: 'settingsUpdated',
                success: true
            });
            
            vscode.window.showInformationMessage('Settings updated successfully');
        } catch (error) {
            this._panel.webview.postMessage({
                command: 'settingsUpdated',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    public dispose() {
        ReviewDashboardPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private async _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = await this._getHtmlForWebview(webview);
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
        const isAuthenticated = await this.authService.isAuthenticated();
        let userInfo = null;
        
        if (isAuthenticated) {
            try {
                userInfo = await this.authService.getCurrentUser();
            } catch (error) {
                console.error('Failed to get user info:', error);
            }
        }

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Code Review Dashboard</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .user-info {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
        }
        .button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .section {
            margin-bottom: 30px;
        }
        .section h2 {
            color: var(--vscode-foreground);
            margin-bottom: 15px;
        }
        .quick-actions {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
        }
        .action-card {
            background-color: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 8px;
            padding: 20px;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        .action-card:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .action-card h3 {
            margin: 0 0 8px 0;
            color: var(--vscode-foreground);
        }
        .action-card p {
            margin: 0;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }
        .reviews-list {
            max-height: 400px;
            overflow-y: auto;
        }
        .review-item {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 16px;
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            margin-bottom: 12px;
            background-color: var(--vscode-editorWidget-background);
        }
        .review-info {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .review-info h4 {
            margin: 0;
            color: var(--vscode-foreground);
            font-size: 16px;
            font-weight: 600;
        }
        .review-info p {
            margin: 0;
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
            line-height: 1.4;
        }
        .review-meta {
            display: flex;
            flex-direction: column;
            gap: 4px;
            margin-top: 4px;
        }
        .review-actions {
            display: flex;
            gap: 8px;
            margin-left: 16px;
            flex-shrink: 0;
        }
        .status {
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: bold;
            display: inline-block;
            margin-bottom: 4px;
        }
        .status.completed {
            background-color: var(--vscode-testing-iconPassed);
            color: white;
        }
        .status.failed {
            background-color: var(--vscode-testing-iconFailed);
            color: white;
        }
        .status.pending {
            background-color: var(--vscode-testing-iconQueued);
            color: white;
        }
        .status.processing {
            background-color: var(--vscode-testing-iconSkipped);
            color: white;
        }
        .avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            object-fit: cover;
            background-color: var(--vscode-button-secondaryBackground);
        }
        .avatar-fallback {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background-color: var(--vscode-button-secondaryBackground);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--vscode-button-secondaryForeground);
            font-weight: bold;
            font-size: 14px;
        }
        .auth-prompt {
            text-align: center;
            padding: 60px 20px;
        }
        .auth-prompt h2 {
            margin-bottom: 20px;
        }
        .auth-prompt p {
            margin-bottom: 30px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    ${isAuthenticated ? this._getAuthenticatedContent(userInfo) : this._getUnauthenticatedContent()}
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function startReview() {
            vscode.postMessage({ command: 'startReview' });
        }
        
        function authenticate() {
            vscode.postMessage({ command: 'authenticate' });
        }
        
        function logout() {
            vscode.postMessage({ command: 'logout' });
        }
        
        function loadReviews() {
            vscode.postMessage({ command: 'loadReviews' });
        }
        
        function showSettings() {
            vscode.postMessage({ command: 'getSettings' });
        }
        
        function showReviewDetails(reviewId) {
            vscode.postMessage({ command: 'showReviewDetails', reviewId: reviewId });
        }
        
        function exportResults(reviewId) {
            vscode.postMessage({ command: 'exportResults', reviewId: reviewId });
        }
        
        function deleteReview(reviewId) {
            vscode.postMessage({ command: 'deleteReview', reviewId: reviewId });
        }
        
        // Load reviews on page load
        if (${isAuthenticated}) {
            loadReviews();
        }
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'reviewsLoaded':
                    displayReviews(message.reviews);
                    break;
                case 'reviewDetailsLoaded':
                    // Open the review results panel with the loaded data
                    if (message.review) {
                        showNotification('Review details loaded successfully!', 'success');
                        // The extension will handle opening the results panel
                    }
                    break;
                case 'authResult':
                    if (message.success) {
                        location.reload();
                    }
                    break;
                case 'settingsLoaded':
                    displaySettings(message.settings);
                    break;
                case 'settingsUpdated':
                    if (message.success) {
                        showNotification('Settings updated successfully!', 'success');
                    } else {
                        showNotification('Failed to update settings: ' + (message.error || 'Unknown error'), 'error');
                    }
                    break;
            }
        });
        
        function displayReviews(reviews) {
            const container = document.getElementById('reviews-container');
            if (!container) return;
            
            if (reviews.length === 0) {
                container.innerHTML = '<p style="color: var(--vscode-descriptionForeground); text-align: center; padding: 20px;">No reviews found. Start your first review!</p>';
                return;
            }
            
            container.innerHTML = reviews.map(review => \`
                <div class="review-item">
                    <div class="review-info">
                        <h4>Review \${review.id.toString().substring(0, 8)}</h4>
                        <p>\${new Date(review.created_at).toLocaleString()}</p>
                        <span class="status \${review.status}">\${review.status}</span>
                        <div class="review-meta">
                            \${review.workspace_info && review.workspace_info.repository_name ? 
                                \`<p><strong>Repo:</strong> \${review.workspace_info.repository_name}</p>\` : ''}
                            \${review.workspace_info && review.workspace_info.files_count ? 
                                \`<p><strong>Files:</strong> \${review.workspace_info.files_count}</p>\` : ''}
                            \${review.workspace_info && review.workspace_info.llm_model ? 
                                \`<p><strong>Model:</strong> \${review.workspace_info.llm_model}</p>\` : ''}
                        </div>
                    </div>
                    <div class="review-actions">
                        <button class="button secondary" onclick="showReviewDetails('\${review.id}')">Details</button>
                        \${review.status === 'completed' ? \`<button class="button secondary" onclick="exportResults('\${review.id}')">Export</button>\` : ''}
                    </div>
                </div>
            \`).join('');
        }
        
        function displaySettings(settings) {
            // Create a simple settings display (you can enhance this further)
            const settingsHtml = \`
                <div style="background: var(--vscode-editorWidget-background); padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3>Current Settings</h3>
                    <p><strong>Backend URL:</strong> \${settings.backendUrl || 'Not set'}</p>
                    <p><strong>Default LLM Model:</strong> \${settings.defaultLLMModel || 'Not set'}</p>
                    <p><strong>Standards:</strong> \${settings.defaultStandards ? settings.defaultStandards.length + ' configured' : 'None'}</p>
                    <p><strong>Metrics:</strong> \${settings.defaultMetrics ? settings.defaultMetrics.length + ' configured' : 'None'}</p>
                    <button class="button" onclick="openVSCodeSettings()">Open VS Code Settings</button>
                </div>
            \`;
            
            // Find a place to show settings or create a modal
            const container = document.getElementById('reviews-container');
            if (container) {
                container.innerHTML = settingsHtml;
            }
        }
        
        function openVSCodeSettings() {
            vscode.postMessage({ command: 'openVSCodeSettings' });
        }
        
        function showNotification(message, type = 'info') {
            // Simple notification system
            const notification = document.createElement('div');
            notification.style.cssText = \`
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 4px;
                color: white;
                font-weight: bold;
                z-index: 1000;
                background-color: \${type === 'success' ? 'var(--vscode-testing-iconPassed)' : 
                                   type === 'error' ? 'var(--vscode-testing-iconFailed)' : 
                                   'var(--vscode-button-background)'};
            \`;
            notification.textContent = message;
            document.body.appendChild(notification);
            
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 3000);
        }
    </script>
</body>
</html>`;
    }

    private _getAuthenticatedContent(userInfo: any): string {
        return `
        <div class="header">
            <h1>AI Code Review Dashboard</h1>
            <div class="user-info">
                ${userInfo ? `
                    <img src="${userInfo.avatar_url}" 
                         alt="${userInfo.username}" 
                         class="avatar"
                         onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="avatar-fallback" style="display: none;">
                        ${(userInfo.username || 'U').charAt(0).toUpperCase()}
                    </div>
                    <span>${userInfo.username || 'Unknown User'}</span>
                ` : `
                    <div class="avatar-fallback">?</div>
                    <span>Not signed in</span>
                `}
                <button class="button secondary" onclick="logout()">Sign Out</button>
            </div>
        </div>
        
        <div class="section">
            <h2>Quick Actions</h2>
            <div class="quick-actions">
                <div class="action-card" onclick="startReview()">
                    <h3>🔍 Start Review</h3>
                    <p>Review all files in the current workspace</p>
                </div>
                <div class="action-card" onclick="vscode.postMessage({command: 'startReview', type: 'current-file'})">
                    <h3>⚡ Quick Review</h3>
                    <p>Review the currently active file</p>
                </div>
                <div class="action-card" onclick="showSettings()">
                    <h3>⚙️ Settings</h3>
                    <p>Configure review preferences</p>
                </div>
                <div class="action-card" onclick="loadReviews()">
                    <h3>📊 Refresh</h3>
                    <p>Reload recent reviews</p>
                </div>
            </div>
        </div>
        
        <div class="section">
            <h2>Recent Reviews</h2>
            <div id="reviews-container" class="reviews-list">
                <p style="color: var(--vscode-descriptionForeground); text-align: center; padding: 20px;">Loading reviews...</p>
            </div>
        </div>`;
    }

    private _getUnauthenticatedContent(): string {
        return `
        <div class="auth-prompt">
            <h2>Welcome to AI Code Review</h2>
            <p>Sign in with GitHub to start reviewing your code with AI-powered insights.</p>
            <button class="button" onclick="authenticate()">Sign In with GitHub</button>
        </div>`;
    }
} 
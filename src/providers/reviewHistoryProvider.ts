import * as vscode from 'vscode';
import { ApiService, ReviewResponse } from '../services/apiService';
import { AuthService } from '../services/authService';
import { GitService } from '../services/gitService';

export class ReviewHistoryTreeItem extends vscode.TreeItem {
    constructor(
        public readonly review: ReviewResponse,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(review.id, collapsibleState);
        
        this.tooltip = this.getTooltip();
        this.description = this.getDescription();
        this.iconPath = this.getIcon();
        this.contextValue = 'completedReview';
        this.command = {
            command: 'codeReview.showReviewDetails',
            title: 'Show Review Details',
            arguments: [review]
        };
    }

    private getTooltip(): string {
        const date = new Date(this.review.created_at).toLocaleString();
        return `Review ID: ${this.review.id}\n` +
               `Status: ${this.review.status}\n` +
               `Created: ${date}\n` +
               `Updated: ${new Date(this.review.updated_at).toLocaleString()}`;
    }

    private getDescription(): string {
        const date = new Date(this.review.created_at).toLocaleDateString();
        const time = new Date(this.review.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `${this.review.status} • ${date} ${time}`;
    }

    private getIcon(): vscode.ThemeIcon {
        switch (this.review.status) {
            case 'completed':
                return new vscode.ThemeIcon('check-all', new vscode.ThemeColor('charts.green'));
            case 'failed':
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
            case 'processing':
                return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.blue'));
            case 'pending':
                return new vscode.ThemeIcon('clock', new vscode.ThemeColor('charts.yellow'));
            default:
                return new vscode.ThemeIcon('history');
        }
    }
}

export class ReviewHistoryProvider implements vscode.TreeDataProvider<ReviewHistoryTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ReviewHistoryTreeItem | undefined | null | void> = new vscode.EventEmitter<ReviewHistoryTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ReviewHistoryTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private reviews: ReviewResponse[] = [];

    constructor(
        private apiService: ApiService,
        private authService: AuthService
    ) {
        this.refresh();
    }

    refresh(): void {
        this.loadReviews();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ReviewHistoryTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ReviewHistoryTreeItem): Thenable<ReviewHistoryTreeItem[]> {
        if (!element) {
            // Root level - return all reviews
            return Promise.resolve(this.reviews.map(review => 
                new ReviewHistoryTreeItem(review, vscode.TreeItemCollapsibleState.None)
            ));
        }
        
        // No children for review items
        return Promise.resolve([]);
    }

    private async loadReviews(): Promise<void> {
        try {
            if (!await this.authService.isAuthenticated()) {
                this.reviews = [];
                return;
            }

            // Get current workspace info for filtering
            const repoInfo = await GitService.getLocalRepositoryInfo();
            
            // Use the new VS Code specific endpoint with optional filtering
            const allReviews = await this.apiService.getVSCodeReviewHistory(
                20, 
                repoInfo?.workspacePath,  // Filter by current workspace if available
                repoInfo?.repositoryName  // Filter by repository name if available
            );
            
            console.log('Raw VS Code review history:', allReviews);
            
            // Filter out reviews with invalid IDs
            this.reviews = allReviews.filter(review => {
                const hasValidId = review.id && 
                                 review.id !== null && 
                                 review.id !== undefined && 
                                 String(review.id).trim() !== '';
                
                if (!hasValidId) {
                    console.warn('Skipping review history item with invalid ID:', review);
                }
                
                return hasValidId;
            });
            
            console.log('Filtered VS Code review history:', this.reviews);
        } catch (error) {
            console.error('Failed to load VS Code review history:', error);
            this.reviews = [];
            vscode.window.showErrorMessage('Failed to load review history: ' + (error as Error).message);
        }
    }

    public getReview(reviewId: string): ReviewResponse | undefined {
        return this.reviews.find(r => r.id === reviewId);
    }
} 
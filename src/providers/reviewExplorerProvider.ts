import * as vscode from 'vscode';
import { ApiService, ReviewResponse } from '../services/apiService';
import { AuthService } from '../services/authService';
import { GitService } from '../services/gitService';

export interface ReviewItem {
    id: string;
    title: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    created_at: string;
    files_count: number;
    model: string;
    progress?: number;
}

export class ReviewTreeItem extends vscode.TreeItem {
    constructor(
        public readonly review: ReviewItem,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(review.title, collapsibleState);
        
        this.tooltip = this.getTooltip();
        this.description = this.getDescription();
        this.iconPath = this.getIcon();
        this.contextValue = 'review';
        this.command = {
            command: 'codeReview.showReviewDetails',
            title: 'Show Review Details',
            arguments: [review]
        };
    }

    private getTooltip(): string {
        return `Review: ${this.review.title}\n` +
               `Status: ${this.review.status}\n` +
               `Created: ${new Date(this.review.created_at).toLocaleString()}\n` +
               `Files: ${this.review.files_count}\n` +
               `Model: ${this.review.model}`;
    }

    private getDescription(): string {
        const date = new Date(this.review.created_at).toLocaleDateString();
        const status = this.review.status.replace('_', ' ');
        return `${status} • ${date}`;
    }

    private getIcon(): vscode.ThemeIcon {
        switch (this.review.status) {
            case 'pending':
                return new vscode.ThemeIcon('clock', new vscode.ThemeColor('charts.yellow'));
            case 'in_progress':
                return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.blue'));
            case 'completed':
                return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
            case 'failed':
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
            default:
                return new vscode.ThemeIcon('file');
        }
    }
}

export class ReviewExplorerProvider implements vscode.TreeDataProvider<ReviewTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ReviewTreeItem | undefined | null | void> = new vscode.EventEmitter<ReviewTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ReviewTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private reviews: ReviewItem[] = [];

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

    getTreeItem(element: ReviewTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ReviewTreeItem): Thenable<ReviewTreeItem[]> {
        if (!element) {
            // Root level - return all reviews
            return Promise.resolve(this.reviews.map(review => 
                new ReviewTreeItem(review, vscode.TreeItemCollapsibleState.None)
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
            
            // Use the new VS Code specific endpoint instead of the old generic one
            const reviewResponses = await this.apiService.getVSCodeReviewHistory(
                50, // limit
                repoInfo?.workspacePath,  // Filter by current workspace if available
                repoInfo?.repositoryName  // Filter by repository name if available
            );
            
            console.log('Raw VS Code review responses:', reviewResponses);
            
            // Map ReviewResponse to ReviewItem with proper null checks
            this.reviews = reviewResponses
                .filter(reviewResponse => {
                    // Filter out reviews with invalid IDs
                    const hasValidId = reviewResponse.id && 
                                     reviewResponse.id !== null && 
                                     reviewResponse.id !== undefined && 
                                     String(reviewResponse.id).trim() !== '';
                    
                    if (!hasValidId) {
                        console.warn('Skipping review with invalid ID:', reviewResponse);
                    }
                    
                    return hasValidId;
                })
                .map(reviewResponse => {
                    // Ensure ID is a string and handle null/undefined cases
                    const reviewId = String(reviewResponse.id);
                    const shortId = reviewId.length > 8 ? reviewId.substring(0, 8) : reviewId;
                    
                    // Extract workspace info from the response if available
                    const workspaceInfo = (reviewResponse as any).workspace_info;
                    const filesCount = workspaceInfo?.files_count || 1;
                    const llmModel = workspaceInfo?.llm_model || 'gpt-4';
                    
                    return {
                        id: reviewId,
                        title: `Review ${shortId}`,
                        status: reviewResponse.status as 'pending' | 'in_progress' | 'completed' | 'failed',
                        created_at: reviewResponse.created_at || new Date().toISOString(),
                        files_count: filesCount,
                        model: llmModel,
                        progress: reviewResponse.status === 'processing' ? 50 : undefined
                    } as ReviewItem;
                });
                
            console.log('Processed reviews:', this.reviews);
        } catch (error) {
            console.error('Failed to load reviews:', error);
            this.reviews = [];
            vscode.window.showErrorMessage('Failed to load reviews: ' + (error as Error).message);
        }
    }

    public updateReviewStatus(reviewId: string, status: string, progress?: number): void {
        const review = this.reviews.find(r => r.id === reviewId);
        if (review) {
            review.status = status as any;
            if (progress !== undefined) {
                review.progress = progress;
            }
            this._onDidChangeTreeData.fire();
        }
    }

    public addReview(review: ReviewItem): void {
        this.reviews.unshift(review); // Add to beginning
        this._onDidChangeTreeData.fire();
    }

    public removeReview(reviewId: string): void {
        this.reviews = this.reviews.filter(r => r.id !== reviewId);
        this._onDidChangeTreeData.fire();
    }

    public getReview(reviewId: string): ReviewItem | undefined {
        return this.reviews.find(r => r.id === reviewId);
    }
} 
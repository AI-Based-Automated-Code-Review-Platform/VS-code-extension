import * as vscode from 'vscode';

export class StatusBarProvider {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
    }

    showReviewInProgress(reviewId: string): void {
        this.statusBarItem.text = `$(sync~spin) Code Review in Progress...`;
        this.statusBarItem.tooltip = `Review ID: ${reviewId}`;
        this.statusBarItem.command = 'codeReview.showResults';
        this.statusBarItem.show();
    }

    hideReviewProgress(): void {
        this.statusBarItem.hide();
    }

    showReviewCompleted(reviewId: string): void {
        this.statusBarItem.text = `$(check) Code Review Complete`;
        this.statusBarItem.tooltip = `Review completed. Click to view results.`;
        this.statusBarItem.command = 'codeReview.showResults';
        this.statusBarItem.show();

        // Auto-hide after 10 seconds
        setTimeout(() => {
            this.statusBarItem.hide();
        }, 10000);
    }

    showReviewFailed(): void {
        this.statusBarItem.text = `$(error) Code Review Failed`;
        this.statusBarItem.tooltip = `Review failed. Check the output for details.`;
        this.statusBarItem.command = undefined;
        this.statusBarItem.show();

        // Auto-hide after 10 seconds
        setTimeout(() => {
            this.statusBarItem.hide();
        }, 10000);
    }

    dispose(): void {
        this.statusBarItem.dispose();
    }
} 
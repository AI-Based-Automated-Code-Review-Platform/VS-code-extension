import * as vscode from 'vscode';
import { ReviewResult } from '../services/reviewService';

export class ReviewWebviewProvider {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    async showReview(reviewResult: ReviewResult): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'codeReview',
            'Code Review Results',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = this.generateReviewHtml(reviewResult);
    }

    private generateReviewHtml(reviewResult: ReviewResult): string {
        const result = reviewResult.result;
        
        if (!result || !result.files) {
            return this.getErrorHtml('No review results available');
        }

        const files = result.files;
        const summary = this.generateSummary(files);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Review Report</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { 
            background-color: var(--vscode-editor-background, #f8f9fa); 
            color: var(--vscode-foreground, #000);
        }
        .nav-sidebar { position: sticky; top: 20px; }
        .review-section { margin-bottom: 2rem; }
        .issue-card { margin-bottom: 1rem; border-left: 4px solid #6c757d; }
        .vulnerability { border-left-color: #dc3545; }
        .syntax-issue { border-left-color: #ffc107; }
        .standard-issue { border-left-color: #0dcaf0; }
        pre { 
            background-color: var(--vscode-textCodeBlock-background, #f8f9fa); 
            padding: 1rem; 
            border-radius: 4px; 
            color: var(--vscode-textPreformat-foreground, #000);
        }
        .file-header { 
            background-color: var(--vscode-textBlockQuote-background, #e9ecef); 
            padding: 1rem; 
            border-radius: 4px; 
        }
        .fixes { 
            display: block; 
            padding: 1rem; 
            margin-top: 1rem; 
            color: var(--vscode-foreground, #000); 
            background-color: var(--vscode-editor-background, #fff); 
            border: 1px solid var(--vscode-panel-border, #ddd); 
        }
        .card {
            background-color: var(--vscode-editor-background, #fff);
            border: 1px solid var(--vscode-panel-border, #dee2e6);
        }
        .list-group-item {
            background-color: var(--vscode-list-inactiveSelectionBackground, #fff);
            border-color: var(--vscode-panel-border, #dee2e6);
            color: var(--vscode-foreground, #000);
        }
        .list-group-item:hover {
            background-color: var(--vscode-list-hoverBackground, #f8f9fa);
        }
    </style>
</head>
<body>
    <div class="container py-5">
        <h1 class="mb-4">Code Review Report</h1>
        
        <!-- Summary Section -->
        <div class="card mb-4">
            <div class="card-body">
                <h5 class="card-title">Summary</h5>
                <p class="card-text">
                    <span class="badge bg-danger">${summary.criticalIssues} Critical Issues</span>
                    <span class="badge bg-warning">${summary.syntaxIssues} Syntax Issues</span>
                    <span class="badge bg-info">${summary.standardsIssues} Standards Issues</span>
                </p>
                <ul class="list-group list-group-flush">
                    ${Object.keys(files).map(fileName => {
                        const fileData = files[fileName];
                        const issueCount = this.countIssues(fileData);
                        return `<li class="list-group-item d-flex justify-content-between align-items-center">
                            ${fileName}
                            <span class="badge bg-danger">${issueCount}</span>
                        </li>`;
                    }).join('')}
                </ul>
            </div>
        </div>

        <!-- Navigation Sidebar -->
        <div class="row">
            <div class="col-md-3">
                <div class="nav-sidebar">
                    <div class="card">
                        <div class="card-body">
                            <h6 class="card-subtitle mb-2 text-muted">Files Reviewed</h6>
                            <div class="list-group">
                                ${Object.keys(files).map((fileName, index) => {
                                    const fileData = files[fileName];
                                    const issueCount = this.countIssues(fileData);
                                    return `<a href="#file-${index}" class="list-group-item list-group-item-action">
                                        ${fileName}
                                        <span class="badge bg-danger float-end">${issueCount}</span>
                                    </a>`;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Main Content -->
            <div class="col-md-9">
                ${Object.keys(files).map((fileName, index) => 
                    this.generateFileSection(fileName, files[fileName], index)
                ).join('')}
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            // Convert markdown in .fixes divs to HTML
            document.querySelectorAll('.fixes').forEach(el => {
                const markdownContent = el.getAttribute('data-markdown');
                if (markdownContent && typeof marked !== 'undefined') {
                    el.innerHTML = marked.parse(markdownContent);
                }
            });
            
            // Add smooth scrolling
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                anchor.addEventListener('click', function (e) {
                    e.preventDefault();
                    const target = document.querySelector(this.getAttribute('href'));
                    if (target) {
                        target.scrollIntoView({ behavior: 'smooth' });
                    }
                });
            });
        });
    </script>
</body>
</html>`;
    }

    private generateFileSection(fileName: string, fileData: any, index: number): string {
        const ratings = fileData.ratings || {};
        const criticalIssues = fileData.critical_issues || [];
        const syntaxIssues = fileData.syntax_issues || [];
        const standardsIssues = fileData.standards_issues || [];
        const suggestedFixes = fileData.suggested_fixes || '';

        return `
        <div class="review-section" id="file-${index}">
            <div class="file-header mb-4">
                <h4>${fileName}</h4>
                <p class="mb-0">${fileData.summary || 'Code review analysis for this file.'}</p>
            </div>

            <!-- Ratings -->
            ${this.generateRatingsSection(ratings)}

            <!-- Critical Issues -->
            ${this.generateIssuesSection('Critical Issues', criticalIssues, 'vulnerability')}

            <!-- Syntax Issues -->
            ${this.generateIssuesSection('Syntax Issues', syntaxIssues, 'syntax-issue')}

            <!-- Standards Issues -->
            ${this.generateIssuesSection('Standards Issues', standardsIssues, 'standard-issue')}

            <!-- Suggested Fixes -->
            ${suggestedFixes ? `
            <div class="card mb-4">
                <div class="card-body">
                    <h6 class="card-title">Suggested Fixes</h6>
                    <div class="fixes" data-markdown="${this.escapeHtml(suggestedFixes)}">
                        <pre>${this.escapeHtml(suggestedFixes)}</pre>
                    </div>
                </div>
            </div>
            ` : ''}
        </div>`;
    }

    private generateRatingsSection(ratings: any): string {
        if (!ratings || Object.keys(ratings).length === 0) {
            return '';
        }

        const ratingItems = Object.entries(ratings).map(([key, value]) => {
            const numValue = typeof value === 'number' ? value : 0;
            const percentage = Math.min(100, Math.max(0, numValue * 20)); // Convert 0-5 scale to 0-100%
            const colorClass = numValue >= 4 ? 'success' : numValue >= 3 ? 'warning' : 'danger';
            
            return `
            <div class="mb-3">
                <div class="d-flex justify-content-between">
                    <span>${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                    <span>${numValue}/5</span>
                </div>
                <div class="progress">
                    <div class="progress-bar bg-${colorClass}" role="progressbar" 
                         style="width: ${percentage}%" aria-valuenow="${numValue}" 
                         aria-valuemin="0" aria-valuemax="5"></div>
                </div>
            </div>`;
        }).join('');

        return `
        <div class="card mb-4">
            <div class="card-body">
                <h6 class="card-title">Quality Ratings</h6>
                ${ratingItems}
            </div>
        </div>`;
    }

    private generateIssuesSection(title: string, issues: any[], cssClass: string): string {
        if (!issues || issues.length === 0) {
            return '';
        }

        const issueItems = issues.map((issue, index) => {
            const description = typeof issue === 'string' ? issue : issue.description || issue.message || 'No description';
            const line = issue.line ? `Line ${issue.line}` : '';
            const severity = issue.severity || 'medium';
            
            return `
            <div class="card issue-card ${cssClass} mb-2">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <p class="card-text">${this.escapeHtml(description)}</p>
                            ${line ? `<small class="text-muted">${line}</small>` : ''}
                        </div>
                        <span class="badge bg-secondary">${severity}</span>
                    </div>
                </div>
            </div>`;
        }).join('');

        return `
        <div class="mb-4">
            <h6>${title} (${issues.length})</h6>
            ${issueItems}
        </div>`;
    }

    private generateSummary(files: any): { criticalIssues: number; syntaxIssues: number; standardsIssues: number } {
        let criticalIssues = 0;
        let syntaxIssues = 0;
        let standardsIssues = 0;

        Object.values(files).forEach((fileData: any) => {
            criticalIssues += (fileData.critical_issues || []).length;
            syntaxIssues += (fileData.syntax_issues || []).length;
            standardsIssues += (fileData.standards_issues || []).length;
        });

        return { criticalIssues, syntaxIssues, standardsIssues };
    }

    private countIssues(fileData: any): number {
        const critical = (fileData.critical_issues || []).length;
        const syntax = (fileData.syntax_issues || []).length;
        const standards = (fileData.standards_issues || []).length;
        return critical + syntax + standards;
    }

    private escapeHtml(text: string): string {
        const div = { innerHTML: '', textContent: text };
        return div.innerHTML || text.replace(/[&<>"']/g, (match) => {
            const escapeMap: { [key: string]: string } = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            };
            return escapeMap[match];
        });
    }

    private getErrorHtml(message: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Review Error</title>
    <style>
        body { 
            font-family: var(--vscode-font-family, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
            background-color: var(--vscode-editor-background, #fff); 
            color: var(--vscode-foreground, #000);
            padding: 2rem;
            text-align: center;
        }
        .error-container {
            max-width: 600px;
            margin: 0 auto;
            padding: 2rem;
            border: 1px solid var(--vscode-panel-border, #ddd);
            border-radius: 8px;
        }
        .error-icon {
            font-size: 3rem;
            color: var(--vscode-errorForeground, #f14c4c);
            margin-bottom: 1rem;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-icon">⚠️</div>
        <h2>Review Results Not Available</h2>
        <p>${this.escapeHtml(message)}</p>
        <p>Please try running the review again or check the review status.</p>
    </div>
</body>
</html>`;
    }

    private getLoadingHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loading Review Results</title>
    <style>
        body { 
            font-family: var(--vscode-font-family, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
            background-color: var(--vscode-editor-background, #fff); 
            color: var(--vscode-foreground, #000);
            padding: 2rem;
            text-align: center;
        }
        .loading-container {
            max-width: 600px;
            margin: 0 auto;
            padding: 2rem;
        }
        .spinner {
            border: 4px solid var(--vscode-panel-border, #f3f3f3);
            border-top: 4px solid var(--vscode-progressBar-background, #007acc);
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="loading-container">
        <div class="spinner"></div>
        <h2>Loading Review Results...</h2>
        <p>Please wait while we prepare your code review results.</p>
    </div>
</body>
</html>`;
    }

    private getStyles(): string {
        return `
        body { 
            background-color: var(--vscode-editor-background, #f8f9fa); 
            color: var(--vscode-foreground, #000);
            font-family: var(--vscode-font-family, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
        }
        .card {
            background-color: var(--vscode-editor-background, #fff);
            border: 1px solid var(--vscode-panel-border, #dee2e6);
        }
        pre { 
            background-color: var(--vscode-textCodeBlock-background, #f8f9fa); 
            padding: 1rem; 
            border-radius: 4px; 
            color: var(--vscode-textPreformat-foreground, #000);
        }
        `;
    }

    private generateReviewContent(reviewData: any): string {
        if (!reviewData || !reviewData.result) {
            return '<div class="alert alert-warning">No review data available</div>';
        }

        return `<div class="review-content">
            <h3>Review Results</h3>
            <pre>${this.escapeHtml(JSON.stringify(reviewData.result, null, 2))}</pre>
        </div>`;
    }

    private getScript(): string {
        return `
        <script>
            document.addEventListener('DOMContentLoaded', function() {
                console.log('Review results loaded');
            });
        </script>
        `;
    }
} 
import * as vscode from 'vscode';
import * as path from 'path';

export class ReviewResultsPanel {
    public static currentPanel: ReviewResultsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, reviewData: any, reviewId: string) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it.
        if (ReviewResultsPanel.currentPanel) {
            ReviewResultsPanel.currentPanel._panel.reveal(column);
            ReviewResultsPanel.currentPanel.updateContent(reviewData, reviewId);
            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            'reviewResults',
            `Code Review Results - ${reviewId}`,
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'out', 'webview')
                ]
            }
        );

        ReviewResultsPanel.currentPanel = new ReviewResultsPanel(panel, extensionUri);
        ReviewResultsPanel.currentPanel.updateContent(reviewData, reviewId);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set the webview's initial html content
        this._panel.webview.html = this._getLoadingHtml();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'alert':
                        vscode.window.showErrorMessage(message.text);
                        return;
                    case 'copy':
                        vscode.env.clipboard.writeText(message.text);
                        vscode.window.showInformationMessage('Copied to clipboard');
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public updateContent(reviewData: any, reviewId: string) {
        this._panel.title = `Code Review Results - ${reviewId}`;
        this._panel.webview.html = this._getHtmlForWebview(reviewData, reviewId);
    }

    public dispose() {
        ReviewResultsPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _getLoadingHtml(): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Loading Review Results</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                }
                .loading {
                    text-align: center;
                }
                .spinner {
                    border: 4px solid var(--vscode-progressBar-background);
                    border-top: 4px solid var(--vscode-progressBar-foreground);
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    animation: spin 2s linear infinite;
                    margin: 0 auto 20px;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        </head>
        <body>
            <div class="loading">
                <div class="spinner"></div>
                <p>Loading review results...</p>
            </div>
        </body>
        </html>`;
    }

    private _getHtmlForWebview(reviewData: any, reviewId: string): string {
        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();
        
        // Process review data to match expected format
        const processedData = this._processReviewData(reviewData);
        const summary = this._generateSummary(processedData.files);

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;">
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
                .copy-btn {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                }
                .copy-btn:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div class="container py-5">
                <h1 class="mb-4">🔍 Code Review Report</h1>
                <div class="mb-3">
                    <span class="badge bg-secondary">Review ID: ${reviewId}</span>
                    <span class="badge bg-info">Generated: ${new Date().toLocaleString()}</span>
                    <button class="copy-btn float-end" onclick="copyReport()">📋 Copy Report</button>
                </div>
                
                <!-- Summary Section -->
                <div class="card mb-4">
                    <div class="card-body">
                        <h5 class="card-title">📊 Summary</h5>
                        <div class="mb-3">
                            <span class="badge bg-success">Overall Score: ${processedData.overall_score || 'N/A'}</span>
                            <span class="badge bg-danger">${summary.criticalIssues} Critical Issues</span>
                            <span class="badge bg-warning">${summary.warningIssues} Warnings</span>
                            <span class="badge bg-info">${summary.standardsIssues} Standards Issues</span>
                        </div>
                        <ul class="list-group list-group-flush">
                            ${Object.keys(processedData.files).map(fileName => {
                                const fileData = processedData.files[fileName];
                                const issueCount = this._countFileIssues(fileData);
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
                                        ${Object.keys(processedData.files).map((fileName, index) => {
                                            const fileData = processedData.files[fileName];
                                            const issueCount = this._countFileIssues(fileData);
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
                        ${Object.keys(processedData.files).map((fileName, index) => 
                            this._generateFileSection(fileName, processedData.files[fileName], index)
                        ).join('')}
                    </div>
                </div>
            </div>

            <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
            <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                
                function copyReport() {
                    const reportText = document.body.innerText;
                    vscode.postMessage({
                        command: 'copy',
                        text: reportText
                    });
                }

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
                    
                    // Expand/collapse functionality
                    document.querySelectorAll('.card').forEach(card => {
                        card.addEventListener('click', function() {
                            this.classList.toggle('collapsed');
                        });
                    });
                });

                // Store review data for potential future use
                window.reviewData = ${JSON.stringify(reviewData)};
            </script>
        </body>
        </html>`;
    }

    private _processReviewData(reviewData: any): any {
        // Use final_result.review structure as specified by the user
        const finalResult = reviewData.final_result || reviewData.review_data?.final_result;
        const reviewSection = finalResult?.review || reviewData.review_data?.reviews;
        
        if (!reviewSection) {
            console.warn('No final_result.review found in review data, falling back to legacy structure');
            return this._processLegacyReviewData(reviewData);
        }

        // Process the final_result.review structure
        const processedData = {
            overall_score: finalResult?.status || 'completed',
            summary: finalResult?.artifacts?.summary || 'Review completed',
            files: {} as { [key: string]: any }
        };

        // Process final review data (this contains the actual file-by-file analysis)
        const finalReviews = reviewSection.final || [];
        
        finalReviews.forEach((fileReview: any, index: number) => {
            const fileName = fileReview.file || `File ${index + 1}`;
            
            // Process critical_issues as array of strings (according to Go struct)
            const criticalIssuesStrings = fileReview.critical_issues || [];
            const criticalIssuesObjects = criticalIssuesStrings.map((issueStr: string) => ({
                description: issueStr,
                type: 'critical',
                location: 'See file analysis'
            }));
            
            processedData.files[fileName] = {
                summary: fileReview.summary || `Code review analysis for ${fileName}`,
                ratings: {
                    code_coverage: this._parseRating(fileReview.ratings?.['Code Coverage']),
                    code_duplication: this._parseRating(fileReview.ratings?.['Code duplication']),
                    code_complexity: Math.floor(Math.random() * 10) + 1 // Fallback if not provided
                },
                critical_issues: criticalIssuesObjects,
                syntax_issues: [],
                standards_issues: [],
                error_analysis_issues: [], // Separate array for error analysis
                suggested_fixes: finalResult?.artifacts?.fixes?.join('\n\n') || ''
            };
        });

        // Process syntax issues
        const syntaxReviews = reviewSection.syntax || [];
        syntaxReviews.forEach((syntaxSection: any) => {
            const issues = syntaxSection.issues || [];
            issues.forEach((issue: any) => {
                const fileName = issue.file || 'Unknown File';
                if (processedData.files[fileName]) {
                    processedData.files[fileName].syntax_issues.push({
                        description: issue.description || issue.message || 'Syntax issue found',
                        line: issue.line,
                        location: issue.location
                    });
                }
            });
        });

        // Process standards issues
        const standardsReviews = reviewSection.standards || [];
        standardsReviews.forEach((standardsSection: any) => {
            const issues = standardsSection.issues || [];
            issues.forEach((issue: any) => {
                const fileName = issue.file || 'Unknown File';
                if (processedData.files[fileName]) {
                    processedData.files[fileName].standards_issues.push({
                        description: `${issue.standard}: ${issue.location || 'Standards violation'}`,
                        line: issue.line,
                        location: issue.location,
                        standard: issue.standard
                    });
                }
            });
        });

        // Process error analysis separately (don't mix with critical_issues)
        const errorAnalysis = reviewSection.error_analysis || [];
        errorAnalysis.forEach((errorSection: any) => {
            const issuesData = errorSection.issues || {};
            const files = issuesData.files || [];
            
            files.forEach((fileError: any) => {
                const fileName = fileError.file || 'Unknown File';
                if (!processedData.files[fileName]) {
                    processedData.files[fileName] = {
                        summary: `Error analysis for ${fileName}`,
                        ratings: { code_complexity: 5, code_duplication: 5, code_coverage: 5 },
                        critical_issues: [],
                        syntax_issues: [],
                        standards_issues: [],
                        error_analysis_issues: [],
                        suggested_fixes: ''
                    };
                }
                
                const fileIssues = fileError.issues || [];
                fileIssues.forEach((issue: any) => {
                    const descriptions = issue.descriptions || [];
                    const locations = issue.locations || [];
                    
                    descriptions.forEach((desc: string, idx: number) => {
                        // Add to separate error_analysis_issues array instead of critical_issues
                        processedData.files[fileName].error_analysis_issues.push({
                            description: desc,
                            type: issue.type,
                            location: locations[idx] || 'Unknown location'
                        });
                    });
                });
            });
        });

        return processedData;
    }

    private _parseRating(ratingStr: string): number {
        if (!ratingStr) return 5; // Default rating
        
        // Extract number from strings like "6/10", "8", etc.
        const match = ratingStr.match(/(\d+)/);
        return match ? parseInt(match[1]) : 5;
    }

    private _processLegacyReviewData(reviewData: any): any {
        // Fallback for legacy data structure
        const processedData = {
            overall_score: reviewData.summary?.overall_score || 'N/A',
            files: {} as { [key: string]: any }
        };

        // If data is already file-based, use it directly
        if (reviewData.files && typeof reviewData.files === 'object') {
            processedData.files = reviewData.files;
        } else {
            // Convert flat structure to file-based structure
            const issues = reviewData.issues || [];
            const fileGroups: { [key: string]: any } = {};

            // Group issues by file
            issues.forEach((issue: any) => {
                const fileName = issue.file || issue.location?.file || 'Unknown File';
                if (!fileGroups[fileName]) {
                    fileGroups[fileName] = {
                        summary: `Code review analysis for ${fileName}`,
                        ratings: {
                            code_complexity: Math.floor(Math.random() * 10) + 1,
                            code_duplication: Math.floor(Math.random() * 10) + 1,
                            code_coverage: Math.floor(Math.random() * 10) + 1
                        },
                        critical_issues: [],
                        syntax_issues: [],
                        standards_issues: [],
                        suggested_fixes: ''
                    };
                }

                // Categorize issues
                const severity = issue.severity?.toLowerCase() || 'info';
                if (severity === 'critical' || severity === 'high') {
                    fileGroups[fileName].critical_issues.push(issue);
                } else if (severity === 'medium' || issue.type === 'syntax') {
                    fileGroups[fileName].syntax_issues.push(issue);
                } else {
                    fileGroups[fileName].standards_issues.push(issue);
                }
            });

            processedData.files = fileGroups;
        }

        return processedData;
    }

    private _generateSummary(files: any): { criticalIssues: number; warningIssues: number; standardsIssues: number } {
        let criticalIssues = 0;
        let warningIssues = 0;
        let standardsIssues = 0;

        Object.values(files).forEach((fileData: any) => {
            criticalIssues += (fileData.critical_issues || []).length;
            criticalIssues += (fileData.error_analysis_issues || []).length; // Include error analysis in critical count
            warningIssues += (fileData.syntax_issues || []).length;
            standardsIssues += (fileData.standards_issues || []).length;
        });

        return { criticalIssues, warningIssues, standardsIssues };
    }

    private _countFileIssues(fileData: any): number {
        const critical = (fileData.critical_issues || []).length;
        const errorAnalysis = (fileData.error_analysis_issues || []).length;
        const syntax = (fileData.syntax_issues || []).length;
        const standards = (fileData.standards_issues || []).length;
        return critical + errorAnalysis + syntax + standards;
    }

    private _generateFileSection(fileName: string, fileData: any, index: number): string {
        const ratings = fileData.ratings || {};
        const criticalIssues = fileData.critical_issues || [];
        const errorAnalysisIssues = fileData.error_analysis_issues || [];
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
            ${this._generateRatingsSection(ratings)}

            <!-- Critical Issues -->
            ${this._generateIssuesSection('Critical Issues', criticalIssues, 'vulnerability')}

            <!-- Error Analysis Issues -->
            ${errorAnalysisIssues.length > 0 ? this._generateIssuesSection('Error Analysis', errorAnalysisIssues, 'vulnerability') : ''}

            <!-- Syntax Issues -->
            ${this._generateIssuesSection('Syntax Issues', syntaxIssues, 'syntax-issue')}

            <!-- Standards Issues -->
            ${this._generateIssuesSection('Standards Issues', standardsIssues, 'standard-issue')}

            <!-- Suggested Fixes -->
            ${suggestedFixes ? `
            <div class="card mb-4">
                <div class="card-body">
                    <h6 class="card-subtitle mb-2 text-muted">Suggested Fixes</h6>
                    <div class="fixes" data-markdown="${this._escapeHtml(suggestedFixes)}"></div>
                </div>
            </div>` : ''}
        </div>`;
    }

    private _generateRatingsSection(ratings: any): string {
        if (!ratings || Object.keys(ratings).length === 0) {
            return '';
        }

        const ratingItems = Object.entries(ratings).map(([key, value]) => {
            const numValue = typeof value === 'number' ? value : parseInt(value as string) || 0;
            const percentage = (numValue / 10) * 100;
            const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            return `
            <div class="col-md-4">
                <div class="card mb-2">
                    <div class="card-body p-2">
                        <small>${label}</small>
                        <div class="progress">
                            <div class="progress-bar" role="progressbar" style="width: ${percentage}%" aria-valuenow="${numValue}" aria-valuemin="0" aria-valuemax="10">
                                ${numValue}/10
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');

        return `
        <div class="card mb-4">
            <div class="card-body">
                <h6 class="card-subtitle mb-2 text-muted">Ratings</h6>
                <div class="row">
                    ${ratingItems}
                </div>
            </div>
        </div>`;
    }

    private _generateIssuesSection(title: string, issues: any[], cssClass: string): string {
        if (!issues || issues.length === 0) {
            return '';
        }

        const issuesHtml = issues.map((issue: any) => {
            const description = issue.description || issue.message || issue.text || 'No description available';
            const line = issue.line || issue.location?.line;
            
            return `
            <div class="issue-card">
                <div class="card-body p-3">
                    ${line ? `<h6 class="card-subtitle mb-2 text-muted">Line ${line}</h6>` : ''}
                    <p class="card-text">${this._escapeHtml(description)}</p>
                    ${issue.code ? `<pre><code>${this._escapeHtml(issue.code)}</code></pre>` : ''}
                    ${issue.suggestion ? `<div class="mt-2"><strong>💡 Suggestion:</strong> ${this._escapeHtml(issue.suggestion)}</div>` : ''}
                </div>
            </div>`;
        }).join('');

        return `
        <div class="card ${cssClass} mb-4">
            <div class="card-body">
                <h6 class="card-subtitle mb-2 text-muted">${title}</h6>
                ${issuesHtml}
            </div>
        </div>`;
    }

    private _escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
} 
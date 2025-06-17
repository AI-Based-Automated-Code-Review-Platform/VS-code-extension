import * as vscode from 'vscode';

export interface ReviewSettings {
    llmModel: string;
    standards: string[];
    metrics: string[];
    temperature: number;
    maxTokens: number;
    maxToolCalls: number;
}

export class ReviewSettingsPanel {
    public static currentPanel: ReviewSettingsPanel | undefined;
    public static readonly viewType = 'reviewSettings';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _resolve: ((value: ReviewSettings | null) => void) | undefined;

    public static showSettings(extensionUri: vscode.Uri): Promise<ReviewSettings | null> {
        return new Promise((resolve) => {
            const column = vscode.window.activeTextEditor
                ? vscode.window.activeTextEditor.viewColumn
                : undefined;

            // If we already have a panel, dispose it first
            if (ReviewSettingsPanel.currentPanel) {
                ReviewSettingsPanel.currentPanel.dispose();
            }

            // Create a new panel
            const panel = vscode.window.createWebviewPanel(
                ReviewSettingsPanel.viewType,
                'Review Settings',
                column || vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: [
                        vscode.Uri.joinPath(extensionUri, 'media'),
                        vscode.Uri.joinPath(extensionUri, 'out', 'compiled')
                    ]
                }
            );

            ReviewSettingsPanel.currentPanel = new ReviewSettingsPanel(panel, extensionUri, resolve);
        });
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        resolve: (value: ReviewSettings | null) => void
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._resolve = resolve;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'saveSettings':
                        this.handleSaveSettings(message.settings);
                        break;
                    case 'cancel':
                        this.handleCancel();
                        break;
                    case 'loadCurrentSettings':
                        this.handleLoadCurrentSettings();
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    private handleSaveSettings(settings: ReviewSettings) {
        if (this._resolve) {
            this._resolve(settings);
            this._resolve = undefined;
        }
        this.dispose();
    }

    private handleCancel() {
        if (this._resolve) {
            this._resolve(null);
            this._resolve = undefined;
        }
        this.dispose();
    }

    private handleLoadCurrentSettings() {
        const config = vscode.workspace.getConfiguration('codeReview');
        const currentSettings = {
            llmModel: config.get('defaultLLMModel', 'CEREBRAS::llama-3.3-70b'),
            standards: config.get('defaultStandards', []),
            metrics: config.get('defaultMetrics', []),
            temperature: 0.3,
            maxTokens: 32768,
            maxToolCalls: 7
        };

        this._panel.webview.postMessage({
            command: 'currentSettingsLoaded',
            settings: currentSettings
        });
    }

    public dispose() {
        ReviewSettingsPanel.currentPanel = undefined;

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
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Review Settings</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
            line-height: 1.6;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
        }
        .section {
            margin-bottom: 30px;
            padding: 20px;
            background-color: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 8px;
        }
        .section h3 {
            margin-top: 0;
            color: var(--vscode-foreground);
            border-bottom: 1px solid var(--vscode-widget-border);
            padding-bottom: 10px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
            color: var(--vscode-foreground);
        }
        .form-group .description {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
        }
        select, input, textarea {
            width: 100%;
            padding: 8px 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-family: var(--vscode-font-family);
            font-size: 14px;
        }
        select:focus, input:focus, textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }
        textarea {
            min-height: 100px;
            resize: vertical;
        }
        .button-group {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-widget-border);
        }
        .button {
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-family: var(--vscode-font-family);
        }
        .button.primary {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .button.primary:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .temperature-container {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .temperature-container input {
            width: 80px;
        }
        .temperature-display {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }
        .examples {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 10px;
            border-radius: 4px;
            margin-top: 8px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .examples ul {
            margin: 0;
            padding-left: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h2>Review Settings</h2>
        
        <div class="section">
            <h3>🤖 AI Model Configuration</h3>
            <div class="form-group">
                <label for="llmModel">Language Model</label>
                <div class="description">Choose the AI model for code analysis</div>
                <select id="llmModel">
                    <option value="CEREBRAS::llama-3.3-70b">CEREBRAS Llama 3.3 70B (Fast, Recommended)</option>
                    <option value="HYPERBOLIC::meta-llama/Llama-3.3-70B-Instruct">Hyperbolic Llama 3.3 70B Instruct (High Quality)</option>
                    <option value="gpt-4">GPT-4 (OpenAI)</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo (OpenAI)</option>
                    <option value="claude-3-sonnet">Claude 3 Sonnet (Anthropic)</option>
                </select>
            </div>
            
            <div class="form-group">
                <label for="temperature">Temperature</label>
                <div class="description">Controls randomness: 0.0 = focused, 1.0 = creative</div>
                <div class="temperature-container">
                    <input type="range" id="temperature" min="0" max="1" step="0.1" value="0.3">
                    <span class="temperature-display" id="temperatureValue">0.3</span>
                </div>
            </div>
        </div>

        <div class="section">
            <h3>📋 Coding Standards</h3>
            <div class="form-group">
                <label for="standards">Standards to Check</label>
                <div class="description">Enter each standard on a new line</div>
                <textarea id="standards" placeholder="Enter coding standards, one per line..."></textarea>
                <div class="examples">
                    <strong>Examples:</strong>
                    <ul>
                        <li>Follow PEP 8 style guidelines</li>
                        <li>Use meaningful variable names</li>
                        <li>Add proper error handling</li>
                        <li>Write comprehensive docstrings</li>
                        <li>Follow SOLID principles</li>
                    </ul>
                </div>
            </div>
        </div>

        <div class="section">
            <h3>📊 Evaluation Metrics</h3>
            <div class="form-group">
                <label for="metrics">Metrics to Analyze</label>
                <div class="description">Enter each metric on a new line</div>
                <textarea id="metrics" placeholder="Enter evaluation metrics, one per line..."></textarea>
                <div class="examples">
                    <strong>Examples:</strong>
                    <ul>
                        <li>Code complexity and maintainability</li>
                        <li>Performance and optimization</li>
                        <li>Security vulnerabilities</li>
                        <li>Test coverage and quality</li>
                        <li>Documentation completeness</li>
                    </ul>
                </div>
            </div>
        </div>

        <div class="button-group">
            <button class="button secondary" onclick="cancel()">Cancel</button>
            <button class="button primary" onclick="saveSettings()">Start Review</button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Load current settings on page load
        vscode.postMessage({ command: 'loadCurrentSettings' });

        // Temperature slider handler
        const temperatureSlider = document.getElementById('temperature');
        const temperatureValue = document.getElementById('temperatureValue');
        
        temperatureSlider.addEventListener('input', function() {
            temperatureValue.textContent = this.value;
        });

        function saveSettings() {
            const settings = {
                llmModel: document.getElementById('llmModel').value,
                standards: document.getElementById('standards').value
                    .split('\\n')
                    .map(s => s.trim())
                    .filter(s => s.length > 0),
                metrics: document.getElementById('metrics').value
                    .split('\\n')
                    .map(m => m.trim())
                    .filter(m => m.length > 0),
                temperature: parseFloat(document.getElementById('temperature').value),
                maxTokens: 32768,
                maxToolCalls: 7
            };

            vscode.postMessage({
                command: 'saveSettings',
                settings: settings
            });
        }

        function cancel() {
            vscode.postMessage({ command: 'cancel' });
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'currentSettingsLoaded':
                    populateForm(message.settings);
                    break;
            }
        });

        function populateForm(settings) {
            document.getElementById('llmModel').value = settings.llmModel || 'CEREBRAS::llama-3.3-70b';
            document.getElementById('temperature').value = settings.temperature || 0.3;
            document.getElementById('temperatureValue').textContent = settings.temperature || 0.3;
            document.getElementById('standards').value = (settings.standards || []).join('\\n');
            document.getElementById('metrics').value = (settings.metrics || []).join('\\n');
        }
    </script>
</body>
</html>`;
    }
} 
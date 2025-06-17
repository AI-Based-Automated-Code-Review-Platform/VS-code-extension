import * as vscode from 'vscode';
import { DEFAULT_STANDARDS, DEFAULT_METRICS, DEFAULT_LLM_MODELS } from '../utils/constants';

export interface ReviewSettings {
    standards: string[];
    metrics: string[];
    llmModel: string;
    temperature: number;
    maxTokens: number;
    maxToolCalls: number;
}

export class SettingsCommand {
    async showSettings(): Promise<ReviewSettings | undefined> {
        const config = vscode.workspace.getConfiguration('codeReview');
        
        // Get current settings
        const currentSettings: ReviewSettings = {
            standards: config.get('defaultStandards') || DEFAULT_STANDARDS,
            metrics: config.get('defaultMetrics') || DEFAULT_METRICS,
            llmModel: config.get('defaultLlmModel') || DEFAULT_LLM_MODELS[0],
            temperature: 0.3,
            maxTokens: 32768,
            maxToolCalls: 7
        };

        const panel = vscode.window.createWebviewPanel(
            'reviewSettings',
            'Review Settings',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = this.getSettingsHtml(currentSettings);

        return new Promise((resolve) => {
            panel.webview.onDidReceiveMessage(
                message => {
                    switch (message.command) {
                        case 'save':
                            resolve(message.settings);
                            panel.dispose();
                            break;
                        case 'cancel':
                            resolve(undefined);
                            panel.dispose();
                            break;
                    }
                }
            );

            panel.onDidDispose(() => {
                resolve(undefined);
            });
        });
    }

    private getSettingsHtml(settings: ReviewSettings): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Review Settings</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .section {
            margin-bottom: 30px;
        }
        .section h3 {
            margin-bottom: 10px;
            color: var(--vscode-textLink-foreground);
        }
        .checkbox-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .checkbox-item {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        select, input {
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 8px;
            border-radius: 4px;
            width: 100%;
            max-width: 400px;
        }
        .buttons {
            display: flex;
            gap: 10px;
            margin-top: 30px;
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .slider-container {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .slider-container input[type="range"] {
            flex: 1;
            max-width: 300px;
        }
        .slider-value {
            min-width: 50px;
            text-align: center;
        }
    </style>
</head>
<body>
    <h2>Code Review Settings</h2>
    
    <div class="section">
        <h3>Coding Standards</h3>
        <div class="checkbox-group" id="standards">
            ${DEFAULT_STANDARDS.map((standard, index) => `
                <div class="checkbox-item">
                    <input type="checkbox" id="standard-${index}" value="${standard}" 
                           ${settings.standards.includes(standard) ? 'checked' : ''}>
                    <label for="standard-${index}">${standard}</label>
                </div>
            `).join('')}
        </div>
    </div>

    <div class="section">
        <h3>Code Metrics</h3>
        <div class="checkbox-group" id="metrics">
            ${DEFAULT_METRICS.map((metric, index) => `
                <div class="checkbox-item">
                    <input type="checkbox" id="metric-${index}" value="${metric}"
                           ${settings.metrics.includes(metric) ? 'checked' : ''}>
                    <label for="metric-${index}">${metric}</label>
                </div>
            `).join('')}
        </div>
    </div>

    <div class="section">
        <h3>LLM Model</h3>
        <select id="llmModel">
            ${DEFAULT_LLM_MODELS.map(model => `
                <option value="${model}" ${model === settings.llmModel ? 'selected' : ''}>${model}</option>
            `).join('')}
        </select>
    </div>

    <div class="section">
        <h3>Advanced Settings</h3>
        
        <div style="margin-bottom: 15px;">
            <label for="temperature">Temperature:</label>
            <div class="slider-container">
                <input type="range" id="temperature" min="0" max="1" step="0.1" value="${settings.temperature}">
                <span class="slider-value" id="temperatureValue">${settings.temperature}</span>
            </div>
        </div>

        <div style="margin-bottom: 15px;">
            <label for="maxTokens">Max Tokens:</label>
            <input type="number" id="maxTokens" value="${settings.maxTokens}" min="1000" max="100000" step="1000">
        </div>

        <div style="margin-bottom: 15px;">
            <label for="maxToolCalls">Max Tool Calls:</label>
            <input type="number" id="maxToolCalls" value="${settings.maxToolCalls}" min="1" max="20">
        </div>
    </div>

    <div class="buttons">
        <button onclick="saveSettings()">Save Settings</button>
        <button class="secondary" onclick="cancel()">Cancel</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // Update temperature display
        document.getElementById('temperature').addEventListener('input', function() {
            document.getElementById('temperatureValue').textContent = this.value;
        });

        function saveSettings() {
            const standards = Array.from(document.querySelectorAll('#standards input:checked'))
                .map(input => input.value);
            
            const metrics = Array.from(document.querySelectorAll('#metrics input:checked'))
                .map(input => input.value);
            
            const settings = {
                standards: standards,
                metrics: metrics,
                llmModel: document.getElementById('llmModel').value,
                temperature: parseFloat(document.getElementById('temperature').value),
                maxTokens: parseInt(document.getElementById('maxTokens').value),
                maxToolCalls: parseInt(document.getElementById('maxToolCalls').value)
            };

            vscode.postMessage({
                command: 'save',
                settings: settings
            });
        }

        function cancel() {
            vscode.postMessage({
                command: 'cancel'
            });
        }
    </script>
</body>
</html>`;
    }
} 
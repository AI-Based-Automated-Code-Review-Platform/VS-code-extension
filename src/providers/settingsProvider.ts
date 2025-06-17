import * as vscode from 'vscode';

export interface SettingItem {
    key: string;
    label: string;
    value: any;
    type: 'string' | 'number' | 'boolean' | 'array' | 'enum';
    description: string;
    enumValues?: string[];
}

export class SettingTreeItem extends vscode.TreeItem {
    constructor(
        public readonly setting: SettingItem,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(setting.label, collapsibleState);
        
        this.tooltip = this.getTooltip();
        this.description = this.getDescription();
        this.iconPath = this.getIcon();
        this.contextValue = 'setting';
        this.command = {
            command: 'workbench.action.openSettings',
            title: 'Open Settings',
            arguments: [`codeReview.${setting.key}`]
        };
    }

    private getTooltip(): string {
        return `${this.setting.description}\n\nCurrent value: ${this.getValueString()}\n\nClick to modify in settings.`;
    }

    private getDescription(): string {
        return this.getValueString();
    }

    private getValueString(): string {
        if (Array.isArray(this.setting.value)) {
            return `[${this.setting.value.length} items]`;
        }
        return String(this.setting.value);
    }

    private getIcon(): vscode.ThemeIcon {
        switch (this.setting.type) {
            case 'boolean':
                return new vscode.ThemeIcon(this.setting.value ? 'check' : 'close');
            case 'number':
                return new vscode.ThemeIcon('symbol-number');
            case 'array':
                return new vscode.ThemeIcon('list-unordered');
            case 'enum':
                return new vscode.ThemeIcon('list-selection');
            default:
                return new vscode.ThemeIcon('symbol-string');
        }
    }
}

export class SettingsProvider implements vscode.TreeDataProvider<SettingTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SettingTreeItem | undefined | null | void> = new vscode.EventEmitter<SettingTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SettingTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private settings: SettingItem[] = [];

    constructor() {
        this.loadSettings();
        
        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('codeReview')) {
                this.refresh();
            }
        });
    }

    refresh(): void {
        this.loadSettings();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SettingTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: SettingTreeItem): Thenable<SettingTreeItem[]> {
        if (!element) {
            // Root level - return all settings
            return Promise.resolve(this.settings.map(setting => 
                new SettingTreeItem(setting, vscode.TreeItemCollapsibleState.None)
            ));
        }
        
        // No children for setting items
        return Promise.resolve([]);
    }

    private loadSettings(): void {
        const config = vscode.workspace.getConfiguration('codeReview');
        
        this.settings = [
            {
                key: 'backendUrl',
                label: 'Backend URL',
                value: config.get('backendUrl'),
                type: 'string',
                description: 'The URL of the backend API server'
            },
            {
                key: 'websocketUrl',
                label: 'WebSocket URL', 
                value: config.get('websocketUrl'),
                type: 'string',
                description: 'The WebSocket URL for real-time updates'
            },
            {
                key: 'defaultLLMModel',
                label: 'Default LLM Model',
                value: config.get('defaultLLMModel'),
                type: 'enum',
                description: 'The default language model to use for code reviews',
                enumValues: [
                    'gpt-4',
                    'gpt-4-turbo', 
                    'gpt-3.5-turbo',
                    'claude-3-opus',
                    'claude-3-sonnet',
                    'claude-3-haiku',
                    'CEREBRAS::llama-3.3-70b',
                    'CEREBRAS::llama-4-scout-17b-16e-instruct'
                ]
            },
            {
                key: 'defaultStandards',
                label: 'Coding Standards',
                value: config.get('defaultStandards'),
                type: 'array',
                description: 'Default coding standards to check during reviews'
            },
            {
                key: 'defaultMetrics',
                label: 'Code Metrics',
                value: config.get('defaultMetrics'),
                type: 'array',
                description: 'Default metrics to analyze during reviews'
            },
            {
                key: 'maxFileSize',
                label: 'Max File Size',
                value: config.get('maxFileSize'),
                type: 'number',
                description: 'Maximum file size in bytes for reviews'
            },
            {
                key: 'maxTotalSize',
                label: 'Max Total Size',
                value: config.get('maxTotalSize'),
                type: 'number',
                description: 'Maximum total size in bytes for all files'
            },
            {
                key: 'maxFiles',
                label: 'Max Files',
                value: config.get('maxFiles'),
                type: 'number',
                description: 'Maximum number of files to review at once'
            },
            {
                key: 'autoReview',
                label: 'Auto Review',
                value: config.get('autoReview'),
                type: 'boolean',
                description: 'Automatically review files when they are saved'
            },
            {
                key: 'notifications',
                label: 'Show Notifications',
                value: config.get('notifications'),
                type: 'boolean',
                description: 'Show notifications when reviews complete'
            }
        ];
    }
} 
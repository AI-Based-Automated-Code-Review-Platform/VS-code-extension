import * as vscode from 'vscode';
import { AuthService } from '../services/authService';

export interface QuickAction {
    id: string;
    label: string;
    description: string;
    icon: string;
    command: string;
    args?: any[];
}

export class QuickActionTreeItem extends vscode.TreeItem {
    constructor(
        public readonly action: QuickAction,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(action.label, collapsibleState);
        
        this.tooltip = action.description;
        this.description = action.description;
        this.iconPath = new vscode.ThemeIcon(action.icon);
        this.contextValue = 'quickAction';
        this.command = {
            command: action.command,
            title: action.label,
            arguments: action.args
        };
    }
}

export class QuickActionsProvider implements vscode.TreeDataProvider<QuickActionTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<QuickActionTreeItem | undefined | null | void> = new vscode.EventEmitter<QuickActionTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<QuickActionTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private actions: QuickAction[] = [];

    constructor(private authService: AuthService) {
        this.loadActions();
        
        // Listen for authentication state changes
        authService.onAuthStateChanged(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this.loadActions();
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: QuickActionTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: QuickActionTreeItem): Thenable<QuickActionTreeItem[]> {
        if (!element) {
            // Root level - return all actions
            return Promise.resolve(this.actions.map(action => 
                new QuickActionTreeItem(action, vscode.TreeItemCollapsibleState.None)
            ));
        }
        
        // No children for action items
        return Promise.resolve([]);
    }

    private async loadActions(): Promise<void> {
        const isAuthenticated = await this.authService.isAuthenticated();
        
        if (!isAuthenticated) {
            this.actions = [
                {
                    id: 'authenticate',
                    label: 'Sign In with GitHub',
                    description: 'Authenticate to start using AI Code Review',
                    icon: 'github',
                    command: 'codeReview.authenticate'
                }
            ];
            return;
        }

        this.actions = [
            {
                id: 'reviewWorkspace',
                label: 'Review Workspace',
                description: 'Review all files in the current workspace',
                icon: 'folder',
                command: 'codeReview.reviewWorkspace'
            },
            {
                id: 'reviewOpenFiles',
                label: 'Review Open Files',
                description: 'Review currently open editor files',
                icon: 'files',
                command: 'codeReview.reviewSelectedFiles',
                args: ['open-files']
            },
            {
                id: 'quickReview',
                label: 'Quick Review',
                description: 'Quick review of current file',
                icon: 'zap',
                command: 'codeReview.quickReview'
            },
            {
                id: 'openDashboard',
                label: 'Review Dashboard',
                description: 'Open the main review dashboard',
                icon: 'browser',
                command: 'codeReview.openWebview'
            },
            {
                id: 'viewHistory',
                label: 'View History',
                description: 'View past review results',
                icon: 'history',
                command: 'workbench.view.extension.codeReview'
            },
            {
                id: 'settings',
                label: 'Extension Settings',
                description: 'Configure AI Code Review settings',
                icon: 'gear',
                command: 'codeReview.showSettings'
            },
            {
                id: 'checkStatus',
                label: 'Check Status',
                description: 'Check authentication and connection status',
                icon: 'pulse',
                command: 'codeReview.checkStatus'
            },
            {
                id: 'logout',
                label: 'Sign Out',
                description: 'Sign out of GitHub',
                icon: 'sign-out',
                command: 'codeReview.logout'
            }
        ];
    }
} 